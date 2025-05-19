import * as path from "path"; // path modülünü import et
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config"; // .env dosyasını kullanmak için

const BASE_MAINNET_RPC_URL = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "your-private-key"; // Özel anahtarınızı .env dosyasında saklayın
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20", // Kontratlarınızla uyumlu Solidity versiyonu
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      // Lokal testler için
    },
    base_mainnet: {
      url: BASE_MAINNET_RPC_URL,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [], // Özel anahtarınız '0x' ile başlamalı
      chainId: 8453, // Base Mainnet Chain ID
      // gasPrice: ethers.utils.parseUnits("0.1", "gwei").toNumber(), // Opsiyonel: Gas fiyatını manuel ayarlamak için
    },
  },
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY, // Basescan'de "base" olarak belirtilir (API key objesi içinde olmalı)
    },
    customChains: [
      {
        network: "base", // Etherscan'deki ağ adıyla eşleşmeli
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  typechain: { // TypeScript kullanıyorsanız typechain ayarları faydalı olabilir
    outDir: "typechain-types",
    target: "ethers-v5",
  },
};

export default config;
