'use client';

import { Nft } from 'alchemy-sdk';
import { useEffect, useState, Fragment } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Dialog, Transition } from '@headlessui/react';
import { ASSET_WRAPPER_CONTRACT_ADDRESS } from '@/config/contracts';
import assetWrapperAbi from '@/contracts/abis/AssetWrapper.json'; 

// ABI'nın gerçekten bir dizi olduğundan emin olalım
// const assetWrapperAbi = Array.isArray(assetWrapperAbiFile) ? assetWrapperAbiFile : assetWrapperAbiFile.abi || [];
// Yukarıdaki satıra gerek kalmadı, direkt import ediyoruz.

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
  fetchNfts: () => Promise<void>; 
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
  console.log('formatErrorMessage içinde ham hata (güvenli log):', {
    message: error?.message,
    name: error?.name,
    cause: error?.cause,
    // Diğer bilinen güvenli alanlar eklenebilir
  });

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
  onUnwrapSuccess,
  fetchNfts
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
    if (!nft || !ASSET_WRAPPER_CONTRACT_ADDRESS) {
      setUnwrapError("Paket açma işlemi için gerekli bilgiler eksik.");
      return;
    }
    setUnwrapError(null); // Önceki hataları temizle
    try {
      await writeContract({
        address: ASSET_WRAPPER_CONTRACT_ADDRESS,
        abi: assetWrapperAbi.abi,
        functionName: 'unwrap',
        args: [BigInt(nft.tokenId)],
      });
    } catch (e) {
      // Bu blok genellikle writeContract'tan direkt bir hata gelirse (örneğin, kullanıcı reddederse ve bu useWriteContract tarafından yakalanmazsa) çalışır.
      // submitUnwrapError hook'u zaten çoğu hatayı yakalayacaktır.
      setUnwrapError(formatErrorMessage(e, "Paket açma işlemi gönderilemedi"));
      console.error("handleUnwrap içinde writeContract hatası:", e);
    }
  };

  if (!isOpen || !nft) return null;

  const mainNftImageUrl = nft.image?.cachedUrl || nft.image?.originalUrl || nft.image?.thumbnailUrl;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        static
        onClose={() => {
          // Bu fonksiyon, static={true} olsa bile dış tıklama veya Esc tuşuna basıldığında Headless UI tarafından çağrılır.
          // Eğer modalın bu tür olaylarda kapanmasını istemiyorsak, burada props.onClose() çağrısını yapmamalıyız.
          // "X" butonu zaten doğrudan props.onClose() çağrısını yapıyor.
          // Sadece bir işlem devam ediyorsa (unwrap gibi) Esc tuşunun modalı kapatmasını engellemek için bir kontrol kalabilir.
          if (isSubmittingUnwrap || isConfirmingUnwrap) {
            return; // İşlem devam ediyorsa hiçbir şey yapma (Esc tuşunu engelle).
          }
          // static={true} olduğunda, dış tıklama veya Esc için burada başka bir işlem yapmaya gerek yok.
          // props.onClose() çağrılmadığı için modal kapanmayacaktır.
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel 
                className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-gray-800/90 backdrop-blur-md border border-purple-700/50 p-6 text-left align-middle shadow-2xl shadow-purple-500/20 transition-all relative"
                onClick={(e) => e.stopPropagation()} // Panel içindeki tıklamaların yayılımını durdur
              >
                {/* Kapatma Butonu Eklendi */}
                <button
                  type="button"
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 text-gray-400 hover:text-purple-300 transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-opacity-75"
                  onClick={onClose} // Bu onClose, NftDetailModal'a prop olarak gelen fonksiyondur.
                  aria-label="Kapat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <Dialog.Title
                  as="h3"
                  className="text-2xl sm:text-3xl font-bold leading-tight text-purple-300 mb-2 truncate"
                  title={nft.name || `Token ID: ${nft.tokenId}`}
                >
                  {nft.name || `Wrapped Token #${nft.tokenId}`}
                </Dialog.Title>
                <p className="text-sm text-gray-400 mb-6">
                  Kontrat: <span className="font-mono text-xs">{nft.contract.address}</span> | Token ID: <span className="font-mono text-xs">{nft.tokenId}</span>
                </p>

                {mainNftImageUrl ? (
                  <div className="mb-6 rounded-lg overflow-hidden border border-gray-700 shadow-lg aspect-square max-h-[400px] mx-auto">
                    <img 
                        src={mainNftImageUrl} 
                        alt={nft.name || `NFT ${nft.tokenId}`} 
                        className="w-full h-full object-contain"
                        onError={(e) => { 
                            const target = e.target as HTMLImageElement;
                            target.src = 'https://via.placeholder.com/400x400?text=Görsel+Yüklenemedi';
                            target.alt = 'Görsel Yüklenemedi'; 
                        }}
                    />
                  </div>
                ) : (
                  <div className="mb-6 rounded-lg border border-dashed border-gray-600 bg-gray-700/50 aspect-square max-h-[400px] mx-auto flex items-center justify-center">
                    <p className="text-gray-500">Ana NFT Görseli Yok</p>
                  </div>
                )}

                <div className="mb-6">
                  <h4 className="text-xl font-semibold text-purple-400 mb-3">Paket İçeriği:</h4>
                  {isLoadingLockedAssets ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 border-t-2 border-purple-400 border-solid rounded-full animate-spin"></div>
                      <p className="ml-3 text-gray-300">İçerik yükleniyor...</p>
                    </div>
                  ) : lockedAssets && lockedAssets.length > 0 ? (
                    <div 
                      className="space-y-3 max-h-60 overflow-y-auto pr-2 rounded-md scrollbar-thin scrollbar-thumb-purple-700 scrollbar-track-gray-700/50"
                    >
                      {lockedAssets.map((asset, index) => (
                        <div key={index} className="flex items-center bg-gray-700/60 p-3 rounded-lg shadow hover:bg-gray-700 transition-colors">
                          {asset.imageUrl ? (
                            <img src={asset.imageUrl} alt={asset.name || `Asset ${index}`} className="w-12 h-12 rounded-md object-cover mr-4 border border-gray-600" />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-gray-600 mr-4 flex items-center justify-center text-gray-400 text-xs border border-gray-500">Görsel</div>
                          )}
                          <div className="flex-grow">
                            <p className="font-semibold text-purple-300 truncate" title={asset.name || `Varlık ${index}`}>{asset.name || `Varlık #${index}`}</p>
                            <p className="text-xs text-gray-400">{getAssetTypeName(asset.assetType)}</p>
                            {asset.assetType !== 0 && <p className="text-xs text-gray-400">Token ID: <span className="font-mono">{String(asset.tokenId)}</span></p>}
                            {(asset.assetType === 0 || asset.assetType === 2) && <p className="text-xs text-gray-400">Miktar: {String(asset.amount)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 py-4 text-center bg-gray-700/50 rounded-md">Bu pakette kilitli başka varlık bulunmuyor veya yüklenemedi.</p>
                  )}
                </div>

                {unwrapError && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-700 text-red-300 rounded-md text-sm">
                    <p className="font-semibold">Hata:</p>
                    <p>{unwrapError}</p>
                  </div>
                )}

                <div className="mt-8 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    className="px-6 py-3 rounded-lg text-white font-semibold bg-gray-600 hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={onClose}
                    disabled={isSubmittingUnwrap || isConfirmingUnwrap}
                  >
                    Kapat
                  </button>
                  {ASSET_WRAPPER_CONTRACT_ADDRESS && (
                    <button
                      type="button"
                      onClick={handleUnwrap}
                      disabled={isSubmittingUnwrap || isConfirmingUnwrap || !lockedAssets || lockedAssets.length === 0} // Kilitli varlık yoksa da disable edilebilir
                      className="px-6 py-3 rounded-lg text-white font-bold bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-700 hover:to-red-700 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center"
                    >
                      {(isSubmittingUnwrap || isConfirmingUnwrap) && (
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {isConfirmingUnwrap ? 'Onaylanıyor...' : isSubmittingUnwrap ? 'Gönderiliyor...' : 'Paketi Aç (Unwrap)'}
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
