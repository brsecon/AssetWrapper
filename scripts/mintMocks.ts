// AssetWrapper/scripts/mintMocks.ts
import { ethers } from "hardhat";

// ----> BU ADRESLERİ DEĞİŞTİRİN! <----
// Az önceki deploy çıktısından kopyala:
const MOCK_ERC20_ADDRESS = "0xbca7A8cD6261876761dEd012877EfF8f2159B903"; // <- BURAYA
const MOCK_NFT_ADDRESS = "0xa9Cda4455e29b19e050265e563D554949d05d8Be";   // <- BURAYA

// ----> CÜZDAN ADRESİNİZİ BURAYA GİRİN (Frontend'de kullandığınız) <----
// Deploy çıktısındaki Deployer adresi veya frontend'de kullandığın adres:
const RECIPIENT_ADDRESS = "0x54780618582777E777B0BB22dAf5e59149cf288b"; // <- BURAYA KENDİ ADRESİNİ GİR

// --- (Script'in geri kalanı aynı) ---
async function main() {
  if (
    MOCK_ERC20_ADDRESS.startsWith("PASTE_") || MOCK_ERC20_ADDRESS.length !== 42 || // Küçük bir kontrol
    MOCK_NFT_ADDRESS.startsWith("PASTE_") || MOCK_NFT_ADDRESS.length !== 42 || // Küçük bir kontrol
    RECIPIENT_ADDRESS.startsWith("PASTE_") || RECIPIENT_ADDRESS.length !== 42 // Küçük bir kontrol
  ) {
    throw new Error(
      "Lütfen script içindeki MOCK_ERC20_ADDRESS, MOCK_NFT_ADDRESS ve RECIPIENT_ADDRESS değişkenlerini doğru şekilde güncelleyin."
    );
  }
  // ... (scriptin geri kalanı önceki mesajdaki gibi) ...

  const [signer] = await ethers.getSigners();
  console.log(`Minting assets to ${RECIPIENT_ADDRESS} using signer ${signer.address}`);

  // MockERC20 Kontratına Bağlan ve Mint Et
  console.log(`Connecting to MockERC20 at ${MOCK_ERC20_ADDRESS}...`);
  const MockERC20 = await ethers.getContractAt("MockERC20", MOCK_ERC20_ADDRESS, signer);
  const amountToMint = ethers.parseUnits("1000", 18);
  console.log(`Minting ${ethers.formatUnits(amountToMint, 18)} MCK tokens...`);
  try {
    const tx1 = await MockERC20.mint(RECIPIENT_ADDRESS, amountToMint);
    await tx1.wait();
    console.log(`MockERC20 mint successful! Tx: ${tx1.hash}`);
  } catch (error) {
    console.error("MockERC20 mint failed:", error);
  }

  // MockNFT Kontratına Bağlan ve Mint Et
  console.log(`Connecting to MockNFT at ${MOCK_NFT_ADDRESS}...`);
  const MockNFT = await ethers.getContractAt("MockNFT", MOCK_NFT_ADDRESS, signer);
  const numberOfNfts = 10;
  console.log(`Minting ${numberOfNfts} MNFT NFTs...`);
  for (let i = 0; i < numberOfNfts; i++) {
    try {
      const tx2 = await MockNFT.safeMint(RECIPIENT_ADDRESS);
      await tx2.wait();
      console.log(`MockNFT mint ${i + 1} successful! Tx: ${tx2.hash}`);
    } catch (error) {
      console.error(`MockNFT mint ${i + 1} failed:`, error);
    }
  }
  console.log("\nMinting process finished.");
  console.log(`Check your wallet ${RECIPIENT_ADDRESS} on Base Sepolia explorer.`);
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error minting assets:", error);
    process.exit(1);
  });