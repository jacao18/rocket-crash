const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const RocketCrash = await ethers.getContractFactory("RocketCrash");
  // Deploy with 0.05 ETH as initial bankroll
  const contract = await RocketCrash.deploy({ value: ethers.parseEther("0.05") });
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ RocketCrash deployed to:", address);
  console.log("👉 Copy this address to src/contract.js → ROCKET_CRASH_ADDRESS");
  console.log(`\nExplorer: https://explorer-testnet.soneium.org/address/${address}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
