import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config"; // .env dosyasındaki değişkenleri yüklemek için import et

// Ortam değişkenlerinden değerleri al
const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL || ""; // Eğer değişken yoksa boş string ata (TypeScript tip kontrolü için)
const baseSepoliaPrivateKey = process.env.BASE_SEPOLIA_PRIVATE_KEY;

const polygonRpcUrl = process.env.POLYGON_RPC_URL || "";
const polygonPrivateKey = process.env.POLYGON_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Hardhat'in varsayılan lokal ağı (genellikle testler için)
    hardhat: {
      // chainId: 31337 // İstersen belirtebilirsin
    },

    // Sepolia Testnet Ayarları
    /* sepolia: {
      url: sepoliaRpcUrl,
      // Özel anahtar tanımlıysa dizi içine al, değilse boş dizi ata
      accounts: sepoliaPrivateKey !== undefined ? [sepoliaPrivateKey] : [],
      chainId: 11155111, // Sepolia'nın Chain ID'si
    }, */

    // Polygon Mainnet Ayarları (örnek)
    polygon: {
      url: polygonRpcUrl,
      accounts: polygonPrivateKey !== undefined ? [polygonPrivateKey] : [],
      chainId: 137, // Polygon Mainnet Chain ID'si
    },

    baseSepolia: {
      url: baseSepoliaRpcUrl,
      // Özel anahtar tanımlıysa dizi içine al, değilse boş dizi ata
      accounts: baseSepoliaPrivateKey !== undefined ? [baseSepoliaPrivateKey] : [],
      chainId: 84532, // Sepolia'nın Chain ID'si
    },

    // Başka ağları da buraya benzer şekilde ekleyebilirsin
    // arbitrumGoerli: {
    //   url: process.env.ARB_GOERLI_RPC_URL || "",
    //   accounts: process.env.ARB_GOERLI_PRIVATE_KEY !== undefined ? [process.env.ARB_GOERLI_PRIVATE_KEY] : [],
    //   chainId: 421613
    // }
  },
};

export default config;