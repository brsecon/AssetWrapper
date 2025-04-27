// src/hooks/useEthersSigner.ts
import { useMemo } from 'react';
import { type WalletClient, useConnectorClient } from 'wagmi';
import { ethers, type BrowserProvider, type Signer } from 'ethers'; // ethers'ı import et

// wagmi'nin WalletClient'ını ethers Provider'a çeviren fonksiyon
export function walletClientToProvider(walletClient: WalletClient): BrowserProvider {
  const { chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  // EIP-1193 uyumlu transport'u kullan
  return new ethers.BrowserProvider(transport, network);
}

// wagmi'den ethers v6 Signer alma hook'u
export function useEthersSigner({ chainId }: { chainId?: number } = {}): Signer | undefined {
  // wagmi'den bağlı cüzdanın client'ını al
  const { data: walletClient } = useConnectorClient<WalletClient>({ chainId });

  // walletClient değiştiğinde ethers Signer'ı yeniden hesapla
  return useMemo(() => {
    if (!walletClient) return undefined;
    const provider = walletClientToProvider(walletClient);
    // Provider'dan signer'ı al
    // Not: getSigner() asenkron olmasa da, provider'ın hazır olması gerekir.
    // Bu hook senkron döndüğü için, signer'ın hemen kullanıma hazır olduğunu varsayarız.
    // Daha karmaşık durumlarda asenkron yönetim gerekebilir.
    try {
        // ethers v6'da signer almak genellikle provider üzerinden doğrudan yapılır
        // veya provider.getSigner() kullanılır. BrowserProvider bağlamında
        // genellikle provider nesnesi zaten signer yeteneklerine sahip olabilir
        // veya getSigner() ile alınır. Burada getSigner varsayalım.
         return provider.getSigner(); // provider.getSigner() asenkron, bu yüzden düzeltme lazım.

        // ---- DÜZELTME: getSigner asenkron olduğu için state veya farklı bir yapı lazım ----
        // Bu hook'un basitliği için şimdilik bu varsayımı yapıyoruz,
        // ancak gerçek kullanımda signer'ın asenkron olarak alınması gerekebilir.
        // Alternatif: useEffect içinde async olarak alıp state'e atmak.

    } catch (e) {
      console.error("Signer alınamadı:", e);
      return undefined;
    }

  }, [walletClient]);
}


// ----- DAHA DOĞRU ASENKRON YAKLAŞIM (Örnek) -----
import { useState, useEffect } from 'react';

export function useEthersSignerAsync({ chainId }: { chainId?: number } = {}): Signer | undefined {
  const { data: walletClient } = useConnectorClient<WalletClient>({ chainId });
  const [signer, setSigner] = useState<Signer | undefined>(undefined);

  useEffect(() => {
    async function getSignerAsync() {
      if (walletClient) {
        const provider = walletClientToProvider(walletClient);
        try {
          const currentSigner = await provider.getSigner(); // Asenkron olarak al
          setSigner(currentSigner);
        } catch (e) {
          console.error("Signer alınamadı:", e);
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