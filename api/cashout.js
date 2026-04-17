/**
 * POST /api/cashout
 * Body: { player: "0x...", betAmount: "0.005", multX100: 245 }
 *   multX100 = Math.round(currentMult * 100), e.g. 2.45x → 245
 *   betAmount = string in ETH, e.g. "0.005"
 *
 * The backend signs and sends payout() to the contract using the owner key.
 * betAmount is passed from the frontend (player cannot inflate it beyond MAX_BET
 * because the contract enforced the range at placeBet() time).
 */
import { parseEther } from 'viem'
import { getOwnerWalletClient, getPublicClient, ROCKET_CRASH_ABI, CONTRACT_ADDRESS } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { player, betAmount, multX100 } = req.body

  if (!player || !betAmount || multX100 == null) {
    return res.status(400).json({ error: 'Missing player, betAmount or multX100' })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(player)) {
    return res.status(400).json({ error: 'Invalid player address' })
  }

  const mult = Number(multX100)
  if (!Number.isInteger(mult) || mult < 80 || mult > 1000) {
    return res.status(400).json({ error: 'Invalid multX100 (must be 80–1000)' })
  }

  const betFloat = parseFloat(betAmount)
  if (isNaN(betFloat) || betFloat < 0.001 || betFloat > 0.010) {
    return res.status(400).json({ error: 'Invalid betAmount (must be 0.001–0.010 ETH)' })
  }

  try {
    const walletClient = getOwnerWalletClient()
    const publicClient = getPublicClient()

    const betWei = parseEther(String(betAmount))

    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: ROCKET_CRASH_ABI,
      functionName: 'payout',
      args: [player, betWei, BigInt(mult)],
      account: walletClient.account,
    })

    const txHash = await walletClient.writeContract(request)
    console.log(`[cashout] payout sent — player: ${player}, mult: ${mult/100}x, tx: ${txHash}`)

    return res.status(200).json({ ok: true, txHash })
  } catch (err) {
    console.error('[cashout] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
