const { ethers } = require("hardhat");

// Treasury = owner wallet
const TREASURY = "0xd41D6fDD91d3c39d3AC29745f68548843598D572";

// Initial fee: $0.01 at ~$2000/ETH = 0.000005 ETH = 5_000_000_000_000 wei
// Update via setFee() after deploy as ETH price changes
const INITIAL_FEE = ethers.parseEther("0.000005");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Treasury:", TREASURY);
  console.log("Initial fee:", ethers.formatEther(INITIAL_FEE), "ETH (~$0.01 at $2000/ETH)");

  const DailyCheckIn = await ethers.getContractFactory("DailyCheckIn");
  const contract = await DailyCheckIn.deploy(TREASURY, INITIAL_FEE);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ DailyCheckIn deployed to:", address);
  console.log("👉 Add to .env: VITE_CHECKIN_ADDRESS=" + address);
  console.log(`\nExplorer: https://explorer-testnet.soneium.org/address/${address}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
