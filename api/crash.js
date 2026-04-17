/**
 * POST /api/crash
 * Body: { player: "0x...", betAmount: "0.005" }
 *
 * Called when the rocket crashes with an active bet.
 * Calls registerCrash() on the contract (emits event, bet stays in vault).
 */
import { parseEther } from 'viem'
import { getOwnerWalletClient, getPublicClient, ROCKET_CRASH_ABI, CONTRACT_ADDRESS } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { player, betAmount } = req.body

  if (!player || !betAmount) {
    return res.status(400).json({ error: 'Missing player or betAmount' })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(player)) {
    return res.status(400).json({ error: 'Invalid player address' })
  }

  try {
    const walletClient = getOwnerWalletClient()
    const publicClient = getPublicClient()

    const betWei = parseEther(String(betAmount))

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: ROCKET_CRASH_ABI,
      functionName: 'registerCrash',
      args: [player, betWei],
      account: walletClient.account,
    })

    const txHash = await walletClient.writeContract(request)
    console.log(`[crash] registered — player: ${player}, betAmount: ${betAmount} ETH, tx: ${txHash}`)

    return res.status(200).json({ ok: true, txHash })
  } catch (err) {
    console.error('[crash] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
