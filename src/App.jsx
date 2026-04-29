import cometLogo from './assets/comet-icon.png'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useBalance, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useEffect, useRef, useState, useCallback } from 'react'
import { ROCKET_CRASH_ABI, ROCKET_CRASH_ADDRESS } from './contract.js'
import { useWriteContract } from 'wagmi'
import CheckIn from './CheckIn.jsx'

// ─── BET VALUES ──────────────────────────────────────────────
const BET_VALUES = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.010]
const SPEED_K    = 0.18

// ─── Responsive hook ─────────────────────────────────────────
function useIsMobile(breakpoint = 680) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

export default function App() {
  const isMobile = useIsMobile()
  const { login, logout, authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address

  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address,
    watch: true,
  })

  // ── Game state
  const [betAmount, setBetAmount]     = useState(0.001)
  const [gameState, setGameState]     = useState('idle')
  const [currentMult, setCurrentMult] = useState(0.8)
  const [history, setHistory]         = useState([])
  const [profit, setProfit]           = useState(0)
  const [statusMsg, setStatusMsg]     = useState('')

  // ── UI state
  const [showEditName, setShowEditName] = useState(false)
  const [playerName, setPlayerName]     = useState(() => localStorage.getItem('comet_player_name') || '')
  const [nameInput, setNameInput]       = useState('')
  const [showReferral, setShowReferral] = useState(false)
  const [referralCopied, setReferralCopied] = useState(false)

  // ── Leaderboard (mock — replace with real API later)
  const [leaderboard] = useState([
    { rank: 1, name: 'StarHunter',  profit: 0.142, wins: 38 },
    { rank: 2, name: 'NightComet',  profit: 0.098, wins: 29 },
    { rank: 3, name: 'BlueFlame',   profit: 0.076, wins: 24 },
    { rank: 4, name: 'VoidRocket',  profit: 0.054, wins: 19 },
    { rank: 5, name: 'CryptoAce',   profit: 0.041, wins: 15 },
    { rank: 6, name: 'AstroKing',   profit: 0.033, wins: 12 },
    { rank: 7, name: 'DarkMatter',  profit: 0.021, wins: 9  },
    { rank: 8, name: 'NebulaBet',   profit: 0.014, wins: 7  },
  ])

  function savePlayerName(name) {
    localStorage.setItem('comet_player_name', name)
    setPlayerName(name)
    setShowEditName(false)
  }

  function copyReferral() {
    const ref = `https://cometgames.xyz?ref=${address?.slice(2,8) || 'comet'}`
    navigator.clipboard.writeText(ref)
    setReferralCopied(true)
    setTimeout(() => setReferralCopied(false), 2000)
  }

  const canvasRef    = useRef(null)
  const gameRef      = useRef({
    animId: null, startTime: null, lastTs: null,
    targetMult: 1, betActive: false,
    stars: [], particles: [], explodeParticles: [],
    rocketX: 0, rocketY: 0,
    currentMult: 0.8, gameState: 'idle',
  })

  // ── Contract write (placeBet only — cashout/crash go through backend)
  const { writeContractAsync } = useWriteContract()

  // ── Backend API helpers
  async function apiBet(player, betAmount) {
    const res = await fetch('/api/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, betAmount }),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'api/bet failed')
  }

  async function apiCashout(player, betAmount, multX100) {
    const res = await fetch('/api/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, betAmount: String(betAmount), multX100 }),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'api/cashout failed')
    return res.json()
  }

  async function apiCrash(player, betAmount) {
    await fetch('/api/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, betAmount: String(betAmount) }),
    }).catch(err => console.warn('api/crash failed:', err))
  }

  // ─────────────────────────────────────────────────────────
  //  CANVAS INIT
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      const ctx = canvas.getContext('2d')
      ctx.scale(devicePixelRatio, devicePixelRatio)
      initStars(canvas)
    }
    resize()
    window.addEventListener('resize', resize)
    drawFrame(canvas)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // ─────────────────────────────────────────────────────────
  //  STARS
  // ─────────────────────────────────────────────────────────
  function initStars(canvas) {
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    gameRef.current.stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      spd: Math.random() * 0.6 + 0.2,
      a: Math.random() * 0.6 + 0.2,
    }))
  }

  function updateStars(canvas, speedMult) {
    const H = canvas.offsetHeight
    const scroll = 1 + speedMult * 0.5
    gameRef.current.stars.forEach(s => {
      s.y += s.spd * scroll
      if (s.y > H) { s.y = 0; s.x = Math.random() * canvas.offsetWidth }
    })
  }

  // ─────────────────────────────────────────────────────────
  //  PARTICLES
  // ─────────────────────────────────────────────────────────
  function spawnParticles(x, y) {
    for (let i = 0; i < 4; i++) {
      gameRef.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 1,
        life: 1.0, r: Math.random() * 4 + 2,
        hue: Math.random() * 40 + 20,
      })
    }
  }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2
      const spd   = Math.random() * 6 + 1
      gameRef.current.explodeParticles.push({
        x, y,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 1.0, r: Math.random() * 5 + 2,
        hue: Math.random() < 0.5 ? 20 : 0,
      })
    }
  }

  // ─────────────────────────────────────────────────────────
  //  DRAW
  // ─────────────────────────────────────────────────────────
  function drawFrame(canvas) {
    const ctx = canvas.getContext('2d')
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const g = gameRef.current

    ctx.clearRect(0, 0, W, H)
    const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H) * 0.8)
    bg.addColorStop(0, 'rgba(10,14,28,0.90)')
    bg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

    // Stars
    g.stars.forEach(s => {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2)
      ctx.fillStyle = `rgba(200,220,255,${s.a})`; ctx.fill()
    })

    // Exhaust particles
    g.particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
      ctx.fillStyle = `hsla(${p.hue},100%,60%,${p.life*0.9})`; ctx.fill()
    })

    // Explosion particles
    g.explodeParticles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
      ctx.fillStyle = `hsla(${p.hue},100%,60%,${p.life})`; ctx.fill()
    })

    // Rocket
    if (g.gameState === 'flying') drawRocket(ctx, g.rocketX, g.rocketY)
  }

  function drawRocket(ctx, x, y) {
    const wobble = Math.sin(Date.now() / 200) * 0.05
    ctx.save(); ctx.translate(x, y); ctx.rotate(wobble)

    // Engine glow
    const eg = ctx.createRadialGradient(0, 38, 0, 0, 38, 34)
    eg.addColorStop(0, 'rgba(34,211,238,0.55)'); eg.addColorStop(1, 'rgba(34,211,238,0)')
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 38, 34, 0, Math.PI*2); ctx.fill()

    // Body
    ctx.beginPath()
    ctx.moveTo(0, -52)
    ctx.bezierCurveTo(14, -30, 16, -10, 16, 10); ctx.lineTo(16, 32); ctx.lineTo(-16, 32)
    ctx.lineTo(-16, 10); ctx.bezierCurveTo(-16, -10, -14, -30, 0, -52); ctx.closePath()
    const bodyG = ctx.createLinearGradient(-16, 0, 16, 0)
    bodyG.addColorStop(0, '#1e293b'); bodyG.addColorStop(0.4, '#334155'); bodyG.addColorStop(1, '#1e293b')
    ctx.fillStyle = bodyG; ctx.fill()
    ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 1; ctx.stroke()

    // Highlight
    ctx.beginPath(); ctx.moveTo(0, -52)
    ctx.bezierCurveTo(6, -38, 7, -20, 6, -4); ctx.bezierCurveTo(3, -8, 1, -30, 0, -52); ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill()

    // Left fin
    ctx.beginPath(); ctx.moveTo(-16, 18); ctx.lineTo(-34, 40); ctx.lineTo(-28, 40); ctx.lineTo(-16, 32); ctx.closePath()
    ctx.fillStyle = '#0f172a'; ctx.fill(); ctx.strokeStyle = 'rgba(148,163,184,0.2)'; ctx.stroke()

    // Right fin
    ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(34, 40); ctx.lineTo(28, 40); ctx.lineTo(16, 32); ctx.closePath()
    ctx.fillStyle = '#0f172a'; ctx.fill(); ctx.strokeStyle = 'rgba(148,163,184,0.2)'; ctx.stroke()

    // Nozzle
    ctx.beginPath(); ctx.moveTo(-10, 32); ctx.lineTo(-13, 44); ctx.lineTo(13, 44); ctx.lineTo(10, 32); ctx.closePath()
    ctx.fillStyle = '#0f172a'; ctx.fill()

    // Flame
    const flicker = 0.85 + Math.random() * 0.3
    const flameG = ctx.createLinearGradient(0, 44, 0, 44 + 28 * flicker)
    flameG.addColorStop(0, 'rgba(255,255,255,0.95)'); flameG.addColorStop(0.2, 'rgba(34,211,238,0.9)')
    flameG.addColorStop(0.6, 'rgba(99,102,241,0.6)'); flameG.addColorStop(1, 'rgba(99,102,241,0)')
    ctx.beginPath(); ctx.moveTo(-9, 44)
    ctx.quadraticCurveTo(-5 + Math.random()*4, 44 + 18*flicker, 0, 44 + 28*flicker)
    ctx.quadraticCurveTo(5 + Math.random()*4, 44 + 18*flicker, 9, 44); ctx.closePath()
    ctx.fillStyle = flameG; ctx.fill()

    // Logo
    drawStarLogo(ctx, 0, -8, 13)
    ctx.restore()
  }

  function drawStarLogo(ctx, cx, cy, s) {
    const count = 8, radius = s * 0.78, sq = s * 0.40
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      const px = cx + Math.cos(angle) * radius
      const py = cy + Math.sin(angle) * radius
      const rotate = i % 2 === 0 ? 0 : Math.PI / 4
      ctx.save(); ctx.translate(px, py); ctx.rotate(angle + rotate)
      ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 4
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(-sq/2, -sq/2, sq, sq)
      ctx.shadowBlur = 0; ctx.restore()
    }
  }

  // ─────────────────────────────────────────────────────────
  //  GAME LOOP
  // ─────────────────────────────────────────────────────────
  function gameLoop(ts) {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = gameRef.current
    if (!g.startTime) { g.startTime = ts; g.lastTs = ts }
    const elapsed = (ts - g.startTime) / 1000

    g.currentMult = Math.round((0.8 + SPEED_K * Math.pow(elapsed, 1.4)) * 100) / 100
    setCurrentMult(g.currentMult)

    const W = canvas.offsetWidth, H = canvas.offsetHeight
    g.rocketX = W / 2; g.rocketY = H * 0.52

    updateStars(canvas, g.currentMult - 1)
    spawnParticles(g.rocketX, g.rocketY + 20)

    g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.04; p.r *= 0.95 })
    g.particles = g.particles.filter(p => p.life > 0)

    drawFrame(canvas)

    if (g.currentMult >= g.targetMult) { triggerCrash(); return }
    g.animId = requestAnimationFrame(gameLoop)
  }

  function triggerCrash() {
    const canvas = canvasRef.current
    const g = gameRef.current
    g.gameState = 'crashed'
    setGameState('crashed')
    cancelAnimationFrame(g.animId)

    spawnExplosion(g.rocketX, g.rocketY)

    if (g.betActive) {
      g.betActive = false
      setProfit(p => p - betAmount)
      setHistory(h => [{ mult: g.currentMult, won: false }, ...h].slice(0, 15))
      // Tell backend to call registerCrash() on-chain
      apiCrash(address, betAmount)
      setTimeout(() => refetchBalance(), 4000)
    }

    let frames = 0
    const explLoop = () => {
      g.explodeParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.025; p.r *= 0.97 })
      g.explodeParticles = g.explodeParticles.filter(p => p.life > 0)
      drawFrame(canvas)
      if (++frames < 60) requestAnimationFrame(explLoop)
    }
    requestAnimationFrame(explLoop)

    setTimeout(() => resetIdle(), 3200)
  }

  function resetIdle() {
    const canvas = canvasRef.current
    const g = gameRef.current
    g.gameState = 'idle'; g.currentMult = 0.8; g.targetMult = 1
    g.startTime = null; g.particles = []; g.explodeParticles = []
    setGameState('idle'); setCurrentMult(0.8); setStatusMsg('')
    initStars(canvas); drawFrame(canvas)
  }

  // ─────────────────────────────────────────────────────────
  //  BET — sends tx to contract
  // ─────────────────────────────────────────────────────────
  async function startBet() {
    if (gameRef.current.gameState !== 'idle') return
    if (!authenticated || !address) { login(); return }

    const bal = balanceData ? parseFloat(formatEther(balanceData.value)) : 0
    if (bal < betAmount) { setStatusMsg('Insufficient balance! Get testnet ETH from the faucet.'); return }

    setStatusMsg('Confirming transaction…')

    try {
      const txHash = await writeContractAsync({
        address: ROCKET_CRASH_ADDRESS,
        abi: ROCKET_CRASH_ABI,
        functionName: 'placeBet',
        value: parseEther(betAmount.toString()),
      })
      setStatusMsg('Bet placed! 🚀')

      // Notify backend so it can process cashout/crash on-chain
      await apiBet(address, betAmount)

      const g = gameRef.current
      g.targetMult = drawCrashPoint()
      g.betActive  = true
      g.gameState  = 'flying'
      g.startTime  = null; g.lastTs = null
      g.particles  = []; g.explodeParticles = []

      setGameState('flying'); setStatusMsg('')
      g.animId = requestAnimationFrame(gameLoop)
    } catch (err) {
      console.error(err)
      setStatusMsg('Transaction rejected or failed.')
    }
  }

  async function cashOut() {
    const g = gameRef.current
    if (g.gameState !== 'flying' || !g.betActive) return
    cancelAnimationFrame(g.animId)

    g.betActive  = false
    g.gameState  = 'cashed'
    setGameState('cashed')

    const mult    = g.currentMult
    const payout  = betAmount * mult
    const netGain = payout - betAmount
    setProfit(p => p + netGain)
    setHistory(h => [{ mult, won: true }, ...h].slice(0, 15))

    setStatusMsg(`Cashed out at ${mult.toFixed(2)}x — sending payout…`)

    try {
      const multX100 = Math.round(mult * 100)
      const result = await apiCashout(address, betAmount, multX100)
      setStatusMsg(`✅ +${netGain.toFixed(4)} ETH at ${mult.toFixed(2)}x`)
      // Balance will update after the on-chain tx confirms
      setTimeout(() => refetchBalance(), 4000)
    } catch (err) {
      console.error('[cashout]', err)
      setStatusMsg(`⚠️ Cashed out at ${mult.toFixed(2)}x — payout pending`)
    }

    setTimeout(() => resetIdle(), 3200)
  }

  function drawCrashPoint() {
    const u = Math.random()
    let v = 0.8 + (-Math.log(u) / 0.7)
    return parseFloat(Math.max(0.81, Math.min(10.00, v)).toFixed(2))
  }

  // ─────────────────────────────────────────────────────────
  //  DEPOSIT MODAL STATE
  // ─────────────────────────────────────────────────────────
  const [showDeposit, setShowDeposit] = useState(false)
  const [copied, setCopied]           = useState(false)

  function copyAddress() {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─────────────────────────────────────────────────────────
  //  WITHDRAW STATE
  // ─────────────────────────────────────────────────────────
  const [showWithdraw, setShowWithdraw]   = useState(false)
  const [withdrawTo, setWithdrawTo]       = useState('')
  const [withdrawAmt, setWithdrawAmt]     = useState('')
  const [withdrawStatus, setWithdrawStatus] = useState('')
  const [withdrawing, setWithdrawing]     = useState(false)

  const { sendTransactionAsync } = useSendTransaction()

  async function doWithdraw() {
    if (!withdrawTo || !withdrawAmt) return
    const bal = balanceData ? parseFloat(formatEther(balanceData.value)) : 0
    const amt = parseFloat(withdrawAmt)

    if (isNaN(amt) || amt <= 0)          { setWithdrawStatus('❌ Invalid amount.'); return }
    if (amt > bal)                        { setWithdrawStatus('❌ Insufficient balance.'); return }
    if (!/^0x[0-9a-fA-F]{40}$/.test(withdrawTo)) { setWithdrawStatus('❌ Invalid address.'); return }

    setWithdrawing(true)
    setWithdrawStatus('⏳ Sending transaction…')

    try {
      const provider = await embeddedWallet.getEthereumProvider()

      const txHash = await sendTransactionAsync({
        to:    withdrawTo,
        value: parseEther(withdrawAmt),
        account: address,
      })

      setWithdrawStatus(`✅ Sent! Tx: ${txHash.slice(0, 10)}…`)
      refetchBalance()
      setWithdrawAmt('')
      setWithdrawTo('')
    } catch (err) {
      console.error(err)
      setWithdrawStatus('❌ Transaction failed or rejected.')
    } finally {
      setWithdrawing(false)
    }
  }

  function setMaxWithdraw() {
    if (!balanceData) return
    const bal = parseFloat(formatEther(balanceData.value))
    // Leave 0.0001 ETH for gas
    const max = Math.max(0, bal - 0.0001)
    setWithdrawAmt(max.toFixed(6))
  }

  // ─────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────
  const balEth   = balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : '—'
  const isFlying = gameState === 'flying'
  const isCrash  = gameState === 'crashed'
  const isCashed = gameState === 'cashed'

  const multColor = isCrash ? '#d95c5c' : isCashed ? '#3dcfb0' : isFlying ? '#5ba3d9' : '#2e4a66'

  return (
    <>
      {/* ── HEADER ── */}
      <div style={{ ...styles.headerWrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '8px 10px' : '10px 16px', background: '#06080f', borderBottom: '1px solid rgba(90,130,200,0.12)' }}>
        {/* Left: logo + referral */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
          <img src={cometLogo} alt="Comet Games" style={{ width: isMobile ? 40 : 52, height: isMobile ? 40 : 52, borderRadius: 10, objectFit: 'cover' }} />
          {authenticated && address && (
            <button
              onClick={copyReferral}
              style={{ ...styles.btnReferral, ...(isMobile ? { fontSize: '0.65rem', padding: '4px 8px' } : {}) }}
            >
              {referralCopied ? '✓ Link copiado!' : '🔗 Referral'}
            </button>
          )}
        </div>

        {/* Wallet widget */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8 }}>
          {authenticated && address ? (
            <>
              <div style={styles.walletInfo}>
                <span style={{ ...styles.walletBal, fontSize: isMobile ? '0.78rem' : '0.92rem' }}>
                  {balEth} <span style={{ color: '#5ba3d9', fontSize: '0.65rem' }}>ETH</span>
                </span>
                {!isMobile && <span style={styles.walletAddr2}>{address.slice(0, 6)}…{address.slice(-4)}</span>}
              </div>
              <button onClick={() => setShowDeposit(true)} style={{ ...styles.btnDeposit, ...(isMobile ? styles.btnMobileCompact : {}) }}>
                {isMobile ? '+' : '+ Deposit'}
              </button>
              <button onClick={() => { setShowWithdraw(true); setWithdrawStatus('') }} style={{ ...styles.btnWithdraw, ...(isMobile ? styles.btnMobileCompact : {}) }}>
                {isMobile ? '↑' : '↑ Withdraw'}
              </button>
              <button onClick={logout} style={{ ...styles.btnSmall, ...(isMobile ? styles.btnMobileCompact : {}) }}>
                {isMobile ? '✕' : 'Logout'}
              </button>
            </>
          ) : (
            <button onClick={login} style={{ ...styles.btnLogin, ...(isMobile ? { fontSize: '0.78rem', padding: '8px 14px' } : {}) }}>
              {isMobile ? 'Sign in' : 'Sign in with Google'}
            </button>
          )}
        </div>
      </div>

      {/* ── WITHDRAW MODAL ── */}
      {showWithdraw && address && (
        <div style={styles.modalOverlay} onClick={() => setShowWithdraw(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>↑ Withdraw ETH</span>
              <button onClick={() => setShowWithdraw(false)} style={styles.modalClose}>✕</button>
            </div>

            <p style={styles.modalSubtitle}>
              Send ETH from your game wallet to any external address on <b style={{ color: '#5ba3d9' }}>Soneium Minato</b>.
            </p>

            {/* From */}
            <div style={styles.withdrawLabel}>FROM</div>
            <div style={{ ...styles.addrBox, marginBottom: 12 }}>
              <span style={styles.addrText}>{address}</span>
              <span style={{ fontSize: '0.7rem', color: '#3dcfb0', whiteSpace: 'nowrap' }}>{balEth} ETH</span>
            </div>

            {/* To */}
            <div style={styles.withdrawLabel}>TO ADDRESS</div>
            <input
              type="text"
              placeholder="0x..."
              value={withdrawTo}
              onChange={e => setWithdrawTo(e.target.value)}
              style={styles.withdrawInput}
            />

            {/* Amount */}
            <div style={{ ...styles.withdrawLabel, marginTop: 12 }}>AMOUNT (ETH)</div>
            <div style={styles.amtRow}>
              <input
                type="number"
                placeholder="0.000"
                min="0"
                step="0.001"
                value={withdrawAmt}
                onChange={e => setWithdrawAmt(e.target.value)}
                style={{ ...styles.withdrawInput, flex: 1, marginBottom: 0 }}
              />
              <button onClick={setMaxWithdraw} style={styles.btnMax}>MAX</button>
            </div>

            {/* Status */}
            {withdrawStatus && (
              <div style={styles.withdrawStatus}>{withdrawStatus}</div>
            )}

            <button
              onClick={doWithdraw}
              disabled={withdrawing || !withdrawTo || !withdrawAmt}
              style={{ ...styles.btnWithdrawSend, opacity: (withdrawing || !withdrawTo || !withdrawAmt) ? 0.4 : 1 }}
            >
              {withdrawing ? '⏳ Sending…' : '↑ Send ETH'}
            </button>

            <a
              href={`https://explorer-testnet.soneium.org/address/${address}`}
              target="_blank" rel="noreferrer"
              style={{ ...styles.explorerBtn, marginTop: 12 }}
            >
              View wallet on Explorer ↗
            </a>
          </div>
        </div>
      )}

      {/* ── DEPOSIT MODAL ── */}
      {showDeposit && address && (
        <div style={styles.modalOverlay} onClick={() => setShowDeposit(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Deposit ETH</span>
              <button onClick={() => setShowDeposit(false)} style={styles.modalClose}>✕</button>
            </div>

            <p style={styles.modalSubtitle}>Send ETH from any wallet to your game address on <b style={{ color: '#5ba3d9' }}>Soneium Minato</b> testnet:</p>

            {/* Address box */}
            <div style={styles.addrBox}>
              <span style={styles.addrText}>{address}</span>
              <button onClick={copyAddress} style={styles.btnCopy}>
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>

            <div style={styles.modalSteps}>
              <div style={styles.modalStep}>
                <span style={styles.stepNum}>1</span>
                <span>Get testnet ETH from the <a href="https://faucets.chain.link/soneium-minato" target="_blank" rel="noreferrer" style={styles.modalLink}>Chainlink Faucet 🚰</a></span>
              </div>
              <div style={styles.modalStep}>
                <span style={styles.stepNum}>2</span>
                <span>Copy the address above and paste in your MetaMask or any wallet</span>
              </div>
              <div style={styles.modalStep}>
                <span style={styles.stepNum}>3</span>
                <span>Make sure you're on the <b style={{ color: '#5ba3d9' }}>Soneium Minato (Chain ID: 1946)</b> network</span>
              </div>
              <div style={styles.modalStep}>
                <span style={styles.stepNum}>4</span>
                <span>Send ETH — your balance will update automatically</span>
              </div>
            </div>

            <a
              href={`https://explorer-testnet.soneium.org/address/${address}`}
              target="_blank" rel="noreferrer"
              style={styles.explorerBtn}
            >
              View on Explorer ↗
            </a>
          </div>
        </div>
      )}

      {/* ── EDIT NAME MODAL ── */}
      {showEditName && (
        <div style={styles.modalOverlay} onClick={() => setShowEditName(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>✏️ Edit Player Name</span>
              <button onClick={() => setShowEditName(false)} style={styles.modalClose}>✕</button>
            </div>
            <p style={styles.modalSubtitle}>Choose a display name shown on the leaderboard.</p>
            <input
              type="text"
              placeholder="Enter your name…"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && nameInput.trim() && savePlayerName(nameInput.trim())}
              maxLength={20}
              autoFocus
              style={{ ...styles.withdrawInput, marginBottom: 16 }}
            />
            <button
              onClick={() => nameInput.trim() && savePlayerName(nameInput.trim())}
              disabled={!nameInput.trim()}
              style={{ ...styles.btnWithdrawSend, opacity: nameInput.trim() ? 1 : 0.4 }}
            >
              Save Name
            </button>
          </div>
        </div>
      )}

      {/* ── TWO COLUMN LAYOUT ── */}
      <div style={{ ...styles.twoCol, flexDirection: isMobile ? 'column' : 'row' }}>
      <div style={styles.leftCol}>

      {/* Game canvas */}
      <div style={styles.gameWrap}>
        <canvas ref={canvasRef} style={{ ...styles.canvas, height: isMobile ? 220 : 320 }} />

        {/* Multiplier overlay */}
        <div style={{ ...styles.multDisplay, top: gameState === 'idle' ? 'calc(100% - 80px)' : '12px' }}>
          <div style={{ ...styles.multValue, color: multColor }}>{currentMult.toFixed(2)}x</div>
          <div style={styles.multLabel}>
            {gameState === 'idle' && 'WAITING'}
            {gameState === 'flying' && (gameRef.current.betActive ? 'FLYING — CASH OUT NOW!' : 'FLYING')}
            {gameState === 'crashed' && 'CRASHED!'}
            {gameState === 'cashed' && 'CASHED OUT'}
          </div>
        </div>

        {/* Crash banner */}
        {isCrash && (
          <div style={{ ...styles.banner, background: 'rgba(217,92,92,0.10)' }}>
            <div style={{ ...styles.bannerBig, color: '#d95c5c' }}>💥 ROCKET CRASHED!</div>
            <div style={styles.bannerSmall}>Crashed at {currentMult.toFixed(2)}x</div>
          </div>
        )}

        {/* Cash banner */}
        {isCashed && (
          <div style={{ ...styles.banner, background: 'rgba(61,207,176,0.10)' }}>
            <div style={{ ...styles.bannerBig, color: '#3dcfb0' }}>✅ CASHED OUT!</div>
            <div style={styles.bannerSmall}>{statusMsg}</div>
          </div>
        )}
      </div>

      {/* Status message */}
      {statusMsg && !isCrash && !isCashed && (
        <div style={styles.statusMsg}>{statusMsg}</div>
      )}

      {/* Controls */}
      <div style={{ ...styles.panel, padding: isMobile ? '14px 14px' : '20px 24px' }}>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>BET AMOUNT (ETH)</label>
          <input
            type="range" min="1" max="10" step="1"
            value={BET_VALUES.indexOf(betAmount) + 1}
            onChange={e => setBetAmount(BET_VALUES[e.target.value - 1])}
            disabled={isFlying}
            style={{ accentColor: '#5ba3d9', cursor: 'pointer', width: '100%' }}
          />
          <span style={styles.valDisplay}>{betAmount.toFixed(3)} ETH</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            onClick={startBet}
            disabled={isFlying}
            style={{ ...styles.btn, ...styles.btnBet, opacity: isFlying ? 0.35 : 1, flex: 1, padding: isMobile ? '12px 8px' : '14px 28px' }}
          >
            {authenticated ? '🚀 BET' : '🔑 LOGIN'}
          </button>
          <button
            onClick={cashOut}
            disabled={!isFlying || !gameRef.current.betActive}
            style={{ ...styles.btn, ...styles.btnCashout, opacity: (!isFlying || !gameRef.current.betActive) ? 0.35 : 1, flex: 1, padding: isMobile ? '12px 8px' : '14px 28px' }}
          >
            💰 CASH OUT
          </button>
        </div>
      </div>

      {/* History */}
      <div style={styles.historyWrap}>
        <div style={styles.historyTitle}>LAST ROUNDS</div>
        <div style={styles.historyList}>
          {history.map((h, i) => (
            <span key={i} style={{ ...styles.historyChip, ...(h.won ? styles.chipWin : styles.chipLose) }}>
              {h.mult.toFixed(2)}x
            </span>
          ))}
        </div>
      </div>
    </div>

    {/* ── RIGHT COLUMN ── */}
    <div style={{ ...styles.rightCol, ...(isMobile ? styles.rightColMobile : {}) }}>

      {/* Logo card */}
      <div style={styles.logoCard}>
        <img src={cometLogo} alt="Comet Games" style={styles.logoLarge} />
        <div style={styles.logoTitle}>COMET GAMES</div>
        <div style={styles.logoSub}>Rocket Crash · Soneium</div>
      </div>

      {/* Player card */}
      {authenticated && address && (
        <div style={styles.playerCard}>
          <div style={styles.playerRow}>
            <div style={styles.playerAvatar}>
              {(playerName || address.slice(2, 4)).slice(0, 2).toUpperCase()}
            </div>
            <div style={styles.playerInfo}>
              <div style={styles.playerName}>{playerName || `${address.slice(0, 6)}…${address.slice(-4)}`}</div>
              <div style={styles.playerBal}>{balEth} ETH</div>
            </div>
          </div>
          <div style={styles.playerBtns}>
            <button
              onClick={() => { setNameInput(playerName); setShowEditName(true) }}
              style={styles.btnPlayerAction}
            >
              ✏️ Edit Name
            </button>
            <button
              onClick={copyReferral}
              style={{ ...styles.btnPlayerAction, color: referralCopied ? '#3dcfb0' : '#c8873a', borderColor: referralCopied ? 'rgba(61,207,176,0.35)' : 'rgba(200,135,58,0.35)' }}
            >
              {referralCopied ? '✓ Copied!' : '🔗 Referral'}
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div style={styles.lbCard}>
        <div style={styles.lbHeader}>
          <span style={styles.lbTitle}>🏆 LEADERBOARD</span>
          <span style={styles.lbPeriod}>All Time</span>
        </div>
        <div style={styles.lbList}>
          {leaderboard.map((row) => (
            <div key={row.rank} style={{ ...styles.lbRow, ...(row.rank <= 3 ? styles.lbRowTop : {}) }}>
              <span style={{ ...styles.lbRank, ...(row.rank === 1 ? { color: '#f4c84a' } : row.rank === 2 ? { color: '#b0bec5' } : row.rank === 3 ? { color: '#c8873a' } : {}) }}>
                {row.rank <= 3 ? ['🥇','🥈','🥉'][row.rank - 1] : `#${row.rank}`}
              </span>
              <span style={styles.lbName}>{row.name}</span>
              <div style={styles.lbStats}>
                <span style={styles.lbProfit}>+{row.profit.toFixed(3)}</span>
                <span style={styles.lbWins}>{row.wins}W</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Check-in */}
      <CheckIn address={address} authenticated={authenticated} />
    </div>
    </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────
//  STYLES  —  Comet "Void Trajectory" palette
//
//  Background:    #000000  (true black — banner blends in)
//  Surface dark:  #0a0c14  (card bg, very dark navy-black)
//  Surface mid:   #0e1220  (inputs, inner boxes)
//  Border:        rgba(90,130,200,0.18)  (cold blue hairline)
//  Text primary:  #c8dff5  (cool off-white)
//  Text muted:    #4a6a90  (slate blue)
//  Accent blue:   #5ba3d9  (icy blue — from the ring)
//  Accent amber:  #c8873a  (comet tail amber)
//  Win green:     #3dcfb0  (teal, slightly desaturated)
//  Crash red:     #d95c5c
// ─────────────────────────────────────────────────────────
const styles = {
  // ── Two-column layout
  twoCol:           { display: 'flex', gap: 14, width: '100%', maxWidth: 1060, alignItems: 'flex-start' },
  leftCol:          { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 0, width: '100%' },
  rightCol:         { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 0 },
  rightColMobile:   { width: '100%' },

  // ── Header
  headerWrap:         { width: '100%', maxWidth: 1060, borderRadius: '0 0 12px 12px', marginBottom: 4 },
  btnMobileCompact:   { padding: '5px 8px', fontSize: '0.75rem', minWidth: 28 },

  // ── Wallet widget
  walletInfo:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
  walletBal:    { fontSize: '0.92rem', fontWeight: 700, color: '#c8dff5' },
  walletAddr2:  { fontSize: '0.62rem', color: '#2e4a66', fontFamily: 'monospace' },
  btnDeposit:   { padding: '6px 12px', background: 'rgba(91,163,217,0.15)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.35)', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: '0.76rem', whiteSpace: 'nowrap', letterSpacing: 0.3 },
  btnWithdraw:  { padding: '6px 12px', background: 'rgba(200,135,58,0.15)', color: '#c8873a', border: '1px solid rgba(200,135,58,0.35)', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: '0.76rem', whiteSpace: 'nowrap', letterSpacing: 0.3 },
  withdrawLabel:{ fontSize: '0.63rem', letterSpacing: 1.8, color: '#4a6a90', marginBottom: 6, textTransform: 'uppercase' },
  withdrawInput:{ width: '100%', background: '#0e1220', border: '1px solid rgba(90,130,200,0.18)', borderRadius: 9, padding: '10px 14px', color: '#c8dff5', fontSize: '0.85rem', outline: 'none', marginBottom: 4, fontFamily: 'monospace', boxSizing: 'border-box' },
  amtRow:       { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 },
  btnMax:       { padding: '10px 14px', background: 'rgba(91,163,217,0.10)', border: '1px solid rgba(91,163,217,0.28)', color: '#5ba3d9', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' },
  withdrawStatus:{ fontSize: '0.82rem', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginTop: 8, marginBottom: 4, color: '#c8dff5' },
  btnWithdrawSend:{ width: '100%', marginTop: 14, padding: '14px', background: 'rgba(91,163,217,0.18)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.40)', borderRadius: 11, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', letterSpacing: 1 },

  // ── Modals
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modalBox:     { background: '#0a0c14', border: '1px solid rgba(90,130,200,0.18)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 480 },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: '1.15rem', fontWeight: 800, color: '#c8dff5', letterSpacing: 0.5 },
  modalClose:   { background: 'none', border: 'none', color: '#2e4a66', fontSize: '1.1rem', cursor: 'pointer' },
  modalSubtitle:{ fontSize: '0.80rem', color: '#4a6a90', marginBottom: 18, lineHeight: 1.6 },
  addrBox:      { display: 'flex', alignItems: 'center', gap: 8, background: '#0e1220', borderRadius: 9, padding: '10px 14px', marginBottom: 20, border: '1px solid rgba(90,130,200,0.12)' },
  addrText:     { fontSize: '0.70rem', fontFamily: 'monospace', color: '#8ab4d4', flex: 1, wordBreak: 'break-all' },
  btnCopy:      { padding: '6px 14px', background: 'rgba(91,163,217,0.14)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.32)', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: '0.74rem', whiteSpace: 'nowrap' },
  modalSteps:   { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 },
  modalStep:    { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.80rem', color: '#4a6a90', lineHeight: 1.6 },
  stepNum:      { background: '#0e1220', color: '#5ba3d9', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.72rem', flexShrink: 0, border: '1px solid rgba(91,163,217,0.25)' },
  modalLink:    { color: '#5ba3d9', textDecoration: 'none' },
  explorerBtn:  { display: 'block', textAlign: 'center', padding: '10px', background: 'rgba(91,163,217,0.06)', border: '1px solid rgba(91,163,217,0.18)', borderRadius: 9, color: '#5ba3d9', textDecoration: 'none', fontSize: '0.78rem', letterSpacing: 0.3 },

  label:        { fontSize: '0.7rem', color: '#4a6a90', letterSpacing: 1 },
  amount:       { fontSize: '1.1rem', fontWeight: 700, color: '#c8dff5' },
  profitTag:    { fontSize: '0.8rem', fontWeight: 700, padding: '2px 10px', borderRadius: 999 },
  profitPos:    { background: 'rgba(61,207,176,0.12)', color: '#3dcfb0' },
  profitNeg:    { background: 'rgba(217,92,92,0.12)', color: '#d95c5c' },
  btnSmall:     { padding: '6px 10px', background: 'rgba(255,255,255,0.03)', color: '#4a6a90', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 7, cursor: 'pointer', fontSize: '0.72rem' },
  btnLogin:     { padding: '10px 20px', background: 'rgba(91,163,217,0.16)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.38)', borderRadius: 9, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', letterSpacing: 0.5 },
  walletAddr:   { fontSize: '0.75rem', color: '#2e4a66', fontFamily: 'monospace' },
  explorerLink: { fontSize: '0.72rem', color: '#5ba3d9', textDecoration: 'none' },
  faucetLink:   { fontSize: '0.72rem', color: '#c8873a', textDecoration: 'none' },

  // ── Game area
  gameWrap:    { width: '100%', background: '#040608', border: '1px solid rgba(90,130,200,0.14)', borderTop: 'none', borderRadius: '0 0 16px 16px', overflow: 'hidden', position: 'relative', marginBottom: 16 },
  canvas:      { display: 'block', width: '100%', height: 320 },
  multDisplay: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', transition: 'top 0.35s ease' },
  multValue:   { fontSize: 'clamp(2.8rem, 8vw, 4.5rem)', fontWeight: 900, lineHeight: 1, textShadow: '0 0 40px currentColor', transition: 'color 0.2s' },
  multLabel:   { fontSize: '0.70rem', letterSpacing: 3.5, opacity: 0.45, marginTop: 6, textTransform: 'uppercase' },
  banner:      { display: 'flex', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 },
  bannerBig:   { fontSize: '2rem', fontWeight: 900 },
  bannerSmall: { fontSize: '0.85rem', color: '#8ab4d4' },
  statusMsg:   { width: '100%', textAlign: 'center', fontSize: '0.83rem', color: '#4a6a90', marginBottom: 8 },

  // ── Controls panel
  panel:       { width: '100%', background: '#0a0c14', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 14, padding: '20px 24px', marginBottom: 14 },
  panelRow:    { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  field:       { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' },
  fieldLabel:  { fontSize: '0.68rem', letterSpacing: '1.8px', color: '#4a6a90', textTransform: 'uppercase' },
  valDisplay:  { fontSize: '1rem', fontWeight: 700, color: '#5ba3d9' },
  btn:         { padding: '14px 28px', border: 'none', borderRadius: 11, fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: 0.8, flex: 1, minWidth: 140 },
  btnBet:      { background: 'rgba(91,163,217,0.16)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.40)' },
  btnCashout:  { background: 'rgba(200,135,58,0.16)', color: '#c8873a', border: '1px solid rgba(200,135,58,0.40)' },

  // ── History
  historyWrap: { width: '100%' },
  historyTitle:{ fontSize: '0.68rem', letterSpacing: 2.5, color: '#2e4a66', textTransform: 'uppercase', marginBottom: 8 },
  historyList: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  historyChip: { padding: '4px 10px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 700 },
  chipWin:     { background: 'rgba(61,207,176,0.10)', color: '#3dcfb0', border: '1px solid rgba(61,207,176,0.22)' },
  chipLose:    { background: 'rgba(217,92,92,0.10)', color: '#d95c5c', border: '1px solid rgba(217,92,92,0.22)' },

  // ── Header referral button
  btnReferral:  { padding: '5px 12px', background: 'rgba(200,135,58,0.12)', color: '#c8873a', border: '1px solid rgba(200,135,58,0.30)', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: '0.74rem', whiteSpace: 'nowrap', letterSpacing: 0.3 },

  // ── Logo card (right column)
  logoCard:    { width: '100%', background: '#06080f', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 16, padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  logoLarge:   { width: 96, height: 96, borderRadius: 20, objectFit: 'cover', boxShadow: '0 0 32px rgba(91,163,217,0.25)' },
  logoTitle:   { fontSize: '0.95rem', fontWeight: 900, color: '#c8dff5', letterSpacing: 3.5, textTransform: 'uppercase', marginTop: 4 },
  logoSub:     { fontSize: '0.65rem', color: '#2e4a66', letterSpacing: 1.5 },

  // ── Player card (right column)
  playerCard:  { width: '100%', background: '#0a0c14', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 14, padding: '14px 14px 12px' },
  playerRow:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  playerAvatar:{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#1e3a5f,#0e1f3a)', border: '1px solid rgba(91,163,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: '#5ba3d9', flexShrink: 0 },
  playerInfo:  { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  playerName:  { fontSize: '0.85rem', fontWeight: 700, color: '#c8dff5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerBal:   { fontSize: '0.70rem', color: '#4a6a90', fontFamily: 'monospace' },
  playerBtns:  { display: 'flex', gap: 8 },
  btnPlayerAction: { flex: 1, padding: '7px 6px', background: 'rgba(91,163,217,0.08)', color: '#5ba3d9', border: '1px solid rgba(91,163,217,0.22)', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.70rem', textAlign: 'center', whiteSpace: 'nowrap' },

  // ── Leaderboard card
  lbCard:   { width: '100%', background: '#0a0c14', border: '1px solid rgba(90,130,200,0.14)', borderRadius: 14, overflow: 'hidden' },
  lbHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 10px', borderBottom: '1px solid rgba(90,130,200,0.08)' },
  lbTitle:  { fontSize: '0.72rem', fontWeight: 800, color: '#c8dff5', letterSpacing: 2, textTransform: 'uppercase' },
  lbPeriod: { fontSize: '0.60rem', color: '#2e4a66', letterSpacing: 1 },
  lbList:   { display: 'flex', flexDirection: 'column' },
  lbRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid rgba(90,130,200,0.05)' },
  lbRowTop: { background: 'rgba(91,163,217,0.04)' },
  lbRank:   { fontSize: '0.82rem', width: 24, flexShrink: 0, textAlign: 'center', color: '#4a6a90', fontWeight: 700 },
  lbName:   { flex: 1, fontSize: '0.78rem', color: '#c8dff5', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lbStats:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
  lbProfit: { fontSize: '0.72rem', fontWeight: 700, color: '#3dcfb0' },
  lbWins:   { fontSize: '0.60rem', color: '#2e4a66' },
}
