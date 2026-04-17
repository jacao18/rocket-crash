/**
 * POST /api/bet
 * Body: { player: "0x...", betAmount: "0.001" }
 *
 * No-op endpoint — kept for compatibility.
 * betAmount is now passed directly on /api/cashout and /api/crash,
 * avoiding in-memory state issues across serverless function instances.
 */
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  return res.status(200).json({ ok: true })
}
