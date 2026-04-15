// ── Deploy address (fill in after running: npx hardhat run scripts/deploy.js --network minato)
export const ROCKET_CRASH_ADDRESS = '0x30D3f40B24c35758aE896390AfCEDbe0Cc8a228D'

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
      { "indexed": false, "name": "amount",    "type": "uint256" },
      { "indexed": false, "name": "timestamp", "type": "uint256" }
    ],
    "name": "BetPlaced",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "player",      "type": "address" },
      { "indexed": false, "name": "betAmount",   "type": "uint256" },
      { "indexed": false, "name": "multX100",    "type": "uint256" },
      { "indexed": false, "name": "payout",      "type": "uint256" }
    ],
    "name": "CashedOut",
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
    "inputs": [],
    "name": "cashOut",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "player", "type": "address" }],
    "name": "expireRound",
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
    "inputs": [],
    "name": "owner",
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
]
