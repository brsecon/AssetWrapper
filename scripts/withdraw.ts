// scripts/withdraw.ts
import { ethers } from "hardhat";
import "dotenv/config"; // Ortam değişkenlerini yüklemek için

async function main() {
  // AUDIT FINDING 6 FIX: Load contract address from environment variable
  const contractAddress = process.env.NFT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("Error: NFT_CONTRACT_ADDRESS environment variable not set.");
    process.exit(1);
  }
  console.log(`Interacting with AssetWrapperNFT at: ${contractAddress}`);


  // Kontrat sahibi olan cüzdanı al (hardhat.config.ts'de tanımlı olmalı)
  const [owner] = await ethers.getSigners();
  console.log(`Attempting to withdraw fees using account: ${owner.address}`);

  // Kontrat ABI'sini ve adresi kullanarak kontrat instance'ını al
  const AssetWrapperNFT = await ethers.getContractFactory("AssetWrapperNFT");
  // attach kullanarak mevcut kontrata bağlan
  const contract = AssetWrapperNFT.attach(contractAddress);

  // Kontratın mevcut sahibini kontrol et (isteğe bağlı ama önerilir)
  try {
      const currentOwner = await contract.owner();
      if (owner.address.toLowerCase() !== currentOwner.toLowerCase()) {
          console.error(`Error: Signer (${owner.address}) is not the contract owner (${currentOwner}).`);
          process.exit(1);
      }
      console.log(`Signer confirmed as contract owner.`);
  } catch (error) {
      console.error("Error fetching contract owner. Is the address correct and contract deployed?", error);
      process.exit(1);
  }


  const balanceBefore = await ethers.provider.getBalance(contractAddress);
  console.log(`Current contract balance: ${ethers.formatEther(balanceBefore)} ETH`);

  if (balanceBefore === 0n) { // Use BigInt literal
      console.log("Contract balance is zero. No fees to withdraw.");
      process.exit(0);
  }

  console.log("Calling withdrawFees()...");
  try {
    const tx = await contract.connect(owner).withdrawFees(); // Sahip cüzdanıyla bağlanarak çağır

    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait(); // İşlemin onaylanmasını bekle

    console.log(`Fees withdrawn successfully! Block number: ${receipt?.blockNumber}`);
    const balanceAfter = await ethers.provider.getBalance(contractAddress);
    console.log(`New contract balance: ${ethers.formatEther(balanceAfter)} ETH`);

  } catch (error: any) {
      console.error("Error during fee withdrawal:", error.message);
      // Attempt to decode custom error
      // Note: This requires ABI knowledge and might be complex to generalize fully
      if (error.data) {
          try {
            const decodedError = contract.interface.parseError(error.data);
            console.error(`Decoded Error: ${decodedError?.name} (${decodedError?.args})`);
          } catch (decodeError) {
            console.error("Could not decode error data:", error.data);
          }
      }
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});