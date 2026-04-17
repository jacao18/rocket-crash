// ── Filled after deploy — update after running: npx hardhat run scripts/deploy.cjs --network minato
// Can also be set via VITE_CONTRACT_ADDRESS env var in .env
export const ROCKET_CRASH_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'

export const ROCKET_CRASH_ABI = [
  {
    "inputs": [],
    "stateMutability": "payable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "player",    "type": "address" },
      { "indexed": false, "name": "amount",    "type": "uint256" }
    ],
    "name": "BetPlaced",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "player",    "type": "address" },
      { "indexed": false, "name": "betAmount", "type": "uint256" },
      { "indexed": false, "name": "multX100",  "type": "uint256" },
      { "indexed": false, "name": "payout",    "type": "uint256" }
    ],
    "name": "Payout",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "player",    "type": "address" },
      { "indexed": false, "name": "betAmount", "type": "uint256" }
    ],
    "name": "Crashed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "placeBet",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
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
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "name": "withdraw",
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
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
]
