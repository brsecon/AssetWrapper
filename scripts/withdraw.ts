// scripts/withdraw.js
const hre = require("hardhat");

// BURAYA DEPLOY EDİLMİŞ KONTATIN ADRESİNİ YAPIŞTIR
const CONTRACT_ADDRESS = "0xb97D899Dea869e5d5a435D8ae0E1C49f1865bc8c";

async function main() {
  // Kontrat sahibi olan cüzdanı al (hardhat.config.js'de tanımlı olmalı)
  const [owner] = await hre.ethers.getSigners();
  console.log(`Attempting to withdraw fees using account: ${owner.address}`);

  // Kontrat ABI'sini ve adresi kullanarak kontrat instance'ını al
  const AssetWrapperNFT = await hre.ethers.getContractFactory("AssetWrapperNFT");
  const contract = AssetWrapperNFT.attach(CONTRACT_ADDRESS); // attach kullanılır

  // Kontratın mevcut sahibini kontrol et (isteğe bağlı ama önerilir)
  const currentOwner = await contract.owner();
  if (owner.address.toLowerCase() !== currentOwner.toLowerCase()) {
      console.error(`Error: Signer (<span class="math-inline">\{owner\.address\}\) is not the contract owner \(</span>{currentOwner}).`);
      process.exit(1);
  }

  console.log(`Current contract balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(CONTRACT_ADDRESS))} ETH`);

  console.log("Calling withdrawFees()...");
  const tx = await contract.connect(owner).withdrawFees(); // Sahip cüzdanıyla bağlanarak çağır

  console.log(`Transaction hash: ${tx.hash}`);
  console.log("Waiting for transaction confirmation...");

  const receipt = await tx.wait(); // İşlemin onaylanmasını bekle

  console.log(`Fees withdrawn successfully! Block number: ${receipt.blockNumber}`);
  console.log(`New contract balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(CONTRACT_ADDRESS))} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});