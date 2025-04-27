// src/components/WrapForm.tsx

import React, { useState, useEffect } from 'react';
import { ethers, parseEther, Contract, BrowserProvider, Signer } from 'ethers'; // Gerekli ethers importları
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync'; // Özel hook'umuz
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi'; // NFT ABI
// ERC20 ve ERC721 için standart ABI'leri de import etmen gerekecek (veya ayrı dosyalarda tut)
import { erc20Abi } from '../abi/erc20Abi'; // Varsayılan ERC20 ABI
import { erc721Abi } from '../abi/erc721Abi'; // Varsayılan ERC721 ABI
import { NFT_CONTRACT_ADDRESS, VAULT_CONTRACT_ADDRESS } from '../config'; // Kontrat adresleri

// Solidity'deki Asset struct'ına karşılık gelen TypeScript tipi
interface AssetToWrap {
  contractAddress: string;
  idOrAmount: string; // UI'dan string olarak alıp sonra BigNumber'a çevireceğiz
  isNFT: boolean;
}

// Kontrat fonksiyonuna gönderilecek format
interface FormattedAsset {
  contractAddress: string;
  idOrAmount: bigint; // BigInt kullanacağız (ethers v6)
  isNFT: boolean;
}

function WrapForm() {
  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSignerAsync({ chainId }); // Asenkron signer'ı al

  // --- State'ler ---
  const [assetAddress, setAssetAddress] = useState('');
  const [assetIdOrAmount, setAssetIdOrAmount] = useState('');
  const [isNft, setIsNft] = useState(false);
  const [assetsToWrap, setAssetsToWrap] = useState<AssetToWrap[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- Kontrat Nesneleri ---
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);

  useEffect(() => {
    if (signer) {
      const nftWrapper = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer);
      setNftWrapperContract(nftWrapper);
    } else {
      setNftWrapperContract(null);
    }
  }, [signer]);

  // --- Fonksiyonlar ---
  const addAssetToList = () => {
    if (!ethers.isAddress(assetAddress) || !assetIdOrAmount) {
      setMessage("Lütfen geçerli varlık adresi ve ID/Miktar girin.");
      return;
    }
    const newAsset: AssetToWrap = {
      contractAddress: assetAddress,
      idOrAmount: assetIdOrAmount,
      isNFT: isNft,
    };
    setAssetsToWrap([...assetsToWrap, newAsset]);
    // Formu temizle
    setAssetAddress('');
    setAssetIdOrAmount('');
    setIsNft(false);
    setMessage('');
  };

  const handleWrap = async () => {
    if (!isConnected || !signer || !nftWrapperContract || assetsToWrap.length === 0) {
      setMessage("Lütfen cüzdanınızı bağlayın ve paketlenecek varlık ekleyin.");
      return;
    }
    setIsLoading(true);
    setMessage("İşlem hazırlanıyor...");

    try {
      // --- ONAY İŞLEMLERİ ---
      setMessage("Onaylar kontrol ediliyor...");
      for (const asset of assetsToWrap) {
        if (asset.isNFT) {
          // ERC721 Onayı
          const nftContract = new Contract(asset.contractAddress, erc721Abi, signer);
          const approvedAddress = await nftContract.getApproved(asset.idOrAmount);
          const isApprovedForAll = await nftContract.isApprovedForAll(address, VAULT_CONTRACT_ADDRESS);

          if (approvedAddress?.toLowerCase() !== VAULT_CONTRACT_ADDRESS.toLowerCase() && !isApprovedForAll) {
            setMessage(`${asset.contractAddress} NFT (ID: ${asset.idOrAmount}) için onay bekleniyor...`);
            const approveTx = await nftContract.approve(VAULT_CONTRACT_ADDRESS, asset.idOrAmount);
            await approveTx.wait();
            setMessage(`NFT ${asset.idOrAmount} onayı başarılı.`);
          }
        } else {
          // ERC20 Onayı
          const erc20Contract = new Contract(asset.contractAddress, erc20Abi, signer);
          // Miktarı BigInt'e çevir (decimal bilgisi gerekebilir, şimdilik varsayalım)
          // GERÇEK UYGULAMADA: erc20Contract.decimals() ile ondalık sayısını alıp parseUnits kullanın!
          let amountBigInt: bigint;
          try {
             // Önce ondalık sayısını alalım (varsayılan 18 değilse)
             const decimals = await erc20Contract.decimals();
             amountBigInt = ethers.parseUnits(asset.idOrAmount, decimals);
          } catch (decError) {
             console.warn(`Ondalık alınamadı (${asset.contractAddress}), 18 varsayılıyor: ${decError}`);
             amountBigInt = ethers.parseUnits(asset.idOrAmount, 18); // Varsayılan
          }


          const allowance: bigint = await erc20Contract.allowance(address, VAULT_CONTRACT_ADDRESS);

          if (allowance < amountBigInt) {
            setMessage(`${asset.contractAddress} token için ${asset.idOrAmount} onay bekleniyor...`);
            const approveTx = await erc20Contract.approve(VAULT_CONTRACT_ADDRESS, amountBigInt);
            await approveTx.wait();
            setMessage(`ERC20 ${asset.contractAddress} onayı başarılı.`);
          }
        }
      }
      setMessage("Tüm onaylar tamamlandı. Paketleme yapılıyor...");

      // --- WRAP ÇAĞRISI ---
      const formattedAssets: FormattedAsset[] = [];
        for (const asset of assetsToWrap) {
            let amountOrIdBigInt: bigint;
            if (asset.isNFT) {
                amountOrIdBigInt = BigInt(asset.idOrAmount);
            } else {
                // ERC20 miktarını tekrar doğru decimal ile BigInt'e çevir
                 try {
                    const erc20Contract = new Contract(asset.contractAddress, erc20Abi, signer);
                    const decimals = await erc20Contract.decimals();
                    amountOrIdBigInt = ethers.parseUnits(asset.idOrAmount, decimals);
                 } catch (decError) {
                    console.warn(`Ondalık alınamadı (${asset.contractAddress}), 18 varsayılıyor: ${decError}`);
                    amountOrIdBigInt = ethers.parseUnits(asset.idOrAmount, 18); // Varsayılan
                 }
            }
            formattedAssets.push({
                contractAddress: asset.contractAddress,
                idOrAmount: amountOrIdBigInt,
                isNFT: asset.isNFT
            });
        }


      const wrapperFee = parseEther("0.001");
      const tx = await nftWrapperContract.wrapAssets(formattedAssets, { value: wrapperFee });
      setMessage(`İşlem gönderildi: ${tx.hash}. Onaylanması bekleniyor...`);
      const receipt = await tx.wait();
      setMessage(`Paketleme başarılı! Tx: ${receipt?.hash}`);
      setAssetsToWrap([]); // Listeyi temizle

      // İsteğe bağlı: Olayları dinleyip wrapperId'yi al ve göster

    } catch (error: any) {
      console.error("Wrap hatası:", error);
      // Kullanıcı dostu hata mesajları göstermek iyi olur (örn. işlem reddedildi, yetersiz bakiye vb.)
      setMessage(`Hata: ${error?.reason || error?.message || error}`);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div>
      <h3>Varlıkları Paketle</h3>
      <div>
        <input
          type="text"
          placeholder="Varlık Kontrat Adresi"
          value={assetAddress}
          onChange={(e) => setAssetAddress(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="text"
          placeholder="Token ID veya Miktar"
          value={assetIdOrAmount}
          onChange={(e) => setAssetIdOrAmount(e.target.value)}
          disabled={isLoading}
        />
        <label>
          <input
            type="checkbox"
            checked={isNft}
            onChange={(e) => setIsNft(e.target.checked)}
            disabled={isLoading}
          />
          Bu bir NFT mi?
        </label>
        <button onClick={addAssetToList} disabled={isLoading}>
          Listeye Ekle
        </button>
      </div>

      <h4>Paketlenecek Varlıklar:</h4>
      {assetsToWrap.length === 0 ? (
        <p>Henüz varlık eklenmedi.</p>
      ) : (
        <ul>
          {assetsToWrap.map((asset, index) => (
            <li key={index}>
              {asset.contractAddress} - {asset.isNFT ? `NFT ID: ${asset.idOrAmount}` : `Miktar: ${asset.idOrAmount}`}
            </li>
          ))}
        </ul>
      )}

      <button onClick={handleWrap} disabled={isLoading || !signer || assetsToWrap.length === 0}>
        {isLoading ? 'İşlem Sürüyor...' : `Paketle (${assetsToWrap.length} Varlık)`}
      </button>
      {message && <p style={{ marginTop: '1rem' }}><small>{message}</small></p>}
    </div>
  );
}

export default WrapForm;