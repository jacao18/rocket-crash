/**
 * POST /api/bet
 * Body: { player: "0x...", betAmount: "0.001" }
 *
 * Called by the frontend right after placeBet() tx is confirmed.
 * Registers the active bet so /api/cashout knows it's valid.
 */
import { parseEther } from 'viem'
import { activeBets } from './_lib.js'

export default function handler(req, res) {
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

  const betWei = parseEther(String(betAmount))
  activeBets.set(player.toLowerCase(), { betAmount: betWei, timestamp: Date.now() })

  console.log(`[bet] registered: ${player} — ${betAmount} ETH`)
  return res.status(200).json({ ok: true })
}
