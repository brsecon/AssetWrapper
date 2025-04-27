// AssetWrapper/scripts/deployMocks.ts

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(
    `Mock kontratları deploy ediliyor: ${deployer.address}`
  );

  // MockERC20 Deploy Et
  const mockErc20Name = "Mock Token";
  const mockErc20Symbol = "MCK";
  console.log(`Deploying ${mockErc20Name} (${mockErc20Symbol})...`);
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const mockERC20 = await MockERC20Factory.deploy(
    mockErc20Name,
    mockErc20Symbol,
    deployer.address // Sahibi deployer olacak
  );
  await mockERC20.waitForDeployment();
  const mockERC20Address = await mockERC20.getAddress();
  console.log(`${mockErc20Name} deployed to: ${mockERC20Address}`);

  // MockNFT Deploy Et
  const mockNftName = "Mock NFT";
  const mockNftSymbol = "MNFT";
  console.log(`Deploying ${mockNftName} (${mockNftSymbol})...`);
  const MockNFTFactory = await ethers.getContractFactory("MockNFT");
  const mockNFT = await MockNFTFactory.deploy(
    mockNftName,
    mockNftSymbol,
    deployer.address // Sahibi deployer olacak
  );
  await mockNFT.waitForDeployment();
  const mockNFTAddress = await mockNFT.getAddress();
  console.log(`${mockNftName} deployed to: ${mockNFTAddress}`);

  console.log("\n--- MOCK DEPLOYMENT SUMMARY ---");
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`MockERC20 (${mockErc20Symbol}): ${mockERC20Address}`);
  console.log(`MockNFT (${mockNftSymbol}):   ${mockNFTAddress}`);
  console.log("-----------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error deploying mocks:", error);
    process.exit(1);
  });