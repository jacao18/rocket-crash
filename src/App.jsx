import cometLogo from './assets/comet-logo.png'
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
    bg.addColorStop(0, '#0F2040')
    bg.addColorStop(1, 'rgba(8,16,31,0)')
    ctx.fillStyle = '#08101F'; ctx.fillRect(0, 0, W, H)
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

      // Expire the round on-chain so the next bet is not blocked
      writeContractAsync({
        address: ROCKET_CRASH_ADDRESS,
        abi: ROCKET_CRASH_ABI,
        functionName: 'expireRound',
        args: [address],
      }).then(() => refetchBalance()).catch(err => console.warn('expireRound failed:', err))
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

  const multColor = isCrash ? '#f87171' : isCashed ? '#00E5C8' : isFlying ? '#00C2FF' : '#4d7aaa'

  return (
    <>
      {/* ── TOP BAR ── */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <img src={cometLogo} alt="Comet" style={styles.brandLogo} />
          <p style={styles.subtitle}>ROCKET CRASH · SONEIUM MINATO TESTNET</p>
        </div>

        {/* Wallet widget — top right */}
        <div style={styles.walletWidget}>
          {authenticated && address ? (
            <>
              <div style={styles.walletInfo}>
                <span style={styles.walletBal}>{balEth} <span style={{ color: '#818cf8', fontSize: '0.7rem' }}>ETH</span></span>
                <span style={styles.walletAddr2}>{address.slice(0, 6)}…{address.slice(-4)}</span>
              </div>
              <button onClick={() => setShowDeposit(true)} style={styles.btnDeposit}>+ Deposit</button>
              <button onClick={() => { setShowWithdraw(true); setWithdrawStatus('') }} style={styles.btnWithdraw}>↑ Withdraw</button>
              <button onClick={logout} style={styles.btnSmall}>Logout</button>
            </>
          ) : (
            <button onClick={login} style={styles.btnLogin}>Sign in with Google</button>
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
              Send ETH from your game wallet to any external address on <b style={{ color: '#00C2FF' }}>Soneium Minato</b>.
            </p>

            {/* From */}
            <div style={styles.withdrawLabel}>FROM</div>
            <div style={{ ...styles.addrBox, marginBottom: 12 }}>
              <span style={styles.addrText}>{address}</span>
              <span style={{ fontSize: '0.7rem', color: '#4ade80', whiteSpace: 'nowrap' }}>{balEth} ETH</span>
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

            <p style={styles.modalSubtitle}>Send ETH from any wallet to your game address on <b style={{ color: '#00C2FF' }}>Soneium Minato</b> testnet:</p>

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
                <span>Make sure you're on the <b style={{ color: '#00C2FF' }}>Soneium Minato (Chain ID: 1946)</b> network</span>
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
              style={{ accentColor: '#00C2FF', cursor: 'pointer', width: '100%' }}
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
//  STYLES  —  Comet brand palette
//  Primary cyan:  #00C2FF  /  #0070D2
//  Dark navy bg:  #08101F  /  #0D1A2E
//  Card surface:  #0F2040
//  Border:        #1A3560
//  Accent teal:   #00E5C8
// ─────────────────────────────────────────────────────────
const styles = {
  // ── Top bar
  topBar:       { width: '100%', maxWidth: 680, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  topLeft:      { display: 'flex', flexDirection: 'column', gap: 4 },
  brandLogo:    { height: 52, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,194,255,0.35))' },
  subtitle:     { fontSize: '0.68rem', color: '#4d7aaa', letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── Wallet widget (top right)
  walletWidget: { display: 'flex', alignItems: 'center', gap: 8, background: '#0F2040', border: '1px solid #1A3560', borderRadius: 14, padding: '8px 12px' },
  walletInfo:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
  walletBal:    { fontSize: '0.95rem', fontWeight: 700, color: '#a8d4ff' },
  walletAddr2:  { fontSize: '0.65rem', color: '#3a5c80', fontFamily: 'monospace' },
  btnDeposit:   { padding: '6px 12px', background: 'linear-gradient(135deg,#00C2FF,#0070D2)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' },
  btnWithdraw:  { padding: '6px 12px', background: 'linear-gradient(135deg,#00E5C8,#0099B8)', color: '#08101F', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' },
  withdrawLabel:{ fontSize: '0.65rem', letterSpacing: 1.5, color: '#4d7aaa', marginBottom: 6, textTransform: 'uppercase' },
  withdrawInput:{ width: '100%', background: '#0D1A2E', border: '1px solid #1A3560', borderRadius: 10, padding: '10px 14px', color: '#d0eaff', fontSize: '0.85rem', outline: 'none', marginBottom: 4, fontFamily: 'monospace', boxSizing: 'border-box' },
  amtRow:       { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 },
  btnMax:       { padding: '10px 14px', background: 'rgba(0,194,255,0.12)', border: '1px solid rgba(0,194,255,0.3)', color: '#00C2FF', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' },
  withdrawStatus:{ fontSize: '0.82rem', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginTop: 8, marginBottom: 4, color: '#d0eaff' },
  btnWithdrawSend:{ width: '100%', marginTop: 14, padding: '14px', background: 'linear-gradient(135deg,#00C2FF,#0070D2)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', letterSpacing: 1 },

  // ── Deposit modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modalBox:     { background: '#0F2040', border: '1px solid #1A3560', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480 },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: '1.2rem', fontWeight: 800, color: '#fff' },
  modalClose:   { background: 'none', border: 'none', color: '#3a5c80', fontSize: '1.1rem', cursor: 'pointer' },
  modalSubtitle:{ fontSize: '0.82rem', color: '#7aaac8', marginBottom: 18, lineHeight: 1.5 },
  addrBox:      { display: 'flex', alignItems: 'center', gap: 8, background: '#0D1A2E', borderRadius: 10, padding: '10px 14px', marginBottom: 20 },
  addrText:     { fontSize: '0.72rem', fontFamily: 'monospace', color: '#a8d4ff', flex: 1, wordBreak: 'break-all' },
  btnCopy:      { padding: '6px 14px', background: 'linear-gradient(135deg,#00C2FF,#0070D2)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' },
  modalSteps:   { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 },
  modalStep:    { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.8rem', color: '#7aaac8', lineHeight: 1.5 },
  stepNum:      { background: '#0D1A2E', color: '#00C2FF', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', flexShrink: 0 },
  modalLink:    { color: '#00C2FF', textDecoration: 'none' },
  explorerBtn:  { display: 'block', textAlign: 'center', padding: '10px', background: 'rgba(0,194,255,0.08)', border: '1px solid rgba(0,194,255,0.2)', borderRadius: 10, color: '#00C2FF', textDecoration: 'none', fontSize: '0.8rem' },

  label:        { fontSize: '0.7rem', color: '#4d7aaa', letterSpacing: 1 },
  amount:       { fontSize: '1.1rem', fontWeight: 700, color: '#a8d4ff' },
  profitTag:    { fontSize: '0.8rem', fontWeight: 700, padding: '2px 10px', borderRadius: 999 },
  profitPos:    { background: 'rgba(0,229,200,0.15)', color: '#00E5C8' },
  profitNeg:    { background: 'rgba(239,68,68,0.15)', color: '#f87171' },
  btnSmall:     { padding: '6px 10px', background: 'rgba(255,255,255,0.05)', color: '#7aaac8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem' },
  btnLogin:     { padding: '10px 20px', background: 'linear-gradient(135deg,#00C2FF,#0070D2)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' },
  walletAddr:   { fontSize: '0.75rem', color: '#3a5c80', fontFamily: 'monospace' },
  explorerLink: { fontSize: '0.72rem', color: '#00C2FF', textDecoration: 'none' },
  faucetLink:   { fontSize: '0.72rem', color: '#00E5C8', textDecoration: 'none' },
  gameWrap:    { width: '100%', maxWidth: 680, background: '#0F2040', border: '1px solid #1A3560', borderRadius: 20, overflow: 'hidden', position: 'relative', marginBottom: 20 },
  canvas:      { display: 'block', width: '100%', height: 320 },
  multDisplay: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', transition: 'top 0.35s ease' },
  multValue:   { fontSize: '4.5rem', fontWeight: 900, lineHeight: 1, textShadow: '0 0 40px currentColor', transition: 'color 0.2s' },
  multLabel:   { fontSize: '0.72rem', letterSpacing: 3, opacity: 0.55, marginTop: 6, textTransform: 'uppercase' },
  banner:      { display: 'flex', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 },
  bannerBig:   { fontSize: '2rem', fontWeight: 900 },
  bannerSmall: { fontSize: '0.85rem', color: '#d0eaff' },
  statusMsg:   { width: '100%', maxWidth: 680, textAlign: 'center', fontSize: '0.85rem', color: '#7aaac8', marginBottom: 8 },
  panel:       { width: '100%', maxWidth: 680, background: '#0F2040', border: '1px solid #1A3560', borderRadius: 16, padding: '20px 24px', marginBottom: 16 },
  panelRow:    { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  field:       { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 },
  fieldLabel:  { fontSize: '0.7rem', letterSpacing: '1.5px', color: '#4d7aaa', textTransform: 'uppercase' },
  valDisplay:  { fontSize: '1rem', fontWeight: 700, color: '#00C2FF' },
  btn:         { padding: '14px 28px', border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 800, cursor: 'pointer', letterSpacing: 1, flex: 1, minWidth: 140 },
  btnBet:      { background: 'linear-gradient(135deg,#00C2FF,#0070D2)', color: '#fff' },
  btnCashout:  { background: 'linear-gradient(135deg,#00E5C8,#00A896)', color: '#08101F' },
  historyWrap: { width: '100%', maxWidth: 680 },
  historyTitle:{ fontSize: '0.7rem', letterSpacing: 2, color: '#4d7aaa', textTransform: 'uppercase', marginBottom: 8 },
  historyList: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  historyChip: { padding: '4px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 },
  chipWin:     { background: 'rgba(0,229,200,0.15)', color: '#00E5C8', border: '1px solid rgba(0,229,200,0.3)' },
  chipLose:    { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
}
