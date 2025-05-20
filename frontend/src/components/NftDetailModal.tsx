'use client';

import { Nft } from 'alchemy-sdk';
import { useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import assetWrapperAbiFile from '../contracts/abis/AssetWrapper.json'; 

// ABI'nın gerçekten bir dizi olduğundan emin olalım
const assetWrapperAbi = assetWrapperAbiFile.abi;

const ASSET_WRAPPER_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as `0x${string}` | undefined;

export interface ContractAsset {
  contractAddress: string;
  assetType: number; 
  amount: bigint | string; 
  tokenId: bigint | string; 
  name?: string; 
  imageUrl?: string; 
}

interface NftDetailModalProps {
  nft: Nft | null; 
  lockedAssets: ContractAsset[] | null | undefined; 
  isLoadingLockedAssets: boolean; 
  isOpen: boolean;
  onClose: () => void;
  onUnwrapSuccess: () => void; 
}

const getAssetTypeName = (typeNumber: number): string => {
  switch (typeNumber) {
    case 0: return 'ERC20 Token';
    case 1: return 'ERC721 NFT';
    case 2: return 'ERC1155 Token';
    default: return `Bilinmeyen Tip (${typeNumber})`;
  }
};

// Hata mesajlarını formatlamak için yardımcı fonksiyon
function formatErrorMessage(error: any, baseMessage: string): string {
  // Geliştirme sırasında ham hatayı logla (daha sonra kaldırılabilir)
  console.log('formatErrorMessage içinde ham hata:', JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2));

  const userRejectedMessage = "User rejected the request.";
  const userDeniedSignatureMessage = "User denied transaction signature.";

  let errorTextContent = '';
  if (error) {
    if (typeof error === 'string') {
      errorTextContent = error;
    } else {
      // Hata metnini çeşitli olası alanlardan toplamaya çalış
      if (error.message) errorTextContent += String(error.message) + ' ';
      if (error.shortMessage) errorTextContent += String(error.shortMessage) + ' ';
      if (error.reason) errorTextContent += String(error.reason) + ' ';
      if (error.details) errorTextContent += String(error.details) + ' ';
      if (error.data && typeof error.data === 'object' && error.data.message) errorTextContent += String(error.data.message) + ' ';
      // toString() metodu bazen ek bilgi verebilir, [object Object] olmadığından emin olalım
      if (typeof error.toString === 'function'){
        const S = error.toString();
        if(S !== '[object Object]' && !errorTextContent.includes(S)) errorTextContent += S + ' ';
      }
    }
  }
  errorTextContent = errorTextContent.trim(); // Baştaki/sondaki boşlukları temizle

  // Öncelikli olarak kullanıcı reddetme durumlarını kontrol et
  if (errorTextContent.includes(userRejectedMessage)) {
    return `${baseMessage}: ${userRejectedMessage}`;
  }
  if (errorTextContent.includes(userDeniedSignatureMessage)) {
    return `${baseMessage}: ${userDeniedSignatureMessage}`;
  }

  // Eğer viem/wagmi'den gelen `shortMessage` varsa ve kısaysa onu kullan
  if (error && typeof error.shortMessage === 'string' && error.shortMessage.length > 0 && error.shortMessage.length < 120) {
      return `${baseMessage}: ${error.shortMessage}`;
  }
  
  // Toplanan hata metni çok uzunsa, genel bir mesaj ver ve detayı konsola yazdır
  if (errorTextContent.length > 150) { 
      console.error("formatErrorMessage - Uzun hata metni detayı:", error); 
      return `${baseMessage}: Bir hata oluştu. Daha fazla bilgi için lütfen tarayıcı konsolunu kontrol edin.`;
  }
  
  // Eğer anlamlı ve makul uzunlukta bir hata metni toplayabildiysek onu kullan
  if (errorTextContent) {
    return `${baseMessage}: ${errorTextContent}`;
  }
  
  // Hata nesnesi doğrudan bir string ise (nadiren de olsa)
  if (typeof error === 'string') {
    return `${baseMessage}: ${error}`;
  }

  // Tüm diğer durumlar için genel bir hata mesajı
  return `${baseMessage}: Bilinmeyen bir sorun oluştu. Lütfen tekrar deneyin.`;
}

export default function NftDetailModal({ 
  nft, 
  isOpen, 
  onClose, 
  lockedAssets, 
  isLoadingLockedAssets, 
  onUnwrapSuccess
}: NftDetailModalProps) {

  const { data: unwrapTxHash, writeContract, isPending: isSubmittingUnwrap, error: submitUnwrapError } = useWriteContract();
  const { isLoading: isConfirmingUnwrap, isSuccess: isUnwrapConfirmed, error: confirmUnwrapError } = 
    useWaitForTransactionReceipt({ hash: unwrapTxHash });

  const [unwrapError, setUnwrapError] = useState<string | null>(null);

  useEffect(() => {
    if (submitUnwrapError) {
      setUnwrapError(formatErrorMessage(submitUnwrapError, "Paket açma işlemi başlatılamadı"));
    } else if (confirmUnwrapError) {
      setUnwrapError(formatErrorMessage(confirmUnwrapError, "İşlem onayı sırasında hata oluştu"));
    } else {
      // Yeni bir hata yoksa veya işlem başarılıysa hatayı temizle
      // Ancak, isUnwrapSuccess durumu zaten bunu yönetiyor olabilir, bu satır gereksiz olabilir
      // Eğer isUnwrapSuccess olduğunda unwrapError'un null olması isteniyorsa burada bırakılabilir
      // Şimdilik yoruma alıyorum, çünkü isUnwrapSuccess sonrası onUnwrapSuccess() çağrılıyor ve modal kapanıyor.
      // setUnwrapError(null); 
    }
  }, [submitUnwrapError, confirmUnwrapError]);

  // isUnwrapSuccess true olduğunda ve modal hala açıksa (nadiren de olsa),
  // eski hataların gösterilmemesini sağlamak için bir useEffect daha eklenebilir.
  useEffect(() => {
    if (isUnwrapConfirmed) {
      setUnwrapError(null); // Başarı durumunda hataları temizle
    }
  }, [isUnwrapConfirmed]);

  const handleUnwrap = async () => {
    if (!ASSET_WRAPPER_CONTRACT_ADDRESS) {
      setUnwrapError("Asset Wrapper kontrat adresi bulunamadı.");
      return;
    }
    if (!nft || !nft.tokenId) {
      setUnwrapError("NFT veya Token ID bulunamadı.");
      return;
    }
    setUnwrapError(null); 

    try {
      writeContract({
        address: ASSET_WRAPPER_CONTRACT_ADDRESS,
        abi: assetWrapperAbi,
        functionName: 'unwrap',
        args: [BigInt(nft.tokenId)],
      });
    } catch (e: any) {
      setUnwrapError(formatErrorMessage(e, "Paket açma işlemi sırasında beklenmedik bir hata oluştu"));
      console.error("Unwrap çağrısında beklenmedik hata:", e);
    }
  };

  const getOpenSeaLink = (contractAddress: string, tokenId: string) => {
    return `https://opensea.io/assets/base/${contractAddress}/${tokenId}`;
  };

  const getUnderlyingAssetExplorerLink = (asset: ContractAsset) => {
    if ((asset.assetType === 1 || asset.assetType === 2) && asset.tokenId) {
        return `https://opensea.io/assets/base/${asset.contractAddress}/${String(asset.tokenId)}`;
    }
    if (asset.assetType === 0) {
        return `https://basescan.org/token/${asset.contractAddress}`;
    }
    return `https://basescan.org/address/${asset.contractAddress}`;
  };

  const isUnwrapping = isSubmittingUnwrap || isConfirmingUnwrap;

  if (!isOpen || !nft) { 
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto p-6 relative transform transition-all duration-300 ease-in-out scale-100">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors text-2xl z-10"
          aria-label="Kapat"
          disabled={isUnwrapping} 
        >
          &times;
        </button>

        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-purple-400 truncate" title={nft.name || `NFT #${nft.tokenId}`}>{nft.name || `NFT #${nft.tokenId}`}</h2>
        
        <div className="w-full h-72 md:h-96 bg-gray-700 rounded-md overflow-hidden mb-6 flex items-center justify-center">
          {nft.image?.cachedUrl || nft.image?.originalUrl ? (
            <img 
              src={nft.image?.cachedUrl || nft.image?.originalUrl!} 
              alt={nft.name || `NFT ${nft.tokenId}`} 
              className="w-full h-full object-contain" 
              onError={(e) => { 
                const target = e.target as HTMLImageElement;
                target.src = 'https://via.placeholder.com/400x400?text=Resim+Bulunamadı'; 
                target.alt = 'Resim Yüklenemedi';
              }}
            />
          ) : (
            <span className="text-gray-400 text-lg">Wrapper Resmi Yok</span>
          )}
        </div>

        {nft.description && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-purple-300 mb-1">Wrapper Açıklaması</h3>
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{nft.description}</p>
          </div>
        )}

        <div className="mb-6">
            <h3 className="text-xl font-semibold text-purple-300 mb-3 pt-3 border-t border-gray-700">İçerdiği Varlıklar</h3>
            {isLoadingLockedAssets && <p className="text-gray-400">İçerik detayları yükleniyor...</p>}
            {!isLoadingLockedAssets && (!lockedAssets || lockedAssets.length === 0) && (
                <p className="text-gray-400">Bu wrapper içinde kilitli varlık bulunamadı veya yüklenemedi.</p>
            )}
            {lockedAssets && lockedAssets.length > 0 && (
                <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                {lockedAssets.map((asset, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded-lg shadow-md flex items-start space-x-3">
                        {asset.imageUrl && (asset.assetType === 1 || asset.assetType === 2) && (
                            <div className="w-16 h-16 bg-gray-600 rounded-md overflow-hidden flex-shrink-0">
                                <img 
                                    src={asset.imageUrl} 
                                    alt={asset.name || 'Varlık Resmi'} 
                                    className="w-full h-full object-cover"
                                    onError={(e) => { 
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none'; 
                                        const parent = target.parentNode as HTMLElement;
                                        if(parent) {
                                            const placeholder = document.createElement('div');
                                            placeholder.className = 'w-full h-full flex items-center justify-center text-gray-400 text-xs text-center bg-gray-600';
                                            placeholder.innerText = 'Resim Yok';
                                            parent.appendChild(placeholder);
                                        }
                                    }}
                                />
                            </div>
                        )}
                        {(asset.assetType === 0 || (!asset.imageUrl && (asset.assetType === 1 || asset.assetType === 2))) && (
                             <div className="w-16 h-16 bg-gray-600 rounded-md flex-shrink-0 flex items-center justify-center text-gray-400 text-xs p-1 text-center">
                                {asset.assetType === 0 ? getAssetTypeName(asset.assetType) : 'Resim Yok'}
                            </div>
                        )}
                        <div className="flex-grow min-w-0">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-md font-semibold text-purple-200 truncate" title={asset.name || getAssetTypeName(asset.assetType)}>
                                    {asset.name || getAssetTypeName(asset.assetType)}
                                </p>
                                <a 
                                    href={getUnderlyingAssetExplorerLink(asset)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-md transition-colors flex-shrink-0 ml-2"
                                >
                                    İncele
                                </a>
                            </div>
                            <p className="text-xs text-gray-400 break-all">Kontrat: <span className='font-mono text-gray-300'>{asset.contractAddress}</span></p>
                            {(asset.assetType === 1 || asset.assetType === 2) && asset.tokenId !== undefined && 
                                <p className="text-xs text-gray-400">Token ID: <span className='font-mono text-gray-300'>{String(asset.tokenId)}</span></p>}
                            {(asset.assetType === 0 || asset.assetType === 2) && asset.amount !== undefined && 
                                <p className="text-xs text-gray-400">Miktar: <span className='font-mono text-gray-300'>{String(asset.amount)}</span></p>}
                        </div>
                    </div>
                ))}
                </div>
            )}
        </div>

        {unwrapError && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-center">
            <p className="text-sm text-red-300 font-semibold">Hata:</p>
            <p className="text-xs text-red-400 mt-1 break-words">{unwrapError}</p>
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-purple-300 mb-1">Wrapper Token ID</h3>
            <p className="text-sm text-gray-300 font-mono break-all">{nft.tokenId}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-purple-300 mb-1">Wrapper Kontrat Adresi</h3>
            <p className="text-sm text-gray-300 font-mono break-all">{nft.contract.address}</p>
          </div>
        </div>

        {nft.raw?.metadata?.attributes && Array.isArray(nft.raw.metadata.attributes) && nft.raw.metadata.attributes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-purple-300 mb-2 pt-3 border-t border-gray-700">Wrapper Öznitelikleri</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {nft.raw.metadata.attributes.map((attr: any, index: number) => (
                <div key={index} className="bg-gray-700 p-2 rounded-md text-center">
                  <p className="text-xs text-purple-200 uppercase tracking-wider">{attr.trait_type || 'Öznitelik'}</p>
                  <p className="text-sm font-semibold text-gray-100 truncate" title={String(attr.value)}>{String(attr.value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-gray-700 flex flex-col sm:flex-row sm:justify-end gap-3">
            <button 
                onClick={handleUnwrap}
                disabled={isUnwrapping || !ASSET_WRAPPER_CONTRACT_ADDRESS}
                className="w-full sm:w-auto text-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isUnwrapping ? 'Paket Açılıyor...' : 'Paketi Aç'}
            </button>
            <a 
                href={getOpenSeaLink(nft.contract.address, nft.tokenId)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
            >
                Wrapper'ı OpenSea'de Görüntüle
            </a>
            <button 
                onClick={onClose} 
                disabled={isUnwrapping} 
                className="w-full sm:w-auto px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors text-sm disabled:opacity-50"
            >
                Kapat
            </button>
        </div>

      </div>
    </div>
  );
}
