const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x30D3f40B24c35758aE896390AfCEDbe0Cc8a228D";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using wallet:", signer.address);
  console.log("Wallet balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "ETH");

  const contract = new ethers.Contract(CONTRACT_ADDRESS, [
    "function getBalance() external view returns (uint256)",
    "receive() external payable"
  ], signer);

  const before = await contract.getBalance();
  console.log("Contract balance before:", ethers.formatEther(before), "ETH");

  // Send 0.1 ETH to the contract
  const tx = await signer.sendTransaction({
    to: CONTRACT_ADDRESS,
    value: ethers.parseEther("0.1"),
  });
  await tx.wait();
  console.log("✅ Funded! Tx:", tx.hash);

  const after = await contract.getBalance();
  console.log("Contract balance after:", ethers.formatEther(after), "ETH");
}

main().catch((err) => { console.error(err); process.exit(1); });
