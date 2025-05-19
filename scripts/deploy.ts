import hre from "hardhat";
import { ethers as hethers } from "hardhat"; // Hardhat Ethers plugin
import { AssetWrapper, AssetWrapperMarketplace } from "../typechain-types"; // TypeChain tiplerini import et

async function main() {
  const [deployer] = await hethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  const balance = await hethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance)); // hre.ethers.formatEther kullanıldı

  // --- AssetWrapper Kontratının Deploy Edilmesi ---
  const initialOwner = deployer.address; // AssetWrapper'ın sahibi deployer olacak
  const wethTokenAddressMainnet = "0x4200000000000000000000000000000000000006"; // Base Mainnet WETH

  const AssetWrapperFactory = await hethers.getContractFactory("AssetWrapper");
  const assetWrapper = (await AssetWrapperFactory.deploy(initialOwner)) as AssetWrapper;
  await assetWrapper.waitForDeployment(); // deployed() yerine waitForDeployment()
  const assetWrapperDeployedAddress = await assetWrapper.getAddress(); // address yerine getAddress()
  console.log("AssetWrapper deployed to:", assetWrapperDeployedAddress);

  console.log("Setting WETH address for AssetWrapper...");
  const txWeth = await assetWrapper.setWethAddress(wethTokenAddressMainnet);
  await txWeth.wait(); // İşlemin tamamlanmasını bekle
  console.log("WETH address set for AssetWrapper at:", await assetWrapper.wethTokenAddress());

  // --- AssetWrapperMarketplace Kontratının Deploy Edilmesi ---
  const assetWrapperAddress = assetWrapperDeployedAddress;
  const initialFeeRecipient = deployer.address; // Ücret alıcısı da deployer olabilir, değiştirilebilir.
  const initialMarketplaceFeePercent = 10; // Örnek: %1 için 10 (FEE_PRECISION = 1000)

  const AssetWrapperMarketplaceFactory = await hethers.getContractFactory("AssetWrapperMarketplace");
  const assetWrapperMarketplace = (await AssetWrapperMarketplaceFactory.deploy(
    assetWrapperAddress,
    wethTokenAddressMainnet, // Marketplace de WETH adresini kullanacak
    initialFeeRecipient,
    initialMarketplaceFeePercent
  )) as AssetWrapperMarketplace;
  await assetWrapperMarketplace.waitForDeployment(); // deployed() yerine waitForDeployment()
  const assetWrapperMarketplaceDeployedAddress = await assetWrapperMarketplace.getAddress(); // address yerine getAddress()
  console.log("AssetWrapperMarketplace deployed to:", assetWrapperMarketplaceDeployedAddress);

  console.log("\n--- Deployment Summary ---");
  console.log("AssetWrapper Address:", assetWrapperDeployedAddress);
  console.log("  - Initial Owner:", initialOwner);
  console.log("  - WETH Token Address (set via function):", await assetWrapper.wethTokenAddress());
  console.log("AssetWrapperMarketplace Address:", assetWrapperMarketplaceDeployedAddress);
  console.log("  - AssetWrapper Contract (param):", await assetWrapperMarketplace.assetWrapperContract());
  console.log("  - WETH Token Contract (param):", await assetWrapperMarketplace.wethTokenContract());
  console.log("  - Fee Recipient (param):", await assetWrapperMarketplace.feeRecipient());
  console.log("  - Marketplace Fee Percent (param):", (await assetWrapperMarketplace.marketplaceFeePercent()).toString());

  // --- Kontrat Doğrulama (Opsiyonel ama Önerilir) ---
  if (hre.network.name === "base_mainnet" && process.env.BASESCAN_API_KEY) {
    console.log("\nWaiting for 1 minute before attempting verification to allow Basescan to index the contract...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 saniye bekle

    try {
      console.log("Verifying AssetWrapper...");
      await hre.run("verify:verify", {
        address: assetWrapperDeployedAddress,
        constructorArguments: [initialOwner],
        // contract: "contracts/AssetWrapper.sol:AssetWrapper" // Eğer birden fazla aynı isimde kontrat varsa belirtin
      });
      console.log("AssetWrapper verified.");
    } catch (error: any) {
      console.error("Error verifying AssetWrapper:", error.message);
    }

    try {
      console.log("Verifying AssetWrapperMarketplace...");
      await hre.run("verify:verify", {
        address: assetWrapperMarketplaceDeployedAddress,
        constructorArguments: [
          assetWrapperAddress,
          wethTokenAddressMainnet,
          initialFeeRecipient,
          initialMarketplaceFeePercent,
        ],
        // contract: "contracts/AssetWrapperMarketplace.sol:AssetWrapperMarketplace"
      });
      console.log("AssetWrapperMarketplace verified.");
    } catch (error: any) {
      console.error("Error verifying AssetWrapperMarketplace:", error.message);
    }
  } else {
    console.log("\nSkipping contract verification. (Not on Base Mainnet or BASESCAN_API_KEY not set)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 