// scripts/deploy.ts

import { ethers } from "hardhat";

async function main() {
  // 1. Deployer Hesabını Al
  // Hardhat ağı veya yapılandırdığın ağdaki ilk hesabı alır
  const [deployer] = await ethers.getSigners();
  console.log(
    `Dağıtım işlemi şu hesapla yapılıyor: ${deployer.address}`
  );

  // 2. AssetWrapperVault Kontratını Dağıt
  console.log("AssetWrapperVault dağıtılıyor...");
  const VaultFactory = await ethers.getContractFactory("AssetWrapperVault");
  // Constructor'a ilk sahibi (deployer) gönderiyoruz
  const vault = await VaultFactory.deploy(deployer.address);
  await vault.deployed(); // Dağıtım işleminin tamamlanmasını bekle
  console.log(`AssetWrapperVault dağıtıldı. Adres: ${vault.address}`);

  // 3. AssetWrapperNFT Kontratını Dağıt
  console.log("AssetWrapperNFT dağıtılıyor...");
  const NftFactory = await ethers.getContractFactory("AssetWrapperNFT");
  const nftName = "Asset Wrapper Token"; // NFT'niz için bir isim seçin
  const nftSymbol = "AWT"; // NFT'niz için bir sembol seçin
  // Constructor'a gerekli parametreleri gönderiyoruz:
  // - İsim
  // - Sembol
  // - İlk Sahip (deployer)
  // - Vault Kontrat Adresi
  const nft = await NftFactory.deploy(
    nftName,
    nftSymbol,
    deployer.address,
    vault.address // Önceki adımda dağıtılan vault'un adresi
  );
  await nft.deployed(); // Dağıtım işleminin tamamlanmasını bekle
  console.log(
    `AssetWrapperNFT (${nftSymbol}) dağıtıldı. Adres: ${nft.address}`
  );

  // 4. AssetWrapperVault'u NFT Adresiyle Yapılandır
  console.log("AssetWrapperVault, NFT adresiyle yapılandırılıyor...");
  // Vault'un sahibi (deployer) olduğu için setWrapperNftAddress fonksiyonunu çağırabilir
  const tx = await vault.connect(deployer).setWrapperNftAddress(nft.address);
  await tx.wait(); // Yapılandırma işleminin tamamlanmasını bekle (transaction'ın mine edilmesi)
  console.log("AssetWrapperVault başarıyla yapılandırıldı.");
  console.log(`Artık Vault sadece ${nft.address} adresinden gelen çağrıları kabul edecek.`);


  // --- Özet ---
  console.log("\n--- DAĞITIM ÖZETİ ---");
  console.log(`Deployer Adresi:      ${deployer.address}`);
  console.log(`AssetWrapperVault:    ${vault.address}`);
  console.log(`AssetWrapperNFT:      ${nft.address}`);
  console.log("----------------------");

}

// Hardhat script'leri için standart çalıştırma ve hata yakalama paterni
main()
  .then(() => process.exit(0)) // Başarılı olursa çık
  .catch((error) => {
    console.error("Dağıtım sırasında bir hata oluştu:", error);
    process.exit(1); // Hata olursa hata koduyla çık
  });