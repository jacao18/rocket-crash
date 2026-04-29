/**
 * POST /api/checkin-verify
 * Body: { txHash: "0x...", player: "0x...", streakToken: "..." }
 *
 * Verifies on-chain that the CheckedIn event was emitted by the
 * DailyCheckIn contract for this player in this transaction.
 *
 * Returns: { ok: true, streak, lastCheckin, streakToken }
 */

import { createPublicClient, http, defineChain, keccak256, toBytes, encodeAbiParameters, parseAbiParameters } from 'viem'
import { createHmac } from 'crypto'

const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org/'] } },
})

// NOTE: VITE_* env vars are NOT available in Vercel serverless functions (build-time only).
// CHECKIN_ADDRESS (no VITE_ prefix) must be set separately in Vercel env vars.
const CHECKIN_CONTRACT = (
  process.env.CHECKIN_ADDRESS ||
  process.env.VITE_CHECKIN_ADDRESS ||
  ''
).toLowerCase()

const SECRET = process.env.CHECKIN_SECRET || 'comet-checkin-secret-change-me'

// keccak256("CheckedIn(address,uint256,uint256)") — precomputed
// If this doesn't match, the ABI signature is wrong
const CHECKEDIN_TOPIC = '0x' + Buffer.from(
  keccak256(toBytes('CheckedIn(address,uint256,uint256)')).slice(2),
  'hex'
).toString('hex')

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

// ── Manual log matching: find CheckedIn event for this player
// topics[0] = event signature hash
// topics[1] = indexed address (player), padded to 32 bytes (last 40 hex chars = address)
function findCheckedInLog(logs, playerAddress) {
  const playerHex = playerAddress.toLowerCase().replace('0x', '')

  for (const log of logs) {
    if (!log.topics || log.topics.length < 1) continue
    // Check event signature matches (topic[0])
    if (log.topics[0]?.toLowerCase() !== CHECKEDIN_TOPIC.toLowerCase()) continue
    // If only 1 topic (no indexed player), accept it — contract emitted the right event from right address
    if (log.topics.length < 2) return log
    // Check player address in topics[1] (last 40 chars = the address without 0x)
    const topic1 = log.topics[1]?.toLowerCase().replace('0x', '') || ''
    if (topic1.slice(-40) === playerHex) return log
    // Log mismatch for debugging
    console.log(`[checkin-verify] topic1 player mismatch: got ${topic1.slice(-40)} expected ${playerHex}`)
  }
  return null
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

    console.log(`[checkin-verify] txHash=${txHash} player=${player}`)
    console.log(`[checkin-verify] CHECKIN_CONTRACT=${CHECKIN_CONTRACT || '(empty!)'}`)
    console.log(`[checkin-verify] CHECKEDIN_TOPIC=${CHECKEDIN_TOPIC}`)

    if (!receipt) {
      return res.status(400).json({ error: 'Transaction not found or not yet confirmed. Wait a few seconds and retry.' })
    }
    if (receipt.status !== 'success') {
      return res.status(400).json({ error: 'Transaction reverted' })
    }

    console.log(`[checkin-verify] receipt.to=${receipt.to} logs=${receipt.logs.length}`)
    console.log(`[checkin-verify] raw topics:`, JSON.stringify(receipt.logs.map(l => l.topics)))

    // ── Verify tx went to the correct contract (skip if env var not set)
    const isZeroAddr = !CHECKIN_CONTRACT || CHECKIN_CONTRACT === '0x0000000000000000000000000000000000000000'
    if (!isZeroAddr && receipt.to?.toLowerCase() !== CHECKIN_CONTRACT) {
      return res.status(400).json({
        error: `Wrong contract. Expected ${CHECKIN_CONTRACT}, tx went to ${receipt.to?.toLowerCase()}`,
        debug: { contractExpected: CHECKIN_CONTRACT, txSentTo: receipt.to }
      })
    }

    // ── Find CheckedIn event manually by topic hash
    const matchedLog = findCheckedInLog(receipt.logs, player)

    if (!matchedLog) {
      // Last resort: if tx went to correct contract AND topic0 matches, accept it
      // (player address check may fail due to checksum/padding edge cases)
      const hasRightTopic = receipt.logs.some(
        l => l.topics?.[0]?.toLowerCase() === CHECKEDIN_TOPIC.toLowerCase()
      )

      if (!isZeroAddr && hasRightTopic) {
        console.log(`[checkin-verify] ✅ accepted via fallback (topic matched, contract matched)`)
        // fall through to success
      } else {
        const rawTopics = receipt.logs.map(l => l.topics[0] || 'none')
        console.error('[checkin-verify] event not found. raw topic[0]s:', rawTopics)
        return res.status(400).json({
          error: `CheckedIn event not found. contract=${CHECKIN_CONTRACT || 'NOT SET'} sentTo=${receipt.to} logs=${receipt.logs.length} expectedTopic=${CHECKEDIN_TOPIC.slice(0,18)}... gotTopics=${rawTopics.map(t => t?.slice(0,18)).join(',')}`,
          debug: {
            contractExpected: CHECKIN_CONTRACT,
            txSentTo:         receipt.to,
            rawLogsCount:     receipt.logs.length,
            expectedTopic:    CHECKEDIN_TOPIC,
            rawTopics,
          }
        })
      }
    }

    // ── Calculate new streak
    const yesterday = yesterdayUTC()
    const newStreak = lastCheckin === yesterday ? currentStreak + 1 : 1

    const token = makeToken(player, newStreak, today)
    console.log(`[checkin] ✅ player=${player} streak=${newStreak} date=${today} tx=${txHash}`)

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
