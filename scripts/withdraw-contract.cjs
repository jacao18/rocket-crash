const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x03670B7279D0Db9f6207b6E79D17577f09Bfed0e";

const ABI = [
  "function withdraw(uint256 amount) external",
  "function getBalance() external view returns (uint256)",
  "function owner() external view returns (address)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using wallet:", signer.address);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  // Check owner
  const owner = await contract.owner();
  console.log("Contract owner:", owner);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("❌ Your wallet is not the contract owner. Cannot withdraw.");
    process.exit(1);
  }

  const balance = await contract.getBalance();
  console.log("Contract balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.log("Contract is already empty.");
    return;
  }

  // Withdraw everything
  console.log("⏳ Withdrawing all funds to owner wallet...");
  const tx = await contract.withdraw(balance);
  await tx.wait();

  console.log("✅ Withdrawn! Tx:", tx.hash);
  console.log(`Explorer: https://explorer-testnet.soneium.org/tx/${tx.hash}`);

  const after = await contract.getBalance();
  console.log("Contract balance after:", ethers.formatEther(after), "ETH");

  const walletBalance = await ethers.provider.getBalance(signer.address);
  console.log("Your wallet balance:", ethers.formatEther(walletBalance), "ETH");
}

main().catch((err) => { console.error(err); process.exit(1); });
