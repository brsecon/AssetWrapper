'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Alchemy, Network, Nft, OwnedNft } from 'alchemy-sdk';
import NftDetailModal, { ContractAsset } from '@/components/NftDetailModal'; 
import WrapAssetModal from '@/components/WrapAssetModal'; 
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/providers'; 
import Link from 'next/link'; 
import { ConnectButton } from '@rainbow-me/rainbowkit'; 

const assetWrapperAbi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "wrapperId",
        "type": "uint256"
      }
    ],
    "name": "getLockedAssets",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "contractAddress",
            "type": "address"
          },
          {
            "internalType": "enum AssetWrapper.AssetType",
            "name": "assetType",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "tokenId",
            "type": "uint256"
          }
        ],
        "internalType": "struct AssetWrapper.Asset[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const; 

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const assetWrapperContractAddress = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as `0x${string}` | undefined;

if (!alchemyApiKey) {
  console.error("NEXT_PUBLIC_ALCHEMY_API_KEY ortam değişkeni ayarlanmamış.");
}
if (!assetWrapperContractAddress) {
  console.error("NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS ortam değişkeni ayarlanmamış.");
}

const alchemySDKConfig = {
  apiKey: alchemyApiKey,
  network: Network.BASE_MAINNET, 
};

const alchemy = alchemyApiKey ? new Alchemy(alchemySDKConfig) : null;

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [ownedNfts, setOwnedNfts] = useState<OwnedNft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNft, setSelectedNft] = useState<Nft | null>(null);
  const [selectedNftLockedAssets, setSelectedNftLockedAssets] = useState<ContractAsset[] | null>(null);
  const [isLoadingLockedAssets, setIsLoadingLockedAssets] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false); 

  // WrapAssetModal için state'ler
  const [isWrapModalOpen, setIsWrapModalOpen] = useState(false);

  const fetchNfts = useCallback(async () => {
    if (isConnected && address && alchemy && assetWrapperContractAddress) {
      setIsLoading(true);
      setError(null);
      try {
        const nftsForOwner = await alchemy.nft.getNftsForOwner(address, {
          contractAddresses: [assetWrapperContractAddress],
        });
        if (nftsForOwner && Array.isArray(nftsForOwner.ownedNfts)) {
          setOwnedNfts(nftsForOwner.ownedNfts);
        } else {
          setOwnedNfts([]);
          console.warn('Alchemy API yanıtında ownedNfts alanı beklenen formatta değil:', nftsForOwner);
        }
      } catch (err: any) {
        console.error('NFTs fetchedilirken hata:', err);
        setError(`NFT\'ler yüklenirken bir sorun oluştu: ${err.message || 'Bilinmeyen hata'}`);
        setOwnedNfts([]);
      }
      setIsLoading(false);
    } else {
      setOwnedNfts([]);
      setIsLoading(false);
      if (!isConnected) setError("Lütfen cüzdanınızı bağlayın.");
      else if (!alchemy) setError("Alchemy SDK başlatılamadı. API anahtarını kontrol edin.");
      else if (!assetWrapperContractAddress) setError("Asset Wrapper kontrat adresi bulunamadı.");
    }
  }, [isConnected, address]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const handleNftClick = async (nft: Nft) => {
    setSelectedNft(nft);
    setIsModalOpen(true);
    setSelectedNftLockedAssets(null); 

    if (!assetWrapperContractAddress || !alchemy) {
      console.error("Asset Wrapper kontrat adresi veya Alchemy SDK ayarlanmamış, kilitli varlıklar getirilemiyor.");
      setIsLoadingLockedAssets(false);
      setError("Konfigürasyon hatası, kilitli varlık detayları yüklenemiyor.");
      return;
    }

    setIsLoadingLockedAssets(true);
    setError(null); 
    try {
      const rawLockedAssets = await readContract(wagmiConfig, {
        abi: assetWrapperAbi,
        address: assetWrapperContractAddress,
        functionName: 'getLockedAssets',
        args: [BigInt(nft.tokenId)], 
      });
      
      if (Array.isArray(rawLockedAssets)) {
        let assetsFromContract: ContractAsset[] = rawLockedAssets.map(asset => ({
          contractAddress: asset.contractAddress,
          assetType: Number(asset.assetType), 
          amount: asset.amount, 
          tokenId: asset.tokenId, 
        }));

        const metadataPromises = assetsFromContract.map(async (asset) => {
          if ((asset.assetType === 1 || asset.assetType === 2) && asset.tokenId !== undefined) {
            try {
              const metadata = await alchemy!.nft.getNftMetadata(
                asset.contractAddress,
                String(asset.tokenId) 
              );
              return {
                ...asset, 
                name: metadata.name || metadata.contract.name || `Token #${asset.tokenId}`,
                imageUrl: metadata.image?.cachedUrl || metadata.image?.thumbnailUrl || metadata.image?.originalUrl,
              };
            } catch (metaError) {
              console.warn(`Metadata for ${asset.contractAddress} #${asset.tokenId} couldn't be fetched:`, metaError);
              return asset; 
            }
          }
          return asset; 
        });

        const enrichedAssets = await Promise.all(metadataPromises);
        setSelectedNftLockedAssets(enrichedAssets);

      } else {
        console.warn("getLockedAssets'ten beklenen formatta veri gelmedi:", rawLockedAssets);
        setSelectedNftLockedAssets([]);
        setError("Kilitli varlık verisi alınamadı.");
      }

    } catch (err: any) {
      console.error('Kilitli varlıklar veya metadataları getirilirken hata:', err);
      setSelectedNftLockedAssets([]); 
      setError(`Kilitli varlık detayları yüklenirken bir hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
    }
    setIsLoadingLockedAssets(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNft(null);
    setSelectedNftLockedAssets(null); 
  };

  const handleUnwrapSuccess = () => {
    handleCloseModal(); 
    fetchNfts(); 
  };

  // Wrap işlemi başarılı olduğunda çağrılacak fonksiyon
  const handleSuccessfulWrap = () => {
    setIsWrapModalOpen(false); // Wrap modalını kapat
    fetchNfts(); // NFT listesini yenile
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-800 to-gray-900 text-white flex flex-col font-[family-name:var(--font-geist-sans)]">
      {/* Header */}
      <header className="py-6 px-4 sm:px-8 flex justify-between items-center w-full border-b border-gray-700/50">
        <div className="text-2xl font-bold">
          <Link href="/">AssetWrapper</Link>
        </div>
        <div className="flex items-center gap-4">
          <ConnectButton />
          {/* Profil sayfasında olduğumuz için Profilim linki yerine Ana Sayfa linki olabilir veya hiç olmayabilir */}
          <Link href="/" className="hidden sm:block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors">
            Ana Sayfa
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        {isConnected ? (
          <>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-purple-300">Profilim ve Varlıklarım</h1>
              <button 
                onClick={() => setIsWrapModalOpen(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-lg shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105"
              >
                Yeni Varlık Paketle
              </button>
            </div>

            {isLoading && <p className="text-center text-lg text-gray-400 py-10">Varlıklarınız yükleniyor...</p>}
            {error && <p className="text-center text-lg text-red-400 py-10">{error}</p>}
            {!isLoading && !error && ownedNfts.length === 0 && (
              <p className="text-center text-lg text-gray-400 py-10">Henüz AssetWrapper formatında bir NFT paketiniz bulunmuyor. Hemen bir tane oluşturun!</p>
            )}

            {!isLoading && !error && ownedNfts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {ownedNfts.map((nft, index) => (
                  <div 
                    key={`${nft.contract.address}-${nft.tokenId}-${index}`}
                    className="bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-purple-500/40 hover:scale-105 group"
                    onClick={() => handleNftClick(nft)}
                  >
                    <div className="relative w-full aspect-square overflow-hidden">
                      {nft.image?.cachedUrl || nft.image?.thumbnailUrl ? (
                        <img 
                          src={nft.image.cachedUrl || nft.image.thumbnailUrl}
                          alt={nft.name || nft.contract.name || 'NFT Image'}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-500">
                          Görsel Yok
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="text-xl font-semibold mb-2 truncate text-purple-300 group-hover:text-purple-200">
                        {nft.name || nft.contract.name || `Token #${nft.tokenId}`}
                      </h3>
                      <p className="text-sm text-gray-400 truncate mb-1">
                        Kontrat: <span className="font-mono text-xs">{nft.contract.address}</span>
                      </p>
                      <p className="text-sm text-gray-400">
                        Token ID: <span className="font-mono text-xs">{nft.tokenId}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
            <h2 className="text-2xl font-semibold text-center text-gray-300 mb-6">Lütfen cüzdanınızı bağlayın.</h2>
            <p className="text-center text-gray-400 mb-8 max-w-md">
              Profil sayfanızı görüntülemek ve varlıklarınızı yönetmek için cüzdanınızı bağlamanız gerekmektedir.
            </p>
            <ConnectButton />
          </div>
        )}

        {isModalOpen && selectedNft && (
          <NftDetailModal 
            isOpen={isModalOpen} 
            onClose={handleCloseModal} 
            nft={selectedNft}
            lockedAssets={selectedNftLockedAssets}
            isLoadingLockedAssets={isLoadingLockedAssets}
            onUnwrapSuccess={handleUnwrapSuccess}
            fetchNfts={fetchNfts} 
          />
        )}

        {isWrapModalOpen && (
          <WrapAssetModal 
            isOpen={isWrapModalOpen}
            onClose={() => setIsWrapModalOpen(false)}
            onWrapSuccess={handleSuccessfulWrap}
            fetchNfts={fetchNfts} 
          />
        )}
      </main>
    </div>
  );
}
