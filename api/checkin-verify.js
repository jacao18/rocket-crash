/**
 * POST /api/checkin-verify
 * Body: { txHash: "0x...", player: "0x...", streakToken: "..." }
 *
 * Verifies on-chain that the CheckedIn event was emitted by the
 * DailyCheckIn contract for this player in this transaction.
 * Parses logs directly from the receipt — no extra RPC call.
 *
 * Returns: { ok: true, streak, lastCheckin, streakToken }
 */

import { createPublicClient, http, defineChain, parseEventLogs } from 'viem'
import { createHmac } from 'crypto'

const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org/'] } },
})

const CHECKIN_CONTRACT = (process.env.VITE_CHECKIN_ADDRESS || '').toLowerCase()
const SECRET           = process.env.CHECKIN_SECRET || 'comet-checkin-secret-change-me'

const CHECKIN_ABI = [{
  type:   'event',
  name:   'CheckedIn',
  inputs: [
    { name: 'player',    type: 'address', indexed: true  },
    { name: 'feePaid',   type: 'uint256', indexed: false },
    { name: 'timestamp', type: 'uint256', indexed: false },
  ],
}]

// ── Streak token helpers (HMAC-signed base64 JSON)
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
function makeToken(player, streak, lastCheckin) {
  const payload = { player: player.toLowerCase(), streak, lastCheckin }
  return Buffer.from(JSON.stringify({ ...payload, sig: sign(payload) })).toString('base64')
}
function parseToken(token) {
  try {
    const obj = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    const { sig, ...payload } = obj
    if (sign(payload) !== sig) return null
    return payload
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { txHash, player, streakToken } = req.body

  if (!txHash || !player) {
    return res.status(400).json({ error: 'Missing txHash or player' })
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid txHash' })
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(player)) {
    return res.status(400).json({ error: 'Invalid player address' })
  }

  const today = todayUTC()

  // ── Parse existing streak token
  let currentStreak = 0
  let lastCheckin   = null
  if (streakToken) {
    const parsed = parseToken(streakToken)
    if (parsed && parsed.player === player.toLowerCase()) {
      currentStreak = parsed.streak
      lastCheckin   = parsed.lastCheckin
    }
  }

  // ── Prevent double check-in (token-based guard)
  if (lastCheckin === today) {
    return res.status(400).json({ error: 'Already checked in today', checkedToday: true })
  }

  try {
    const client  = createPublicClient({ chain: minatoTestnet, transport: http() })
    const receipt = await client.getTransactionReceipt({ hash: txHash })

    if (!receipt) {
      return res.status(400).json({ error: 'Transaction not found or not yet confirmed. Wait a few seconds and retry.' })
    }
    if (receipt.status !== 'success') {
      return res.status(400).json({ error: 'Transaction reverted' })
    }

    // ── Verify tx went to the correct contract (if configured)
    const isZeroAddr = !CHECKIN_CONTRACT || CHECKIN_CONTRACT === '0x0000000000000000000000000000000000000000'
    if (!isZeroAddr && receipt.to?.toLowerCase() !== CHECKIN_CONTRACT) {
      return res.status(400).json({ error: 'Transaction was not sent to the DailyCheckIn contract' })
    }

    // ── Parse CheckedIn event directly from receipt logs (no extra RPC call)
    let parsedLogs = []
    try {
      parsedLogs = parseEventLogs({ abi: CHECKIN_ABI, logs: receipt.logs })
    } catch (e) {
      console.warn('[checkin-verify] parseEventLogs:', e.message)
    }

    const playerLog = parsedLogs.find(
      l => l.eventName === 'CheckedIn' &&
           l.args?.player?.toLowerCase() === player.toLowerCase()
    )

    if (!playerLog) {
      console.error('[checkin-verify] no CheckedIn log. receipt.logs:', JSON.stringify(receipt.logs))
      return res.status(400).json({ error: 'CheckedIn event not found. Make sure you called the DailyCheckIn contract.' })
    }

    // ── Calculate new streak
    const yesterday = yesterdayUTC()
    const newStreak = lastCheckin === yesterday ? currentStreak + 1 : 1

    const token = makeToken(player, newStreak, today)
    console.log(`[checkin] player=${player} streak=${newStreak} date=${today} tx=${txHash}`)

    return res.status(200).json({
      ok:          true,
      streak:      newStreak,
      lastCheckin: today,
      streakToken: token,
    })
  } catch (err) {
    console.error('[checkin-verify] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
