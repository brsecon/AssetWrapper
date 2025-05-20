import { Alchemy, Network } from 'alchemy-sdk';

const settings = {
  apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  network: Network.BASE_MAINNET, // Kullanılan ağa göre değiştirin (örneğin, Network.ETH_MAINNET, Network.MATIC_MAINNET vb.)
};

if (!settings.apiKey) {
  console.warn(
    'Alchemy API anahtarı bulunamadı. Lütfen .env.local dosyasında NEXT_PUBLIC_ALCHEMY_API_KEY değişkenini ayarlayın.'
  );
  // Geliştirme ortamında, API anahtarı olmadan SDK'nın bazı özelliklerinin çalışmayacağını unutmayın.
  // Ancak, bazı temel herkese açık çağrılar yine de çalışabilir.
}

// apiKey tanımsız olsa bile Alchemy örneğini oluştur, uyarı yukarıda verildi.
export const alchemy = new Alchemy(settings);
