// src/app/providers.tsx
'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains'; // Sadece Base ağını import ediyoruz
import { http } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn(
    "Client-side Warning: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set in .env.local. WalletConnect functionality will be limited. Please obtain a Project ID from WalletConnect Cloud (https://cloud.walletconnect.com/)."
  );
}

// Base ağı için Alchemy API Key (opsiyonel ama önerilir)
// .env.local dosyanızda NEXT_PUBLIC_ALCHEMY_API_KEY_BASE="YOUR_KEY" olarak ayarlayın
const alchemyApiKeyForBase = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY_BASE;

// Desteklenecek tek zincir Base
const supportedChains = [base];

const config = getDefaultConfig({
  appName: 'Asset Wrapper DApp',
  projectId: projectId || "DEFAULT_PROJECT_ID_IF_NOT_SET", // WalletConnect için gerçek ID daha iyi olur
  chains: supportedChains as any, // Sadece Base
  transports: {
    // Base ağı için transport
    [base.id]: alchemyApiKeyForBase
      ? http(`https://base-mainnet.g.alchemy.com/v2/${alchemyApiKeyForBase}`)
      : http(), // Alchemy yoksa public RPC
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}