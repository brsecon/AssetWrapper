// src/config.ts

// --- Deploy Edilmiş Ana Kontrat Adresleri ---
// AssetWrapperNFT kontrat adresi
export const NFT_CONTRACT_ADDRESS = '0x3431C8a0ee84a97923e4b1d2462b58dfd2C1fD3d'; // Kendi adresinle değiştir
// AssetWrapperVault kontrat adresi
export const VAULT_CONTRACT_ADDRESS = '0x2ae292c306205B36e0ac06B3CeBA115A3e98dc5B'; // Kendi adresinle değiştir

// --- Hedef Ağ ---
export const TARGET_CHAIN_ID = 84532; // Base Sepolia Chain ID

// --- Frontend'de Kullanılacak Varlık Tipi ---
// Bu tip, hem Alchemy'den gelen veriyi hem de listeye eklenecek varlığı temsil edebilir
export interface SelectableAsset {
  name: string | null;        // Token/NFT adı (null olabilir)
  address: string;     // Kontrat adresi
  symbol: string | null;      // Sembol (null olabilir)
  type: 'ERC20' | 'ERC721';
  decimals?: number | null;   // Sadece ERC20 için (null olabilir)
  // İsteğe bağlı: NFT için görsel URL'si eklenebilir
  logo?: string | null;       // Token/NFT logosu (Alchemy'den gelebilir)
  balance?: string;           // Sadece ERC20 için bakiye (string olarak tutulabilir)
  tokenId?: string;           // Sadece NFT için kullanıcıdan alınacak ID
}