// src/App.tsx veya src/alchemyClient.ts

import { Alchemy, Network } from 'alchemy-sdk';

const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY; // .env'den API key'i al

if (!alchemyApiKey) {
    console.warn("VITE_ALCHEMY_API_KEY bulunamadı! Alchemy API çağrıları çalışmayabilir.");
}

const settings = {
    apiKey: alchemyApiKey || "DEFAULT_API_KEY", // API Key yoksa varsayılan veya hata yönetimi
    network: Network.BASE_MAINNET, // Base Mainnet'i belirt
};

export const alchemy = new Alchemy(settings); // SDK örneğini export et