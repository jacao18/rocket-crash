/**
 * GET /api/admin-stats
 *
 * Reads all BetPlaced, Payout and Crashed events from the contract,
 * fetches block timestamps, and returns total + per-day aggregated stats.
 * Protected: only the owner address may call this.
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

const BET_PLACED_ABI = parseAbiItem('event BetPlaced(address indexed player, uint256 amount)')
const PAYOUT_ABI     = parseAbiItem('event Payout(address indexed player, uint256 betAmount, uint256 multX100, uint256 payout)')
const CRASHED_ABI    = parseAbiItem('event Crashed(address indexed player, uint256 betAmount)')

// Fetch block timestamps in batches to avoid overwhelming the RPC
async function getBlockTimestamps(client, blockNumbers) {
  const unique = [...new Set(blockNumbers.map(String))]
  const BATCH  = 20
  const map    = {}

  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH)
    const blocks = await Promise.all(
      slice.map(n => client.getBlock({ blockNumber: BigInt(n), includeTransactions: false }))
    )
    blocks.forEach((b, idx) => { map[slice[idx]] = Number(b.timestamp) })
  }
  return map
}

function toDateKey(ts) {
  // Returns "YYYY-MM-DD" in UTC
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = (req.query.address || '').toLowerCase()
  if (caller !== OWNER_ADDRESS) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const client = createPublicClient({ chain: minatoTestnet, transport: http() })

    const latestBlock = await client.getBlockNumber()
    const fromBlock   = process.env.CONTRACT_DEPLOY_BLOCK
      ? BigInt(process.env.CONTRACT_DEPLOY_BLOCK)
      : latestBlock - 50000n

    // ── Fetch all event logs in parallel
    const [betLogs, payoutLogs, crashLogs] = await Promise.all([
      client.getLogs({ address: CONTRACT_ADDRESS, event: BET_PLACED_ABI, fromBlock, toBlock: 'latest' }),
      client.getLogs({ address: CONTRACT_ADDRESS, event: PAYOUT_ABI,     fromBlock, toBlock: 'latest' }),
      client.getLogs({ address: CONTRACT_ADDRESS, event: CRASHED_ABI,    fromBlock, toBlock: 'latest' }),
    ])

    // ── Collect all unique block numbers we need timestamps for
    const allBlockNums = [
      ...betLogs.map(l => l.blockNumber),
      ...payoutLogs.map(l => l.blockNumber),
      ...crashLogs.map(l => l.blockNumber),
    ]
    const tsMap = await getBlockTimestamps(client, allBlockNums)

    // ── Build rounds list with timestamps
    const rounds = []

    for (const log of payoutLogs) {
      const ts = tsMap[log.blockNumber.toString()] || 0
      rounds.push({
        type:      'win',
        player:    log.args.player,
        betAmount: formatEther(log.args.betAmount),
        mult:      (Number(log.args.multX100) / 100).toFixed(2),
        payout:    formatEther(log.args.payout),
        txHash:    log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        timestamp: ts,
        date:      toDateKey(ts),
      })
    }
    for (const log of crashLogs) {
      const ts = tsMap[log.blockNumber.toString()] || 0
      rounds.push({
        type:      'crash',
        player:    log.args.player,
        betAmount: formatEther(log.args.betAmount),
        mult:      null,
        payout:    '0',
        txHash:    log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        timestamp: ts,
        date:      toDateKey(ts),
      })
    }

    rounds.sort((a, b) => b.timestamp - a.timestamp)

    // ── Total stats
    const totalVolume   = betLogs.reduce((acc, l) => acc + l.args.amount, 0n)
    const totalPayouts  = payoutLogs.reduce((acc, l) => acc + l.args.payout, 0n)
    const houseProfit   = totalVolume > totalPayouts ? totalVolume - totalPayouts : 0n
    const uniquePlayers = new Set(betLogs.map(l => l.args.player.toLowerCase())).size

    // ── Per-day stats (keyed by YYYY-MM-DD)
    // We use betLogs for volume/bets-per-day, payoutLogs for wins, crashLogs for crashes
    const dayMap = {}

    const ensureDay = (date) => {
      if (!dayMap[date]) {
        dayMap[date] = { date, bets: 0, wins: 0, crashes: 0, volumeWei: 0n, payoutsWei: 0n }
      }
      return dayMap[date]
    }

    for (const log of betLogs) {
      const ts   = tsMap[log.blockNumber.toString()] || 0
      const day  = ensureDay(toDateKey(ts))
      day.bets++
      day.volumeWei += log.args.amount
    }
    for (const log of payoutLogs) {
      const ts  = tsMap[log.blockNumber.toString()] || 0
      const day = ensureDay(toDateKey(ts))
      day.wins++
      day.payoutsWei += log.args.payout
    }
    for (const log of crashLogs) {
      const ts  = tsMap[log.blockNumber.toString()] || 0
      const day = ensureDay(toDateKey(ts))
      day.crashes++
    }

    // Serialize BigInt fields and compute profit per day
    const dailyStats = Object.values(dayMap)
      .map(d => ({
        date:           d.date,
        bets:           d.bets,
        wins:           d.wins,
        crashes:        d.crashes,
        volumeEth:      formatEther(d.volumeWei),
        payoutsEth:     formatEther(d.payoutsWei),
        profitEth:      formatEther(d.volumeWei > d.payoutsWei ? d.volumeWei - d.payoutsWei : 0n),
        uniquePlayers:  new Set(
          betLogs
            .filter(l => toDateKey(tsMap[l.blockNumber.toString()] || 0) === d.date)
            .map(l => l.args.player.toLowerCase())
        ).size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)) // most recent first

    return res.status(200).json({
      // Totals
      totalBets:       betLogs.length,
      totalWins:       payoutLogs.length,
      totalCrashes:    crashLogs.length,
      uniquePlayers,
      totalVolumeEth:  formatEther(totalVolume),
      totalPayoutsEth: formatEther(totalPayouts),
      houseProfitEth:  formatEther(houseProfit),
      // Per-day
      dailyStats,
      // Recent rounds
      rounds: rounds.slice(0, 100),
    })
  } catch (err) {
    console.error('[admin-stats] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
