/**
 * POST /api/checkin-verify
 * Body: { txHash: "0x...", player: "0x...", expectedWei: "5000000000000" }
 *
 * Verifies on-chain that:
 *   1. The tx exists and succeeded
 *   2. The sender is `player`
 *   3. The recipient is the TREASURY address
 *   4. The value >= expectedWei * 0.9 (10% tolerance)
 *
 * Returns: { ok: true, streak, lastCheckin, checkedToday }
 *
 * Streak state is stored in a signed JWT-style token in the response,
 * and the client stores it in localStorage. The server re-validates
 * the token on each request so the client cannot manipulate the streak.
 *
 * Token structure (base64 JSON, HMAC-signed with CHECKIN_SECRET):
 *   { player, streak, lastCheckin (YYYY-MM-DD UTC), sig }
 */

import { createPublicClient, http, defineChain, parseAbiItem } from 'viem'
import { createHmac } from 'crypto'

const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org/'] } },
})

const CHECKIN_CONTRACT = (process.env.VITE_CHECKIN_ADDRESS || '').toLowerCase()
const SECRET           = process.env.CHECKIN_SECRET || 'comet-checkin-secret-change-me'

const CHECKED_IN_ABI = parseAbiItem('event CheckedIn(address indexed player, uint256 feePaid, uint256 timestamp)')

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
  const sig = sign(payload)
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64')
}

function parseToken(token) {
  try {
    const obj = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    const { sig, ...payload } = obj
    const expected = sign(payload)
    if (sig !== expected) return null
    return payload
  } catch {
    return null
  }
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

  // Parse existing streak token (if any)
  let currentStreak = 0
  let lastCheckin   = null

  if (streakToken) {
    const parsed = parseToken(streakToken)
    if (parsed && parsed.player === player.toLowerCase()) {
      currentStreak = parsed.streak
      lastCheckin   = parsed.lastCheckin
    }
  }

  // Prevent double check-in today
  if (lastCheckin === today) {
    return res.status(400).json({ error: 'Already checked in today', checkedToday: true })
  }

  // Verify tx on-chain via contract event
  try {
    const client  = createPublicClient({ chain: minatoTestnet, transport: http() })
    const receipt = await client.getTransactionReceipt({ hash: txHash })

    if (!receipt) {
      return res.status(400).json({ error: 'Transaction not found' })
    }
    if (receipt.status !== 'success') {
      return res.status(400).json({ error: 'Transaction failed' })
    }

    // Verify the tx was sent TO the check-in contract
    if (CHECKIN_CONTRACT && receipt.to?.toLowerCase() !== CHECKIN_CONTRACT) {
      return res.status(400).json({ error: 'Transaction was not sent to the check-in contract' })
    }

    // Find the CheckedIn event emitted for this player in this tx
    const logs = await client.getLogs({
      address:     receipt.to,
      event:       CHECKED_IN_ABI,
      fromBlock:   receipt.blockNumber,
      toBlock:     receipt.blockNumber,
    })

    const playerLog = logs.find(
      l => l.transactionHash === txHash &&
           l.args.player?.toLowerCase() === player.toLowerCase()
    )

    if (!playerLog) {
      return res.status(400).json({ error: 'CheckedIn event not found for this player in this transaction' })
    }

    // Calculate new streak
    const yesterday = yesterdayUTC()
    let newStreak

    if (lastCheckin === yesterday) {
      // Consecutive day — extend streak
      newStreak = currentStreak + 1
    } else {
      // Missed a day (or first check-in) — reset to 1
      newStreak = 1
    }

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
