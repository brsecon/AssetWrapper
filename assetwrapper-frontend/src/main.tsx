// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
// Sadece 'base' zincirini import et
import { base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!walletConnectProjectId) {
  console.warn("VITE_WALLETCONNECT_PROJECT_ID .env dosyasında tanımlanmamış!");
}

// Desteklenen zincir sadece Base Mainnet
const supportedChains = [base];

const config = getDefaultConfig({
  appName: 'Asset Wrapper App',
  projectId: walletConnectProjectId || "DEFAULT_FALLBACK_ID", // Gerekirse varsayılan ID
  chains: supportedChains, // Sadece [base] içeriyor
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