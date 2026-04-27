/**
 * GET /api/checkin-price
 * Returns the ETH amount in wei equivalent to $0.01 USD,
 * fetched from CoinGecko. Cached for 5 minutes.
 */

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
let cache = { price: null, ts: 0 }

const TARGET_USD = 0.01 // $0.01

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Serve from cache if fresh
    if (cache.price && Date.now() - cache.ts < CACHE_TTL) {
      return res.status(200).json(cache.price)
    }

    // Fetch ETH price from CoinGecko (free tier, no key needed)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    )

    if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`)
    const data = await response.json()
    const ethPriceUsd = data?.ethereum?.usd

    if (!ethPriceUsd || ethPriceUsd <= 0) throw new Error('Invalid price from CoinGecko')

    // Calculate wei for $0.01
    const ethAmount    = TARGET_USD / ethPriceUsd
    const weiAmount    = BigInt(Math.ceil(ethAmount * 1e18))
    // Add 20% buffer for gas price fluctuations so tx doesn't fail
    const weiWithBuffer = weiAmount + weiAmount / 5n

    const result = {
      ethPriceUsd,
      targetUsd:   TARGET_USD,
      ethAmount:   ethAmount.toFixed(8),
      weiAmount:   weiAmount.toString(),
      weiWithBuffer: weiWithBuffer.toString(),
      cachedAt:    Date.now(),
    }

    cache = { price: result, ts: Date.now() }
    console.log(`[checkin-price] ETH=$${ethPriceUsd}, $0.01 = ${ethAmount.toFixed(8)} ETH`)

    return res.status(200).json(result)
  } catch (err) {
    console.error('[checkin-price] error:', err.message)

    // Fallback: use a hardcoded conservative estimate if CoinGecko is down
    // At $2000/ETH: $0.01 = 0.000005 ETH = 5000000000000 wei
    const fallback = {
      ethPriceUsd:   2000,
      targetUsd:     TARGET_USD,
      ethAmount:     '0.00000500',
      weiAmount:     '5000000000000',
      weiWithBuffer: '6000000000000',
      fallback:      true,
    }
    return res.status(200).json(fallback)
  }
}
