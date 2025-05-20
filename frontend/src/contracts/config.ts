// src/contracts/config.ts
import { base } from 'wagmi/chains'; // Sadece Base ağını import ediyoruz

// Uygulamamızın aktif olarak çalışacağı zincir ID'si ve zincir objesi
export const ACTIVE_CHAIN_ID = base.id;
export const ACTIVE_CHAIN = base;

interface ContractAddresses {
  assetWrapperAddress: `0x${string}`;
  assetWrapperMarketplaceAddress: `0x${string}`;
}

// Zincir ID'lerine göre kontrat adreslerini tanımlayın
const contractAddresses: Record<number, ContractAddresses> = {
  [base.id]: {
    assetWrapperAddress: '0xF8F3393dC51Ed8DD2A8B8c3c5815a3e6b866646c',
    assetWrapperMarketplaceAddress: '0x06223e3d07683d1A631bA45F40Bf827D6400fEEc',
  },
  // Gelecekte başka ağları desteklerseniz buraya ekleyebilirsiniz
};

export const getContractAddresses = (chainId?: number): ContractAddresses | undefined => {
  const id = chainId || ACTIVE_CHAIN_ID;
  return contractAddresses[id];
};

// ABI'ları import edelim (Bu dosyaların src/contracts/abis/ altında olduğundan emin olun)
import AssetWrapperABISource from './abis/AssetWrapper.json';
import AssetWrapperMarketplaceABISource from './abis/AssetWrapperMarketplace.json';

// ABI'ların içindeki asıl ABI dizisini alıyoruz
export const assetWrapperAbi = AssetWrapperABISource.abi;
export const assetWrapperMarketplaceAbi = AssetWrapperMarketplaceABISource.abi;

// Base ağındaki WETH adresi
export const WETH_ADDRESSES: Record<number, `0x${string}`> = {
  [base.id]: '0x4200000000000000000000000000000000000006',
};

export const getWethAddress = (chainId?: number): `0x${string}` | undefined => {
  const id = chainId || ACTIVE_CHAIN_ID;
  return WETH_ADDRESSES[id];
};

// Geliştirme sırasında konsolda bilgileri görmek için
console.log("Kontrat konfigürasyonu yüklendi.");
console.log("Aktif Zincir ID:", ACTIVE_CHAIN_ID, "| Aktif Zincir Adı:", ACTIVE_CHAIN.name);
const currentAddresses = getContractAddresses(ACTIVE_CHAIN_ID);
if (currentAddresses) {
  console.log("AssetWrapper Adresi:", currentAddresses.assetWrapperAddress);
  console.log("Marketplace Adresi:", currentAddresses.assetWrapperMarketplaceAddress);
  console.log("WETH Adresi:", getWethAddress(ACTIVE_CHAIN_ID));
} else {
  console.error("HATA: Aktif zincir için kontrat adresleri config.ts dosyasında bulunamadı!");
}