import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useBalance, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useEffect, useRef, useState } from 'react'
import { ROCKET_CRASH_ABI, ROCKET_CRASH_ADDRESS } from './contract.js'
import { useWriteContract, useWatchContractEvent } from 'wagmi'

// ─── BET VALUES ──────────────────────────────────────────────
const BET_VALUES = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.010]
const SPEED_K    = 0.18

export default function App() {
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

  const canvasRef    = useRef(null)
  const gameRef      = useRef({
    animId: null, startTime: null, lastTs: null,
    targetMult: 1, betActive: false,
    stars: [], particles: [], explodeParticles: [],
    rocketX: 0, rocketY: 0,
    currentMult: 0.8, gameState: 'idle',
  })

  // ── Contract write
  const { writeContractAsync } = useWriteContract()

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
    bg.addColorStop(0, '#0d1325')
    bg.addColorStop(1, 'rgba(7,9,20,0)')
    ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, W, H)
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
      refetchBalance()
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

    const mult     = g.currentMult
    const netGain  = betAmount * mult - betAmount
    setProfit(p => p + netGain)
    setHistory(h => [{ mult, won: true }, ...h].slice(0, 15))

    setStatusMsg(`Cashed out at ${mult.toFixed(2)}x — waiting for payout…`)

    try {
      await writeContractAsync({
        address: ROCKET_CRASH_ADDRESS,
        abi: ROCKET_CRASH_ABI,
        functionName: 'cashOut',
      })
      refetchBalance()
      setStatusMsg(`✅ +${netGain.toFixed(4)} ETH at ${mult.toFixed(2)}x`)
    } catch (err) {
      console.error(err)
      setStatusMsg('Cashout tx failed.')
    }

    setTimeout(() => resetIdle(), 3200)
  }

  function drawCrashPoint() {
    const u = Math.random()
    let v = 0.8 + (-Math.log(u) / 0.7)
    return parseFloat(Math.max(0.81, Math.min(10.00, v)).toFixed(2))
  }

  // ─────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────
  const balEth   = balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : '—'
  const isFlying = gameState === 'flying'
  const isCrash  = gameState === 'crashed'
  const isCashed = gameState === 'cashed'

  const multColor = isCrash ? '#f87171' : isCashed ? '#4ade80' : isFlying ? '#22d3ee' : '#94a3b8'

  return (
    <>
      <h1 style={styles.h1}>🚀 ROCKET <span style={{ color: '#f97316' }}>CRASH</span></h1>
      <p style={styles.subtitle}>SONEIUM MINATO TESTNET</p>

      {/* Balance / Auth bar */}
      <div style={styles.balanceBar}>
        <span style={styles.label}>BALANCE</span>
        {authenticated ? (
          <>
            <span style={styles.amount}>{balEth} <span style={{ color: '#818cf8', fontSize: '0.75rem' }}>ETH</span></span>
            <span style={{ ...styles.profitTag, ...(profit >= 0 ? styles.profitPos : styles.profitNeg), opacity: profit !== 0 ? 1 : 0 }}>
              {profit >= 0 ? '+' : ''}{profit.toFixed(4)} ETH
            </span>
            <button onClick={logout} style={styles.btnSmall}>Logout</button>
          </>
        ) : (
          <button onClick={login} style={styles.btnLogin}>Sign in with Google</button>
        )}
      </div>

      {/* Wallet address */}
      {address && (
        <div style={styles.walletRow}>
          <span style={styles.walletAddr}>{address.slice(0, 6)}…{address.slice(-4)}</span>
          <a href={`https://explorer-testnet.soneium.org/address/${address}`} target="_blank" rel="noreferrer" style={styles.explorerLink}>View on Explorer ↗</a>
          <a href="https://faucets.chain.link/soneium-minato" target="_blank" rel="noreferrer" style={styles.faucetLink}>Get Testnet ETH 🚰</a>
        </div>
      )}

      {/* Game canvas */}
      <div style={styles.gameWrap}>
        <canvas ref={canvasRef} style={styles.canvas} />

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
          <div style={{ ...styles.banner, background: 'rgba(239,68,68,0.15)' }}>
            <div style={{ ...styles.bannerBig, color: '#f87171' }}>💥 ROCKET CRASHED!</div>
            <div style={styles.bannerSmall}>Crashed at {currentMult.toFixed(2)}x</div>
          </div>
        )}

        {/* Cash banner */}
        {isCashed && (
          <div style={{ ...styles.banner, background: 'rgba(34,197,94,0.12)' }}>
            <div style={{ ...styles.bannerBig, color: '#4ade80' }}>✅ CASHED OUT!</div>
            <div style={styles.bannerSmall}>{statusMsg}</div>
          </div>
        )}
      </div>

      {/* Status message */}
      {statusMsg && !isCrash && !isCashed && (
        <div style={styles.statusMsg}>{statusMsg}</div>
      )}

      {/* Controls */}
      <div style={styles.panel}>
        <div style={styles.panelRow}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>BET AMOUNT (ETH)</label>
            <input
              type="range" min="1" max="10" step="1"
              value={BET_VALUES.indexOf(betAmount) + 1}
              onChange={e => setBetAmount(BET_VALUES[e.target.value - 1])}
              disabled={isFlying}
              style={{ accentColor: '#f97316', cursor: 'pointer', width: '100%' }}
            />
            <span style={styles.valDisplay}>{betAmount.toFixed(3)} ETH</span>
          </div>
          <button
            onClick={startBet}
            disabled={isFlying}
            style={{ ...styles.btn, ...styles.btnBet, opacity: isFlying ? 0.35 : 1 }}
          >
            {authenticated ? '🚀 BET' : '🔑 LOGIN TO PLAY'}
          </button>
          <button
            onClick={cashOut}
            disabled={!isFlying || !gameRef.current.betActive}
            style={{ ...styles.btn, ...styles.btnCashout, opacity: (!isFlying || !gameRef.current.betActive) ? 0.35 : 1 }}
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
    </>
  )
}

// ─────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────
const styles = {
  h1:          { fontSize: '1.8rem', fontWeight: 800, letterSpacing: 2, color: '#fff', marginBottom: 4 },
  subtitle:    { fontSize: '0.78rem', color: '#6b7db3', marginBottom: 24, letterSpacing: 1 },
  balanceBar:  { width: '100%', maxWidth: 680, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', marginBottom: 4, gap: 12 },
  label:       { fontSize: '0.7rem', color: '#6b7db3', letterSpacing: 1 },
  amount:      { fontSize: '1.1rem', fontWeight: 700, color: '#c7d2fe' },
  profitTag:   { fontSize: '0.8rem', fontWeight: 700, padding: '2px 10px', borderRadius: 999 },
  profitPos:   { background: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  profitNeg:   { background: 'rgba(239,68,68,0.15)', color: '#f87171' },
  btnSmall:    { fontSize: '0.7rem', padding: '4px 10px', background: 'rgba(255,255,255,0.07)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer' },
  btnLogin:    { padding: '10px 20px', background: 'linear-gradient(135deg,#f97316,#ef4444)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' },
  walletRow:   { width: '100%', maxWidth: 680, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  walletAddr:  { fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' },
  explorerLink:{ fontSize: '0.72rem', color: '#818cf8', textDecoration: 'none' },
  faucetLink:  { fontSize: '0.72rem', color: '#f97316', textDecoration: 'none' },
  gameWrap:    { width: '100%', maxWidth: 680, background: '#0f1529', border: '1px solid #1e2d5a', borderRadius: 20, overflow: 'hidden', position: 'relative', marginBottom: 20 },
  canvas:      { display: 'block', width: '100%', height: 320 },
  multDisplay: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', transition: 'top 0.35s ease' },
  multValue:   { fontSize: '4.5rem', fontWeight: 900, lineHeight: 1, textShadow: '0 0 40px currentColor', transition: 'color 0.2s' },
  multLabel:   { fontSize: '0.72rem', letterSpacing: 3, opacity: 0.55, marginTop: 6, textTransform: 'uppercase' },
  banner:      { display: 'flex', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 },
  bannerBig:   { fontSize: '2rem', fontWeight: 900 },
  bannerSmall: { fontSize: '0.85rem', color: '#e2e8f0' },
  statusMsg:   { width: '100%', maxWidth: 680, textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8 },
  panel:       { width: '100%', maxWidth: 680, background: '#0f1529', border: '1px solid #1e2d5a', borderRadius: 16, padding: '20px 24px', marginBottom: 16 },
  panelRow:    { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  field:       { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 },
  fieldLabel:  { fontSize: '0.7rem', letterSpacing: '1.5px', color: '#6b7db3', textTransform: 'uppercase' },
  valDisplay:  { fontSize: '1rem', fontWeight: 700, color: '#f97316' },
  btn:         { padding: '14px 28px', border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: 1, flex: 1, minWidth: 140 },
  btnBet:      { background: 'linear-gradient(135deg,#f97316,#ef4444)', color: '#fff' },
  btnCashout:  { background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff' },
  historyWrap: { width: '100%', maxWidth: 680 },
  historyTitle:{ fontSize: '0.7rem', letterSpacing: 2, color: '#6b7db3', textTransform: 'uppercase', marginBottom: 8 },
  historyList: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  historyChip: { padding: '4px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 },
  chipWin:     { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' },
  chipLose:    { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
}
