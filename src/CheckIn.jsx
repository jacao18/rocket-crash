import { useEffect, useState, useCallback } from 'react'
import { useSendTransaction } from 'wagmi'
import { useWallets } from '@privy-io/react-auth'

const TREASURY = '0xd41D6fDD91d3c39d3AC29745f68548843598D572'
const STORAGE_KEY = 'comet_checkin_token'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CheckIn({ address, authenticated }) {
  const { wallets } = useWallets()
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')

  const [streak, setStreak]           = useState(0)
  const [checkedToday, setCheckedToday] = useState(false)
  const [streakAlive, setStreakAlive]  = useState(false)
  const [lastCheckin, setLastCheckin]  = useState(null)
  const [price, setPrice]             = useState(null)
  const [status, setStatus]           = useState('')
  const [loading, setLoading]         = useState(false)

  const { sendTransactionAsync } = useSendTransaction()

  // ── Build the 7-day week display (Mon → Sun starting from this week's Monday)
  function getWeekDays() {
    const today = new Date()
    const dayOfWeek = today.getUTCDay() // 0=Sun
    // Start from Monday of current week
    const monday = new Date(today)
    monday.setUTCDate(today.getUTCDate() - ((dayOfWeek + 6) % 7))

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setUTCDate(monday.getUTCDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = DAY_LABELS[d.getUTCDay()]
      const isToday = dateStr === new Date().toISOString().slice(0, 10)
      return { label, dateStr, isToday }
    })
  }

  // ── Which days of this week were checked in?
  // We estimate based on lastCheckin + streak (can't know exact dates without server storage)
  function getCheckedDays() {
    if (!lastCheckin || !streakAlive) return new Set()
    const checked = new Set()
    const last = new Date(lastCheckin + 'T00:00:00Z')
    for (let i = 0; i < Math.min(streak, 7); i++) {
      const d = new Date(last)
      d.setUTCDate(last.getUTCDate() - i)
      checked.add(d.toISOString().slice(0, 10))
    }
    return checked
  }

  // ── Load streak status on mount
  const loadStatus = useCallback(async () => {
    if (!address) return
    const token = localStorage.getItem(STORAGE_KEY + '_' + address.toLowerCase())

    try {
      const res = await fetch('/api/checkin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, streakToken: token || '' }),
      })
      const data = await res.json()
      setStreak(data.streak || 0)
      setCheckedToday(data.checkedToday || false)
      setStreakAlive(data.streakAlive || false)
      setLastCheckin(data.lastCheckin || null)
      // If server corrected our token (broken streak), clear it
      if (!data.streakToken && token) {
        localStorage.removeItem(STORAGE_KEY + '_' + address.toLowerCase())
      }
    } catch (err) {
      console.warn('[checkin] status error:', err)
    }
  }, [address])

  // ── Load ETH price
  const loadPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/checkin-price')
      const data = await res.json()
      setPrice(data)
    } catch (err) {
      console.warn('[checkin] price error:', err)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadPrice()
  }, [address, loadStatus, loadPrice])

  // ── Do check-in
  async function doCheckIn() {
    if (!authenticated || !address) { setStatus('Sign in to check in.'); return }
    if (checkedToday) { setStatus('Already checked in today!'); return }
    if (!price) { setStatus('Loading price...'); return }
    if (!embeddedWallet) { setStatus('No wallet found.'); return }

    setLoading(true)
    setStatus('Sending transaction…')

    try {
      const weiAmount = BigInt(price.weiWithBuffer)

      const txHash = await sendTransactionAsync({
        to:    TREASURY,
        value: weiAmount,
      })

      setStatus('Confirming…')

      // Wait a moment for the tx to propagate
      await new Promise(r => setTimeout(r, 3000))

      const token = localStorage.getItem(STORAGE_KEY + '_' + address.toLowerCase()) || ''

      const res = await fetch('/api/checkin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          player:       address,
          expectedWei:  price.weiAmount,
          streakToken:  token,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      // Save new token
      localStorage.setItem(STORAGE_KEY + '_' + address.toLowerCase(), data.streakToken)

      setStreak(data.streak)
      setCheckedToday(true)
      setStreakAlive(true)
      setLastCheckin(data.lastCheckin)
      setStatus(`✅ Day ${data.streak} streak!`)
      setTimeout(() => setStatus(''), 4000)
    } catch (err) {
      console.error('[checkin]', err)
      setStatus('❌ ' + (err.message || 'Check-in failed'))
      setTimeout(() => setStatus(''), 5000)
    } finally {
      setLoading(false)
    }
  }

  const weekDays  = getWeekDays()
  const checkedSet = getCheckedDays()

  return (
    <div style={s.box}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>📅 Daily Check-in</span>
        {streak > 0 && (
          <span style={s.streakBadge}>
            🔥 {streak} day{streak !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Week grid */}
      <div style={s.weekGrid}>
        {weekDays.map(({ label, dateStr, isToday }) => {
          const done = checkedSet.has(dateStr)
          const isActive = isToday && !checkedToday
          return (
            <div
              key={dateStr}
              style={{
                ...s.dayCell,
                ...(isToday ? s.dayCellToday : {}),
                ...(done ? s.dayCellDone : {}),
              }}
            >
              <div style={s.dayLabel}>{label}</div>
              <div style={s.dayIcon}>
                {done ? '⭐' : isToday && !checkedToday ? '○' : '·'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Price info */}
      {price && (
        <div style={s.priceInfo}>
          {checkedToday
            ? <span style={{ color: '#3dcfb0' }}>✓ Checked in today</span>
            : <span>≈ ${price.targetUsd} USD · {parseFloat(price.ethAmount).toFixed(6)} ETH</span>
          }
        </div>
      )}

      {/* Status */}
      {status && <div style={s.statusMsg}>{status}</div>}

      {/* Button */}
      <button
        onClick={doCheckIn}
        disabled={loading || checkedToday || !authenticated}
        style={{
          ...s.btn,
          opacity: (loading || checkedToday || !authenticated) ? 0.4 : 1,
          background: checkedToday ? 'rgba(61,207,176,0.12)' : 'rgba(91,163,217,0.16)',
          color: checkedToday ? '#3dcfb0' : '#5ba3d9',
          borderColor: checkedToday ? 'rgba(61,207,176,0.35)' : 'rgba(91,163,217,0.40)',
          cursor: (loading || checkedToday || !authenticated) ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '⏳ Processing…' : checkedToday ? '✓ Checked In' : '☀️ Check In'}
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
  dayLabel: {
    fontSize: '0.58rem',
    color: '#2e4a66',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dayIcon: {
    fontSize: '0.85rem',
    lineHeight: 1,
  },
  priceInfo: {
    fontSize: '0.72rem',
    color: '#4a6a90',
    textAlign: 'center',
  },
  statusMsg: {
    fontSize: '0.75rem',
    color: '#c8dff5',
    textAlign: 'center',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: '6px 10px',
  },
  btn: {
    width: '100%',
    padding: '11px',
    border: '1px solid',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: '0.88rem',
    letterSpacing: 0.5,
    transition: 'opacity 0.15s',
  },
  hint: {
    fontSize: '0.68rem',
    color: '#2e4a66',
    textAlign: 'center',
  },
}
