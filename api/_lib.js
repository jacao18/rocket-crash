// Shared helpers for all API routes
import { createWalletClient, createPublicClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.minato.soneium.org/'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer-testnet.soneium.org' } },
})

export const ROCKET_CRASH_ABI = [
  {
    "inputs": [
      { "name": "player",    "type": "address" },
      { "name": "betAmount", "type": "uint256" },
      { "name": "multX100",  "type": "uint256" }
    ],
    "name": "payout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "player",    "type": "address" },
      { "name": "betAmount", "type": "uint256" }
    ],
    "name": "registerCrash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getBalance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
]

export const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS || '0x03670B7279D0Db9f6207b6E79D17577f09Bfed0e'

export function getOwnerWalletClient() {
  const pk = process.env.OWNER_PRIVATE_KEY
  if (!pk) throw new Error('OWNER_PRIVATE_KEY not set')
  const key = pk.startsWith('0x') ? pk : `0x${pk}`
  const account = privateKeyToAccount(key)
  return createWalletClient({ account, chain: minatoTestnet, transport: http() })
}

export function getPublicClient() {
  return createPublicClient({ chain: minatoTestnet, transport: http() })
}

// Simple in-memory store for active bets (resets on cold start — fine for testnet demo)
// In production, replace with Redis or a DB.
export const activeBets = new Map()
// Map<playerAddress, { betAmount: bigint, timestamp: number }>
