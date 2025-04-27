// scripts/deploy.ts

import { ethers } from "hardhat";

async function main() {
  // 1. Deployer Hesabını Al
  const [deployer] = await ethers.getSigners();
  console.log(
    `Dağıtım işlemi şu hesapla yapılıyor: ${deployer.address}`
  );

  // 2. AssetWrapperVault Kontratını Dağıt
  console.log("AssetWrapperVault dağıtılıyor...");
  const VaultFactory = await ethers.getContractFactory("AssetWrapperVault");
  const vault = await VaultFactory.deploy(deployer.address);
  // --- DÜZELTME: .deployed() yerine .waitForDeployment() kullanıldı ---
  await vault.waitForDeployment();
  // --- Düzeltme Sonu ---
  const vaultAddress = await vault.getAddress(); // Adresi almak için getAddress() kullan
  console.log(`AssetWrapperVault dağıtıldı. Adres: ${vaultAddress}`);


  // 3. AssetWrapperNFT Kontratını Dağıt
  console.log("AssetWrapperNFT dağıtılıyor...");
  const NftFactory = await ethers.getContractFactory("AssetWrapperNFT");
  const nftName = "Asset Wrapper Jeton";
  const nftSymbol = "AWJ";
  const nft = await NftFactory.deploy(
    nftName,
    nftSymbol,
    deployer.address,
    vaultAddress // Yukarıda alınan vault adresi kullanıldı
  );
  // --- DÜZELTME: .deployed() yerine .waitForDeployment() kullanıldı ---
  await nft.waitForDeployment();
  // --- Düzeltme Sonu ---
  const nftAddress = await nft.getAddress(); // Adresi almak için getAddress() kullan
  console.log(
    `AssetWrapperNFT (${nftSymbol}) dağıtıldı. Adres: ${nftAddress}`
  );


  // 4. AssetWrapperVault'u NFT Adresiyle Yapılandır
  console.log("AssetWrapperVault, NFT adresiyle yapılandırılıyor...");
  // Vault kontratını tekrar yüklemeye gerek yok, yukarıdaki vault nesnesini kullanabiliriz
  const tx = await vault.connect(deployer).setWrapperNftAddress(nftAddress); // Yukarıda alınan nft adresi kullanıldı
  await tx.wait(); // Yapılandırma işleminin tamamlanmasını bekle
  console.log("AssetWrapperVault başarıyla yapılandırıldı.");
  console.log(`Artık Vault sadece ${nftAddress} adresinden gelen çağrıları kabul edecek.`);


  // --- Özet ---
  console.log("\n--- DAĞITIM ÖZETİ ---");
  console.log(`Deployer Adresi:      ${deployer.address}`);
  console.log(`AssetWrapperVault:    ${vaultAddress}`);
  console.log(`AssetWrapperNFT:      ${nftAddress}`);
  console.log("----------------------");

}

// Hardhat script'leri için standart çalıştırma ve hata yakalama paterni
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Dağıtım sırasında bir hata oluştu:", error);
    process.exit(1);
  });