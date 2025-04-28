// scripts/withdraw.ts
import { ethers } from "hardhat";
import "dotenv/config"; // Ortam değişkenlerini yüklemek için

async function main() {
  // AUDIT FINDING 6 FIX: Load contract address from environment variable
  // !!! ÖNEMLİ: Bu adresi kendi dağıttığınız NFT kontrat adresiyle değiştirin !!!
  const contractAddress = process.env.NFT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("Hata: NFT_CONTRACT_ADDRESS ortam değişkeni ayarlanmamış.");
    console.error("Lütfen projenizin kök dizininde bir .env dosyası oluşturup");
    console.error("NFT_CONTRACT_ADDRESS=0xSizinKontratAdresiniz şeklinde ayarlayın.");
    process.exit(1);
  }
  console.log(`Şu adresteki AssetWrapperNFT ile etkileşim kuruluyor: ${contractAddress}`);


  // Kontrat sahibi olan cüzdanı al (hardhat.config.ts'de tanımlı ve .env'deki private key ile eşleşmeli)
  const [owner] = await ethers.getSigners();
  console.log(`Şu hesap kullanılarak ücret çekme deneniyor: ${owner.address}`);

  // Kontrat ABI'sini ve adresi kullanarak kontrat instance'ını al
  const AssetWrapperNFT = await ethers.getContractFactory("AssetWrapperNFT");
  // attach kullanarak mevcut kontrata bağlan
  const contract = AssetWrapperNFT.attach(contractAddress);

  // Kontratın mevcut sahibini kontrol et (isteğe bağlı ama önerilir)
  let currentOwner: string;
  try {
      currentOwner = await contract.owner();
      if (owner.address.toLowerCase() !== currentOwner.toLowerCase()) {
          console.error(`Hata: İmzalayan (${owner.address}), kontrat sahibi (${currentOwner}) değil.`);
          console.error("Lütfen hardhat.config.ts dosyasındaki ve .env dosyasındaki özel anahtarın");
          console.error("kontratı dağıtan ve sahibi olan cüzdana ait olduğundan emin olun.");
          process.exit(1);
      }
      console.log(`İmzalayan, kontrat sahibi olarak doğrulandı.`);
  } catch (error) {
      console.error("Kontrat sahibi getirilirken hata oluştu. Adres doğru mu ve kontrat dağıtıldı mı?", error);
      process.exit(1);
  }

  // Çekme öncesi kontrat bakiyesini kontrol et
  const balanceBefore = await ethers.provider.getBalance(contractAddress);
  console.log(`Mevcut kontrat bakiyesi: ${ethers.formatEther(balanceBefore)} ETH`);

  if (balanceBefore === 0n) { // Use BigInt literal
      console.log("Kontrat bakiyesi sıfır. Çekilecek ücret yok.");
      process.exit(0);
  }

  console.log("withdrawFees() çağrılıyor...");
  try {
    // Sahip cüzdanıyla bağlanarak çağır
    const tx = await contract.connect(owner).withdrawFees();

    console.log(`İşlem hash: ${tx.hash}`);
    console.log("İşlem onayı bekleniyor...");

    // İşlemin onaylanmasını bekle (genellikle 1 onay yeterli olur, ağa göre değişebilir)
    const receipt = await tx.wait(1);

    console.log(`Ücretler başarıyla çekildi! Blok numarası: ${receipt?.blockNumber}`);
    const balanceAfter = await ethers.provider.getBalance(contractAddress);
    console.log(`Yeni kontrat bakiyesi: ${ethers.formatEther(balanceAfter)} ETH`);

  } catch (error: any) {
      console.error("Ücret çekme sırasında hata:", error.message);
      // Özel hatayı decode etmeye çalış (Revert nedenini görmek için)
      if (error.data) {
          try {
            const decodedError = contract.interface.parseError(error.data);
            console.error(`Decode Edilmiş Hata: ${decodedError?.name} (${decodedError?.args})`);
            if(decodedError?.name === 'NoFeesToWithdraw') {
                console.error("Kontrat hatası: Çekilecek ücret yok.");
            } else if (decodedError?.name === 'FeeWithdrawalFailed') {
                console.error("Kontrat hatası: ETH transferi başarısız oldu.");
            }
          } catch (decodeError) {
            console.error("Hata verisi decode edilemedi:", error.data);
          }
      }
      process.exit(1);
  }
}

// Standart çalıştırma ve hata yakalama
main().catch((error) => {
  console.error("İşlenmemiş hata:", error);
  process.exitCode = 1;
});