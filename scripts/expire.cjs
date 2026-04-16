const { ethers } = require("hardhat");

// ← paste the full Privy wallet address here
const PLAYER_ADDRESS = "0xe8cdfB15e8638df895ff42CF1Cc6C1e17D11413a";

const CONTRACT_ADDRESS = "0x30D3f40B24c35758aE896390AfCEDbe0Cc8a228D";

const ABI = [
  "function expireRound(address player) external",
  "function rounds(address) external view returns (uint256 betAmount, uint256 startBlock, uint256 startTime, bool active, bool cashedOut)"
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using wallet:", signer.address);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  // Check round status first
  const round = await contract.rounds(PLAYER_ADDRESS);
  console.log("\nRound status:");
  console.log("  betAmount:", ethers.formatEther(round.betAmount), "ETH");
  console.log("  active:   ", round.active);
  console.log("  cashedOut:", round.cashedOut);

  if (!round.active) {
    console.log("\n✅ Round is already inactive — no need to expire.");
    return;
  }

  console.log("\n⏳ Calling expireRound...");
  const tx = await contract.expireRound(PLAYER_ADDRESS);
  await tx.wait();
  console.log("✅ Round expired! Tx:", tx.hash);
  console.log(`Explorer: https://explorer-testnet.soneium.org/tx/${tx.hash}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
