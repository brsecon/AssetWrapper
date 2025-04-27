// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

// --- .env'den okuma ---
// Vite, VITE_ ile başlayan .env değişkenlerini import.meta.env'e ekler
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// Değişkenin .env'de tanımlı olup olmadığını kontrol et
if (!walletConnectProjectId) {
  // Hata fırlatmak yerine bir uyarı verip devam etmek daha kullanıcı dostu olabilir
  console.warn(`
    *********************************************************************************
    VITE_WALLETCONNECT_PROJECT_ID .env dosyasında tanımlanmamış!
    Lütfen https://cloud.walletconnect.com/ adresinden bir projectId alın
    ve projenin kök dizinindeki .env dosyasına aşağıdaki gibi ekleyin:
    VITE_WALLETCONNECT_PROJECT_ID="YOUR_WALLETCONNECT_PROJECT_ID"
    WalletConnect özellikleri bu ID olmadan düzgün çalışmayabilir.
    *********************************************************************************
  `);
  // throw new Error("VITE_WALLETCONNECT_PROJECT_ID .env dosyasında tanımlanmamış!");
}
// --- .env'den okuma sonu ---


const config = getDefaultConfig({
  appName: 'Asset Wrapper App',
  // .env'den okunan değişkeni kullan
  projectId: walletConnectProjectId || "DEFAULT_FALLBACK_ID_IF_NEEDED", // Eğer ID yoksa geçici ID veya hata
  chains: [baseSepolia],
  ssr: false,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);