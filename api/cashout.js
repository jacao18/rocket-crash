/**
 * POST /api/cashout
 * Body: { player: "0x...", multX100: 245 }
 *   multX100 = Math.round(currentMult * 100), e.g. 2.45x → 245
 *
 * Validates the bet is active, then calls payout() on the contract
 * using the owner's private key.
 */
import { activeBets, getOwnerWalletClient, getPublicClient, ROCKET_CRASH_ABI, CONTRACT_ADDRESS } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { player, multX100 } = req.body

  if (!player || multX100 == null) {
    return res.status(400).json({ error: 'Missing player or multX100' })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(player)) {
    return res.status(400).json({ error: 'Invalid player address' })
  }

  const mult = Number(multX100)
  if (!Number.isInteger(mult) || mult < 80 || mult > 1000) {
    return res.status(400).json({ error: 'Invalid multX100 (must be 80–1000)' })
  }

  const key = player.toLowerCase()
  const bet = activeBets.get(key)
  if (!bet) {
    return res.status(400).json({ error: 'No active bet for this player' })
  }

  // Remove from active bets immediately to prevent double-cashout
  activeBets.delete(key)

  try {
    const walletClient = getOwnerWalletClient()
    const publicClient = getPublicClient()

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: ROCKET_CRASH_ABI,
      functionName: 'payout',
      args: [player, bet.betAmount, BigInt(mult)],
      account: walletClient.account,
    })

    const txHash = await walletClient.writeContract(request)
    console.log(`[cashout] payout sent — player: ${player}, mult: ${mult/100}x, tx: ${txHash}`)

    return res.status(200).json({ ok: true, txHash })
  } catch (err) {
    console.error('[cashout] error:', err.message)
    // Re-add bet so player can retry
    activeBets.set(key, bet)
    return res.status(500).json({ error: err.message })
  }
}
