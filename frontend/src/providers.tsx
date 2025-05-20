'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

// Read WalletConnect Project ID from environment variable
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn('WalletConnect Project ID is not defined. Please set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your .env.local file.');
  // You might want to throw an error here or handle it gracefully depending on your app's needs
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Asset Wrapper DApp',
  projectId: projectId || '', // Ensure projectId is a string
  chains: [base],
  // ssr: true, // Enable if using Page Router or CJS, not needed for App Router ESM
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {mounted && children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
