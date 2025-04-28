import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Varsa stil dosyanız

// RainbowKit ve Wagmi v2 importları
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi'; // WagmiProvider import et (WagmiConfig yerine)
import { base } from 'wagmi/chains'; // Base Mainnet chain'ini import et
import { http } from 'viem'; // Viem'in http transportunu import et

// React Query importları
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- WalletConnect Project ID ve Alchemy API Key'i .env'den al ---
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
    throw new Error("VITE_WALLETCONNECT_PROJECT_ID ortam değişkeni ayarlanmamış!");
}
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) {
    console.warn("VITE_ALCHEMY_API_KEY ortam değişkeni ayarlanmamış! Public RPC kullanılacak.");
}
// --- ---

// 1. Wagmi v2 ve RainbowKit Yapılandırması (getDefaultConfig ile)
const config = getDefaultConfig({
    appName: 'Asset Wrapper DApp',
    projectId: projectId, // .env'den alınan WalletConnect Project ID
    chains: [base], // Desteklenecek zincirler
    // RPC URL'lerini elle sağlamak için (Alchemy/Infura)
    transports: {
      // Eğer Alchemy API key varsa Base için Alchemy HTTP transportunu kullan, yoksa public RPC'yi kullanır (varsayılan)
      [base.id]: alchemyApiKey
        ? http(`https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`)
        : http() // Varsayılan public RPC
    },
    ssr: false, // Sunucu taraflı renderlama yoksa false
});


// 2. React Query Client Oluştur
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}> {/* config'i sağla */}
      <QueryClientProvider client={queryClient}> {/* React Query'yi sağla */}
        <RainbowKitProvider> {/* RainbowKit'i yapılandır */}
          <App /> {/* Ana uygulamanız */}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);