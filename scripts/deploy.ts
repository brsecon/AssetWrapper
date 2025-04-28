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
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`AssetWrapperVault dağıtıldı. Adres: ${vaultAddress}`);


  // 3. AssetWrapperNFT Kontratını Dağıt
  console.log("AssetWrapperNFT dağıtılıyor...");
  const NftFactory = await ethers.getContractFactory("AssetWrapperNFT");
  const nftName = "Asset Wrapper Jeton";
  const nftSymbol = "AWJ";
  // Başlangıç ücretini belirle (0.0005 ETH Wei cinsinden)
  const initialFeeInWei = ethers.parseEther("0.0005"); // 500000000000000 Wei
  console.log(`AssetWrapperNFT için başlangıç ücreti: ${ethers.formatEther(initialFeeInWei)} ETH (${initialFeeInWei} Wei)`);
  // --- YENİ: Başlangıç Base Token URI'sini belirle ---
  const initialBaseTokenURI = "ipfs://bafkreif6cgi7ijkg47vbp7kmcybejyvvsdt3rtoky4tkifurvtwolyzrjm/"; // <<< EKLENDİ
  console.log(`AssetWrapperNFT için başlangıç Base URI: ${initialBaseTokenURI}`);
  // --- Değişiklik Sonu ---

  const nft = await NftFactory.deploy(
    nftName,
    nftSymbol,
    deployer.address,
    vaultAddress, // Yukarıda alınan vault adresi kullanıldı
    initialFeeInWei,
    initialBaseTokenURI // <<< YENİ: Başlangıç base URI parametresi eklendi
  );
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(
    `AssetWrapperNFT (${nftSymbol}) dağıtıldı. Adres: ${nftAddress}`
  );


  // 4. AssetWrapperVault'u NFT Adresiyle Yapılandır
  console.log("AssetWrapperVault, NFT adresiyle yapılandırılıyor...");
  const tx = await vault.connect(deployer).setWrapperNftAddress(nftAddress);
  await tx.wait(); // Yapılandırma işleminin tamamlanmasını bekle
  console.log("AssetWrapperVault başarıyla yapılandırıldı.");
  console.log(`Artık Vault sadece ${nftAddress} adresinden gelen çağrıları kabul edecek.`);


  // --- Özet ---
  console.log("\n--- DAĞITIM ÖZETİ ---");
  console.log(`Deployer Adresi:       ${deployer.address}`);
  console.log(`AssetWrapperVault:     ${vaultAddress}`);
  console.log(`AssetWrapperNFT:       ${nftAddress}`);
  const currentFee = await nft.wrapperFee(); // Dağıtım sonrası ücreti oku
  const currentBaseURI = await nft.baseTokenURI(); // Dağıtım sonrası URI'yi oku
  console.log(`Mevcut Wrapper Ücreti: ${ethers.formatEther(currentFee)} ETH (${currentFee} Wei)`);
  console.log(`Mevcut Base Token URI: ${currentBaseURI}`);
  console.log("----------------------");

}

// Hardhat script'leri için standart çalıştırma ve hata yakalama paterni
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Dağıtım sırasında bir hata oluştu:", error);
    process.exit(1);
  });