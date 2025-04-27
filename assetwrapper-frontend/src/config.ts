// src/config.ts
import { Network } from 'alchemy-sdk';

// --- Tek Ağ Yapılandırması (Base Mainnet) ---

// AssetWrapperNFT kontrat adresi (Base Mainnet) - .env'den okunur
export const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_BASE_MAINNET_NFT_CONTRACT || "";
// AssetWrapperVault kontrat adresi (Base Mainnet) - .env'den okunur
export const VAULT_CONTRACT_ADDRESS = import.meta.env.VITE_BASE_MAINNET_VAULT_CONTRACT || "";

// Hedef Ağ ID'si (Base Mainnet)
export const TARGET_CHAIN_ID = 8453; // Base Mainnet Chain ID

// Hedef Ağ için Alchemy Network Adı (Doğru enum değeri kullanılır)
export const ALCHEMY_NETWORK_NAME = Network.BASE_MAINNET;

// Hedef Ağ için Blok Tarayıcı URL'si
export const BLOCK_EXPLORER_URL = "https://basescan.org";


// --- Frontend'de Kullanılacak Varlık Tipi (Aynı kalır) ---
export interface SelectableAsset {
  name: string | null;
  address: string;
  symbol: string | null;
  type: 'ERC20' | 'ERC721';
  decimals?: number | null;
  logo?: string | null;
  balance?: string;
  tokenId?: string;
}

// .env kontrolü (opsiyonel ama önerilir)
if (!NFT_CONTRACT_ADDRESS || !VAULT_CONTRACT_ADDRESS) {
    console.warn(`Uyarı: Base Mainnet için VITE_BASE_MAINNET_NFT_CONTRACT (${NFT_CONTRACT_ADDRESS}) veya VITE_BASE_MAINNET_VAULT_CONTRACT (${VAULT_CONTRACT_ADDRESS}) .env dosyasında eksik veya bulunamadı.`);
}