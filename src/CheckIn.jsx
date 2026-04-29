import { useEffect, useState, useCallback } from 'react'
import { useWriteContract } from 'wagmi'

const CHECKIN_ADDRESS = import.meta.env.VITE_CHECKIN_ADDRESS || '0x0000000000000000000000000000000000000000'
const STORAGE_KEY     = 'comet_checkin_token'
const DAY_LABELS      = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CHECKIN_ABI = [
  {
    "inputs": [],
    "name": "checkIn",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFee",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
]

export default function CheckIn({ address, authenticated }) {
  const [streak, setStreak]             = useState(0)
  const [checkedToday, setCheckedToday] = useState(false)
  const [streakAlive, setStreakAlive]   = useState(false)
  const [lastCheckin, setLastCheckin]   = useState(null)
  const [feeWei, setFeeWei]             = useState(null)
  const [status, setStatus]             = useState('')
  const [loading, setLoading]           = useState(false)

  const { writeContractAsync } = useWriteContract()

  // ── Week grid: Mon → Sun of current week
  function getWeekDays() {
    const today     = new Date()
    const dayOfWeek = today.getUTCDay()
    const monday    = new Date(today)
    monday.setUTCDate(today.getUTCDate() - ((dayOfWeek + 6) % 7))

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setUTCDate(monday.getUTCDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      return {
        label:   DAY_LABELS[d.getUTCDay()],
        dateStr,
        isToday: dateStr === new Date().toISOString().slice(0, 10),
        isPast:  d < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'),
      }
    })
  }

  // ── Days with check-in this week (estimated from streak + lastCheckin)
  function getCheckedDays() {
    if (!lastCheckin) return new Set()
    const checked = new Set()
    const last = new Date(lastCheckin + 'T00:00:00Z')
    for (let i = 0; i < Math.min(streak, 7); i++) {
      const d = new Date(last)
      d.setUTCDate(last.getUTCDate() - i)
      checked.add(d.toISOString().slice(0, 10))
    }
    return checked
  }

  // ── Load streak status from backend
  const loadStatus = useCallback(async () => {
    if (!address) return
    const token = localStorage.getItem(STORAGE_KEY + '_' + address.toLowerCase())
    try {
      const res  = await fetch('/api/checkin-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ player: address, streakToken: token || '' }),
      })
      const data = await res.json()
      setStreak(data.streak || 0)
      setCheckedToday(data.checkedToday || false)
      setStreakAlive(data.streakAlive || false)
      setLastCheckin(data.lastCheckin || null)
      if (!data.streakToken && token) {
        localStorage.removeItem(STORAGE_KEY + '_' + address.toLowerCase())
      }
    } catch (err) {
      console.warn('[checkin] status error:', err)
    }
  }, [address])

  // ── Load fee from backend
  const loadFee = useCallback(async () => {
    try {
      const res  = await fetch('/api/checkin-price')
      const data = await res.json()
      setFeeWei(data.weiWithBuffer)
    } catch (err) {
      console.warn('[checkin] fee error:', err)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadFee()
  }, [address, loadStatus, loadFee])

  // ── Execute check-in via smart contract
  async function doCheckIn() {
    if (!authenticated || !address) { setStatus('Sign in to check in.'); return }
    if (checkedToday) { setStatus('Already checked in today!'); return }
    if (!feeWei) { setStatus('Loading…'); return }

    setLoading(true)
    setStatus('Confirm in your wallet…')

    try {
      const txHash = await writeContractAsync({
        address:      CHECKIN_ADDRESS,
        abi:          CHECKIN_ABI,
        functionName: 'checkIn',
        value:        BigInt(feeWei),
      })

      setStatus('Confirming…')
      await new Promise(r => setTimeout(r, 3000))

      const token = localStorage.getItem(STORAGE_KEY + '_' + address.toLowerCase()) || ''

      const res = await fetch('/api/checkin-verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ txHash, player: address, streakToken: token }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')

      localStorage.setItem(STORAGE_KEY + '_' + address.toLowerCase(), data.streakToken)

      setStreak(data.streak)
      setCheckedToday(true)
      setStreakAlive(true)
      setLastCheckin(data.lastCheckin)
      setStatus(`🔥 ${data.streak} day streak!`)
      setTimeout(() => setStatus(''), 4000)
    } catch (err) {
      console.error('[checkin]', err)
      setStatus('❌ ' + (err.shortMessage || err.message || 'Check-in failed'))
      setTimeout(() => setStatus(''), 8000)
    } finally {
      setLoading(false)
    }
  }

  const weekDays   = getWeekDays()
  const checkedSet = getCheckedDays()

  return (
    <div style={s.box}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>📅 Daily Check-in</span>
        {streak > 0 && streakAlive && (
          <span style={s.streakBadge}>🔥 {streak}d</span>
        )}
      </div>

      {/* Week grid */}
      <div style={s.weekGrid}>
        {weekDays.map(({ label, dateStr, isToday, isPast }) => {
          const done   = checkedSet.has(dateStr)
          const missed = isPast && !done && !isToday

          return (
            <div
              key={dateStr}
              style={{
                ...s.dayCell,
                ...(isToday && !done ? s.dayCellToday : {}),
                ...(done             ? s.dayCellDone  : {}),
                ...(missed           ? s.dayCellMissed: {}),
              }}
            >
              <div style={s.dayLabel}>{label}</div>
              <div style={{ ...s.dayIcon, ...(done ? s.dayIconDone : {}) }}>
                {done    ? '✓'  :
                 missed  ? '✕'  :
                 isToday ? '◎'  : '·'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Status message */}
      {status && <div style={s.statusMsg}>{status}</div>}

      {/* Button */}
      <button
        onClick={doCheckIn}
        disabled={loading || checkedToday || !authenticated}
        style={{
          ...s.btn,
          opacity:     (loading || checkedToday || !authenticated) ? 0.4 : 1,
          background:  checkedToday ? 'rgba(61,207,176,0.12)' : 'rgba(91,163,217,0.16)',
          color:       checkedToday ? '#3dcfb0' : '#5ba3d9',
          borderColor: checkedToday ? 'rgba(61,207,176,0.35)' : 'rgba(91,163,217,0.40)',
          cursor:      (loading || checkedToday || !authenticated) ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '⏳ Processing…' : checkedToday ? 'Checked In' : '☀️ Check In'}
      </button>

      {!authenticated && (
        <div style={s.hint}>Sign in to check in daily</div>
      )}
    </div>
  )
}

const s = {
  box: {
    background: '#0a0c14',
    border: '1px solid rgba(90,130,200,0.18)',
    borderRadius: 14,
    padding: '18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '0.82rem',
    fontWeight: 800,
    color: '#c8dff5',
    letterSpacing: 0.4,
  },
  streakBadge: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#c8873a',
    background: 'rgba(200,135,58,0.12)',
    border: '1px solid rgba(200,135,58,0.28)',
    borderRadius: 999,
    padding: '3px 10px',
  },
  weekGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
  },
  dayCell: {
    background: '#0e1220',
    border: '1px solid rgba(90,130,200,0.10)',
    borderRadius: 8,
    padding: '6px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  dayCellToday: {
    border: '1px solid rgba(91,163,217,0.45)',
    background: 'rgba(91,163,217,0.06)',
  },
  dayCellDone: {
    border: '1px solid rgba(200,135,58,0.35)',
    background: 'rgba(200,135,58,0.08)',
  },
  dayCellMissed: {
    border: '1px solid rgba(180,60,60,0.30)',
    background: 'rgba(180,60,60,0.06)',
  },
  dayLabel: {
    fontSize: '0.58rem',
    color: '#2e4a66',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayIcon:     { fontSize: '0.85rem', lineHeight: 1, fontWeight: 400 },
  dayIconDone: { color: '#3dcfb0', fontWeight: 400 },
  statusMsg:  { fontSize: '0.75rem', color: '#c8dff5', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 10px', wordBreak: 'break-all' },
  btn: {
    width: '100%',
    padding: '11px',
    border: '1px solid',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: '0.88rem',
    letterSpacing: 0.5,
  },
  hint: { fontSize: '0.68rem', color: '#2e4a66', textAlign: 'center' },
}
