'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Alchemy, Network, Nft, OwnedNft } from 'alchemy-sdk';
import NftDetailModal, { ContractAsset } from '@/components/NftDetailModal'; 
import WrapAssetModal from '@/components/WrapAssetModal'; 
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/providers'; 

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

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <h1 className="text-3xl font-bold mb-4 text-purple-400">Profil Sayfası</h1>
        <p className="text-xl">NFT'lerinizi görmek için lütfen cüzdanınızı bağlayın.</p>
      </div>
    );
  }

  if (isLoading && ownedNfts.length === 0) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <h1 className="text-3xl font-bold mb-4 text-purple-400">Profil Sayfası</h1>
        <p className="text-xl">NFT'leriniz yükleniyor...</p>
        <div className="mt-4 w-16 h-16 border-t-4 border-purple-500 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error && !isModalOpen && ownedNfts.length === 0) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <h1 className="text-3xl font-bold mb-4 text-purple-400">Profil Sayfası</h1>
        <p className="text-xl text-red-400">Hata: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-purple-400 mb-4 sm:mb-0">Profilim</h1>
          {/* Varlık Paketle Butonu */}
          <button
            onClick={() => setIsWrapModalOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-150 shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
          >
            Yeni Paket Oluştur
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="mt-4 w-16 h-16 border-t-4 border-purple-500 border-solid rounded-full animate-spin"></div>
          </div>
        )}

        {ownedNfts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {ownedNfts.map((nft) => (
              <div 
                key={`${nft.contract.address}-${nft.tokenId}`}
                className="bg-gray-800 rounded-lg shadow-xl overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-purple-500/50 cursor-pointer group"
                onClick={() => handleNftClick(nft)}
              >
                <div className="w-full h-64 bg-gray-700 flex items-center justify-center overflow-hidden">
                  {nft.image?.cachedUrl || nft.image?.originalUrl ? (
                      <img 
                          src={nft.image?.cachedUrl || nft.image?.originalUrl!} 
                          alt={nft.name || `NFT ${nft.tokenId}`} 
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          onError={(e) => { 
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://via.placeholder.com/300x300?text=Resim+Bulunamadı';
                              target.alt = 'Resim Yüklenemedi'; 
                          }}
                      />
                  ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          Resim Yok
                      </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-purple-300 truncate mb-1" title={nft.name || `NFT #${nft.tokenId}`}>
                    {nft.name || `NFT #${nft.tokenId}`}
                  </h3>
                  <p className="text-xs text-gray-400 truncate" title={`Token ID: ${nft.tokenId}`}>Token ID: {nft.tokenId}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedNft && (
          <NftDetailModal 
            nft={selectedNft}
            lockedAssets={selectedNftLockedAssets}
            isLoadingLockedAssets={isLoadingLockedAssets}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            onUnwrapSuccess={handleUnwrapSuccess}
          />
        )}

        {/* Wrap Asset Modal */}
        <WrapAssetModal 
          isOpen={isWrapModalOpen}
          onClose={() => setIsWrapModalOpen(false)}
          onWrapSuccess={handleSuccessfulWrap}
        />
      </div>
    </div>
  );
}
