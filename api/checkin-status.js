/**
 * POST /api/checkin-status
 * Body: { player: "0x...", streakToken: "..." }
 *
 * Validates the streak token and returns current streak info.
 * Called on page load to restore state.
 */

import { createHmac } from 'crypto'

const SECRET = process.env.CHECKIN_SECRET || 'comet-checkin-secret-change-me'

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayUTC() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function sign(payload) {
  return createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex')
}

function parseToken(token) {
  try {
    const obj = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    const { sig, ...payload } = obj
    if (sign(payload) !== sig) return null
    return payload
  } catch {
    return null
  }
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { player, streakToken } = req.body

  if (!player || !streakToken) {
    return res.status(200).json({ streak: 0, lastCheckin: null, checkedToday: false, streakAlive: false })
  }

  const parsed = parseToken(streakToken)

  if (!parsed || parsed.player !== player.toLowerCase()) {
    return res.status(200).json({ streak: 0, lastCheckin: null, checkedToday: false, streakAlive: false })
  }

  const today     = todayUTC()
  const yesterday = yesterdayUTC()
  const checkedToday  = parsed.lastCheckin === today
  const streakAlive   = parsed.lastCheckin === today || parsed.lastCheckin === yesterday

  // If streak is broken (missed more than 1 day), return reset state
  const streak = streakAlive ? parsed.streak : 0

  return res.status(200).json({
    streak,
    lastCheckin:  parsed.lastCheckin,
    checkedToday,
    streakAlive,
    // Return a corrected token if streak was broken
    streakToken:  streakAlive ? streakToken : null,
  })
}
