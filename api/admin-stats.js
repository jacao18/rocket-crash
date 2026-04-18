/**
 * GET /api/admin-stats
 *
 * Reads all BetPlaced, Payout and Crashed events from the contract
 * and returns aggregated stats. Protected: only the owner address
 * may call this (checked via ?address= query param — frontend sends
 * the connected wallet address, backend verifies against OWNER_ADDRESS).
 */
import { createPublicClient, http, defineChain, formatEther, parseAbiItem } from 'viem'

const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org/'] } },
})

const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS || '0x03670B7279D0Db9f6207b6E79D17577f09Bfed0e'
const OWNER_ADDRESS    = (process.env.OWNER_ADDRESS || '0xd41D6fDD91d3c39d3AC29745f68548843598D572').toLowerCase()

// ABIs for each event
const BET_PLACED_ABI = parseAbiItem('event BetPlaced(address indexed player, uint256 amount)')
const PAYOUT_ABI     = parseAbiItem('event Payout(address indexed player, uint256 betAmount, uint256 multX100, uint256 payout)')
const CRASHED_ABI    = parseAbiItem('event Crashed(address indexed player, uint256 betAmount)')

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth: verify caller is owner
  const caller = (req.query.address || '').toLowerCase()
  if (caller !== OWNER_ADDRESS) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const client = createPublicClient({ chain: minatoTestnet, transport: http() })

    // Fetch all logs in parallel
    const [betLogs, payoutLogs, crashLogs] = await Promise.all([
      client.getLogs({ address: CONTRACT_ADDRESS, event: BET_PLACED_ABI, fromBlock: 0n, toBlock: 'latest' }),
      client.getLogs({ address: CONTRACT_ADDRESS, event: PAYOUT_ABI,     fromBlock: 0n, toBlock: 'latest' }),
      client.getLogs({ address: CONTRACT_ADDRESS, event: CRASHED_ABI,    fromBlock: 0n, toBlock: 'latest' }),
    ])

    // Aggregate stats
    const totalVolume  = betLogs.reduce((acc, l) => acc + l.args.amount, 0n)
    const totalPayouts = payoutLogs.reduce((acc, l) => acc + l.args.payout, 0n)
    const uniquePlayers = new Set([
      ...betLogs.map(l => l.args.player.toLowerCase()),
    ]).size

    const houseProfit = totalVolume - totalPayouts

    // Build rounds list (join bets with outcomes)
    // Key bets by txHash so we can match with payout/crash in same tx or block
    const rounds = []

    // Map payout events by player for quick lookup (last payout per player — simplistic)
    const payoutByTx = new Map(payoutLogs.map(l => [l.transactionHash, l]))
    const crashByTx  = new Map(crashLogs.map(l => [l.transactionHash, l]))

    // Each BetPlaced = one round entry; outcome comes from a later tx
    // We'll show them separately: wins and losses
    for (const log of payoutLogs) {
      rounds.push({
        type: 'win',
        player: log.args.player,
        betAmount: formatEther(log.args.betAmount),
        mult: (Number(log.args.multX100) / 100).toFixed(2),
        payout: formatEther(log.args.payout),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
      })
    }
    for (const log of crashLogs) {
      rounds.push({
        type: 'crash',
        player: log.args.player,
        betAmount: formatEther(log.args.betAmount),
        mult: null,
        payout: '0',
        txHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
      })
    }

    // Sort by block descending
    rounds.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))

    return res.status(200).json({
      totalBets:      betLogs.length,
      totalWins:      payoutLogs.length,
      totalCrashes:   crashLogs.length,
      uniquePlayers,
      totalVolumeEth: formatEther(totalVolume),
      totalPayoutsEth: formatEther(totalPayouts),
      houseProfitEth:  formatEther(houseProfit > 0n ? houseProfit : 0n),
      rounds: rounds.slice(0, 100), // last 100 rounds
    })
  } catch (err) {
    console.error('[admin-stats] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
