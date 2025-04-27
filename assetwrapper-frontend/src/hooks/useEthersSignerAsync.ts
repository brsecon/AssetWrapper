// src/hooks/useEthersSignerAsync.ts

import { useState, useEffect, useMemo } from 'react';
import { type WalletClient, useConnectorClient } from 'wagmi';
import { ethers, type BrowserProvider, type Signer, Eip1193Provider } from 'ethers';

// wagmi'nin WalletClient'ını ethers Provider'a çeviren fonksiyon
// Not: Ethers v6'da Eip1193Provider tipini kullanmak daha doğru olabilir
export function walletClientToProvider(walletClient: WalletClient): BrowserProvider {
  const { chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  // EIP-1193 uyumlu transport'u kullan (transport tipi any olabilir, kontrol etmek gerekebilir)
  // Ethers v6, EIP-1193 sağlayıcılarını doğrudan BrowserProvider ile sarmalayabilir.
  // transport'un Eip1193Provider arayüzünü uyguladığından emin olun.
  const provider = new ethers.BrowserProvider(transport as Eip1193Provider, network);
  return provider;

  // Eğer transport tipi doğrudan uyumlu değilse veya hata alırsanız,
  // wagmi'nin getRpcClient fonksiyonu ile daha alt seviye bir client alıp
  // ethers'ın JsonRpcProvider veya benzeri bir sınıfı ile sarmalamak gerekebilir.
  // Ancak genellikle yukarısı çalışmalıdır.
}

// wagmi'den ethers v6 Signer alma hook'u (Asenkron versiyon)
export function useEthersSignerAsync({ chainId }: { chainId?: number } = {}): Signer | undefined {
  // wagmi'den bağlı cüzdanın client'ını al
  const { data: walletClient } = useConnectorClient<WalletClient>({ chainId });
  const [signer, setSigner] = useState<Signer | undefined>(undefined);

  useEffect(() => {
    async function getSignerAsync() {
      if (walletClient) {
        const provider = walletClientToProvider(walletClient);
        try {
          // BrowserProvider üzerinden signer'ı asenkron olarak al
          const currentSigner = await provider.getSigner();
          setSigner(currentSigner);
        } catch (e) {
          console.error("Ethers Signer alınamadı:", e);
          setSigner(undefined);
        }
      } else {
        setSigner(undefined); // Cüzdan bağlı değilse signer'ı temizle
      }
    }

    getSignerAsync();
  }, [walletClient]); // walletClient değiştiğinde tekrar çalıştır

  return signer;
}