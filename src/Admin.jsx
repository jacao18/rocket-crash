import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'

const OWNER = '0xd41D6fDD91d3c39d3AC29745f68548843598D572'.toLowerCase()
const EXPLORER = 'https://explorer-testnet.soneium.org'

export default function Admin() {
  const { authenticated, login, ready } = usePrivy()
  const { wallets } = useWallets()

  // Admin: prefer external wallet (MetaMask etc), fall back to any connected wallet
  const externalWallet = wallets.find(w => w.walletClientType !== 'privy')
  const anyWallet      = wallets[0]
  const wallet         = externalWallet || anyWallet
  const address        = wallet?.address

  const isOwner = address?.toLowerCase() === OWNER

  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)

  async function fetchStats() {
    if (!address) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin-stats?address=${address}`)
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to fetch stats')
      }
      setStats(await res.json())
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOwner) fetchStats()
  }, [isOwner, address])

  // ── Not ready yet
  if (!ready) {
    return <div style={s.center}><div style={s.spinner}>Loading…</div></div>
  }

  // ── Not logged in
  if (!authenticated) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.logo}>🛰️</div>
          <div style={s.title}>Admin Dashboard</div>
          <div style={s.sub}>
            Connect with the <b style={{ color: '#5ba3d9' }}>owner wallet</b> to access the dashboard.
          </div>
          <button onClick={login} style={s.btnWallet}>
            <span style={s.walletIcon}>🦊</span>
            Connect Wallet
          </button>
          <div style={s.hint}>
            MetaMask, WalletConnect or any injected wallet
          </div>
        </div>
      </div>
    )
  }

  // ── Wrong wallet
  if (!isOwner) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.logo}>🔒</div>
          <div style={s.title}>Access Denied</div>
          <div style={s.sub}>
            Connected: <code style={s.code}>{address?.slice(0,6)}…{address?.slice(-4)}</code><br />
            This dashboard is restricted to the contract owner.
          </div>
          <a href="/" style={s.btnSecondary}>← Back to game</a>
        </div>
      </div>
    )
  }

  // ── Loading / error
  if (loading && !stats) {
    return <div style={s.center}><div style={s.spinner}>Loading…</div></div>
  }

  if (error) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.title}>Error</div>
          <div style={{ color: '#d95c5c', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>
          <button onClick={fetchStats} style={s.btnPrimary}>Retry</button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>🛰️ Admin Dashboard</div>
          <div style={s.headerSub}>
            Contract: <a href={`${EXPLORER}/address/0x03670B7279D0Db9f6207b6E79D17577f09Bfed0e`} target="_blank" rel="noreferrer" style={s.link}>
              0x0367…ed0e ↗
            </a>
            {lastRefresh && <span style={{ marginLeft: 16, color: '#2e4a66' }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={fetchStats} disabled={loading} style={s.btnRefresh}>
            {loading ? '⏳' : '↺'} Refresh
          </button>
          <a href="/" style={s.btnSecondary}>← Game</a>
        </div>
      </div>

      {/* Metric cards */}
      <div style={s.grid}>
        <MetricCard label="Total Bets" value={stats.totalBets} icon="🎲" />
        <MetricCard label="Unique Players" value={stats.uniquePlayers} icon="👤" />
        <MetricCard label="Wins" value={stats.totalWins} icon="✅" color="#3dcfb0" />
        <MetricCard label="Crashes" value={stats.totalCrashes} icon="💥" color="#d95c5c" />
        <MetricCard label="Volume" value={`${parseFloat(stats.totalVolumeEth).toFixed(4)} ETH`} icon="📊" />
        <MetricCard label="Paid Out" value={`${parseFloat(stats.totalPayoutsEth).toFixed(4)} ETH`} icon="💸" color="#3dcfb0" />
        <MetricCard label="House Profit" value={`${parseFloat(stats.houseProfitEth).toFixed(4)} ETH`} icon="🏦" color="#c8873a" />
        <MetricCard
          label="Win Rate"
          value={stats.totalBets > 0 ? `${((stats.totalWins / stats.totalBets) * 100).toFixed(1)}%` : '—'}
          icon="📈"
        />
      </div>

      {/* Rounds table */}
      <div style={s.tableWrap}>
        <div style={s.tableHeader}>
          <span style={s.tableTitle}>Recent Rounds</span>
          <span style={s.tableSub}>{stats.rounds.length} events</span>
        </div>
        <div style={s.tableScroll}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Result', 'Player', 'Bet', 'Multiplier', 'Payout', 'Tx'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.rounds.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#2e4a66' }}>No rounds yet</td></tr>
              )}
              {stats.rounds.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={s.td}>
                    <span style={{ ...s.chip, ...(r.type === 'win' ? s.chipWin : s.chipCrash) }}>
                      {r.type === 'win' ? '✅ WIN' : '💥 CRASH'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <a href={`${EXPLORER}/address/${r.player}`} target="_blank" rel="noreferrer" style={s.link}>
                      {r.player.slice(0, 6)}…{r.player.slice(-4)}
                    </a>
                  </td>
                  <td style={{ ...s.td, color: '#c8dff5' }}>{r.betAmount} ETH</td>
                  <td style={{ ...s.td, color: r.type === 'win' ? '#3dcfb0' : '#d95c5c', fontWeight: 700 }}>
                    {r.mult ? `${r.mult}x` : '—'}
                  </td>
                  <td style={{ ...s.td, color: r.type === 'win' ? '#3dcfb0' : '#4a6a90' }}>
                    {r.type === 'win' ? `+${r.payout} ETH` : '0'}
                  </td>
                  <td style={s.td}>
                    <a href={`${EXPLORER}/tx/${r.txHash}`} target="_blank" rel="noreferrer" style={s.link}>
                      {r.txHash.slice(0, 8)}… ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, color = '#c8dff5' }) {
  return (
    <div style={s.metricCard}>
      <div style={s.metricIcon}>{icon}</div>
      <div style={{ ...s.metricValue, color }}>{value}</div>
      <div style={s.metricLabel}>{label}</div>
    </div>
  )
}

const s = {
  page:        { minHeight: '100vh', background: '#03040a', color: '#c8dff5', padding: '24px 20px', fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  center:      { minHeight: '100vh', background: '#03040a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  card:        { background: '#0a0c14', border: '1px solid rgba(90,130,200,0.18)', borderRadius: 18, padding: 40, textAlign: 'center', maxWidth: 400, width: '100%' },
  logo:        { fontSize: '2.5rem', marginBottom: 12 },
  title:       { fontSize: '1.4rem', fontWeight: 800, color: '#c8dff5', marginBottom: 8 },
  sub:         { fontSize: '0.85rem', color: '#4a6a90', marginBottom: 24, lineHeight: 1.6 },
  code:        { fontFamily: 'monospace', color: '#5ba3d9', background: 'rgba(91,163,217,0.1)', padding: '2px 6px', borderRadius: 4 },
  spinner:     { color: '#4a6a90', fontSize: '1rem' },

  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  headerTitle: { fontSize: '1.5rem', fontWeight: 900, color: '#c8dff5', marginBottom: 4 },
  headerSub:   { fontSize: '0.78rem', color: '#4a6a90' },

  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 },
  metricCard:  { background: '#0a0c14', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 14, padding: '20px 18px', textAlign: 'center' },
  metricIcon:  { fontSize: '1.6rem', marginBottom: 8 },
  metricValue: { fontSize: '1.5rem', fontWeight: 900, marginBottom: 4 },
  metricLabel: { fontSize: '0.65rem', letterSpacing: 2, color: '#2e4a66', textTransform: 'uppercase' },

  tableWrap:   { background: '#0a0c14', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 14, overflow: 'hidden' },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(90,130,200,0.10)' },
  tableTitle:  { fontSize: '0.85rem', fontWeight: 700, color: '#c8dff5', letterSpacing: 0.5 },
  tableSub:    { fontSize: '0.72rem', color: '#2e4a66' },
  tableScroll: { overflowX: 'auto' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th:          { padding: '10px 16px', textAlign: 'left', fontSize: '0.63rem', letterSpacing: 1.8, color: '#2e4a66', textTransform: 'uppercase', borderBottom: '1px solid rgba(90,130,200,0.08)', whiteSpace: 'nowrap' },
  td:          { padding: '11px 16px', color: '#4a6a90', borderBottom: '1px solid rgba(90,130,200,0.05)', whiteSpace: 'nowrap' },
  chip:        { display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: '0.70rem', fontWeight: 700 },
  chipWin:     { background: 'rgba(61,207,176,0.12)', color: '#3dcfb0', border: '1px solid rgba(61,207,176,0.25)' },
  chipCrash:   { background: 'rgba(217,92,92,0.12)', color: '#d95c5c', border: '1px solid rgba(217,92,92,0.25)' },
  link:        { color: '#5ba3d9', textDecoration: 'none' },

  btnPrimary:  { padding: '12px 28px', background: 'rgba(91,163,217,0.16)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.40)', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', width: '100%' },
  btnWallet:   { padding: '14px 28px', background: 'rgba(91,163,217,0.14)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.40)', borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: 0.5 },
  walletIcon:  { fontSize: '1.3rem' },
  hint:        { marginTop: 12, fontSize: '0.72rem', color: '#2e4a66', textAlign: 'center' },
  btnSecondary:{ padding: '8px 16px', background: 'rgba(255,255,255,0.04)', color: '#4a6a90', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-block' },
  btnRefresh:  { padding: '8px 16px', background: 'rgba(91,163,217,0.10)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.25)', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' },
}
