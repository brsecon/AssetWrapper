'use client';

import { useState, FormEvent, useEffect, useMemo } from 'react'; 
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/providers';
import { useWrapAssets } from '@/hooks/useWrapAssets';
import { type Address, parseAbiItem, isAddress } from 'viem'; 
import { Alchemy, Network, Nft, OwnedNft } from 'alchemy-sdk'; 

export enum DisplayAssetType {
  ERC721 = 1,
  ERC1155 = 2,
}

interface AssetInputState {
  contractAddress: string;
  assetType: DisplayAssetType;
  tokenId: string; 
  amount: string;
}

interface AssetInList {
  id: string;
  contractAddress: Address;
  assetType: DisplayAssetType;
  tokenId: bigint;
  amount: bigint;
  name?: string;
  imageUrl?: string;
}

interface AssetWrapperFormProps {
  onWrapSuccess?: () => void;
  onCloseModal?: () => void;
}

const erc721AbiMinimal = [
  parseAbiItem('function setApprovalForAll(address operator, bool approved) external'),
  parseAbiItem('function isApprovedForAll(address owner, address operator) external view returns (bool)'),
  parseAbiItem('function getApproved(uint256 tokenId) external view returns (address)'),
  parseAbiItem('function approve(address to, uint256 tokenId) external'),
] as const;

const erc1155AbiMinimal = [
  parseAbiItem('function isApprovedForAll(address account, address operator) external view returns (bool)'),
  parseAbiItem('function setApprovalForAll(address operator, bool approved) external'),
] as const;

const assetWrapperContractAddress = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as Address | undefined;

const AssetWrapperForm = ({ onWrapSuccess, onCloseModal }: AssetWrapperFormProps) => {
  const { address: connectedAddress } = useAccount();
  const {
    writeContractAsync: callWriteContract,
    data: approvalTxData,
    error: approvalTxError,
    reset: resetApprovalTx,
    isPending: isSendingApprovalTx,
  } = useWriteContract();

  const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const alchemy = useMemo(() => {
    if (!alchemyApiKey) return null;
    return new Alchemy({
      apiKey: alchemyApiKey,
      network: Network.BASE_MAINNET, 
    });
  }, [alchemyApiKey]);

  const [assetInput, setAssetInput] = useState<AssetInputState>({
    contractAddress: '',
    assetType: DisplayAssetType.ERC721,
    tokenId: '', 
    amount: '1',
  });
  const [assetsToWrap, setAssetsToWrap] = useState<AssetInList[]>([]);
  const [formMessage, setFormMessage] = useState<string>('');
  const [isCheckingApproval, setIsCheckingApproval] = useState<boolean>(false);
  const [approvalToProceed, setApprovalToProceed] = useState<(() => () => void) | null>(null); 

  const [ownedNftsFromContract, setOwnedNftsFromContract] = useState<OwnedNft[] | null>(null);
  const [isLoadingOwnedNfts, setIsLoadingOwnedNfts] = useState<boolean>(false);
  const [fetchOwnedNftsError, setFetchOwnedNftsError] = useState<string | null>(null);

  // Yeni state'ler ERC1155 miktar girişi için
  const [nftForAmountEntry, setNftForAmountEntry] = useState<OwnedNft | null>(null);
  const [amountPromptValue, setAmountPromptValue] = useState<string>('1');

  const {
    wrapNFTs,
    wrapERC1155s,
    data: wrapTxData,
    isPending: isWrapping,
    error: wrapError,
    reset: resetWrap,
  } = useWrapAssets();

  const {
    isLoading: isConfirmingApproval,
    isSuccess: isApprovalConfirmed,
  } = useWaitForTransactionReceipt({ hash: approvalTxData });

  const {
    isLoading: isConfirmingWrap,
    isSuccess: isWrapConfirmed,
    error: wrapConfirmationError,
  } = useWaitForTransactionReceipt({ hash: wrapTxData });

  useEffect(() => {
    if (isApprovalConfirmed && approvalToProceed) {
      setFormMessage('Onay başarılı. Paketleme işlemine devam ediliyor...');
      const proceed = approvalToProceed(); 
      proceed(); 
      setApprovalToProceed(null); 
      resetApprovalTx(); 
    }
  }, [isApprovalConfirmed, approvalToProceed, resetApprovalTx]);

  useEffect(() => {
    if (approvalTxError) {
      setFormMessage(`Onay hatası: ${approvalTxError.shortMessage || approvalTxError.message}`);
      setIsCheckingApproval(false);
      setApprovalToProceed(null); 
    }
  }, [approvalTxError]);

  useEffect(() => {
    if (isWrapConfirmed) {
      setFormMessage('Varlıklar başarıyla paketlendi! NFT Wrapper Token ID: ' + (wrapTxData ? BigInt(wrapTxData.toString()).toString() : 'Bilinmiyor')); 
      setAssetsToWrap([]); 
      resetWrap(); 
      if (onWrapSuccess) {
        onWrapSuccess(); 
      }
    } else if (wrapError) {
      setFormMessage(`Paketleme hatası: ${wrapError.shortMessage || wrapError.message}`);
      setIsCheckingApproval(false); 
    } else if (wrapConfirmationError) {
      setFormMessage(`Paketleme onayı hatası: ${wrapConfirmationError.shortMessage || wrapConfirmationError.message}`);
      setIsCheckingApproval(false); 
    }
  }, [isWrapConfirmed, wrapError, wrapConfirmationError, onWrapSuccess, resetWrap, wrapTxData]);

  const handleAssetInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAssetInput(prev => ({
      ...prev,
      [name]: name === 'assetType' ? parseInt(value, 10) as DisplayAssetType : value,
    }));
    if (name === 'assetType' && parseInt(value, 10) === DisplayAssetType.ERC721) {
      setAssetInput(prev => ({ ...prev, amount: '1' }));
    }
    if (name === 'contractAddress') {
      setOwnedNftsFromContract(null);
      setFetchOwnedNftsError(null);
      setAssetInput(prev => ({ ...prev, tokenId: '' })); 
    }
  };

  const handleFetchNftsFromContract = async () => {
    if (!assetInput.contractAddress || !isAddress(assetInput.contractAddress)) {
      setFetchOwnedNftsError("Lütfen geçerli bir kontrat adresi girin.");
      setOwnedNftsFromContract(null);
      return;
    }
    if (!connectedAddress) {
      setFetchOwnedNftsError("Lütfen cüzdanınızı bağlayın.");
      return;
    }
    if (!alchemy) {
      setFetchOwnedNftsError("Alchemy SDK başlatılamadı. API anahtarınızı kontrol edin.");
      return;
    }

    setIsLoadingOwnedNfts(true);
    setFetchOwnedNftsError(null);
    setOwnedNftsFromContract(null);

    try {
      const nfts = await alchemy.nft.getNftsForOwner(connectedAddress, {
        contractAddresses: [assetInput.contractAddress],
      });
      setOwnedNftsFromContract(nfts.ownedNfts);
      if (nfts.ownedNfts.length === 0) {
        setFetchOwnedNftsError("Bu kontrattan cüzdanınızda NFT bulunamadı.");
      }
    } catch (error: any) {
      console.error("Error fetching NFTs from contract:", error);
      const message = error?.error?.message || error?.message || 'Bilinmeyen bir hata oluştu.';
      setFetchOwnedNftsError(`NFT'ler getirilirken hata: ${message}`);
      setOwnedNftsFromContract(null);
    } finally {
      setIsLoadingOwnedNfts(false);
    }
  };

  const handleNftSelection = (clickedNft: OwnedNft) => {
    let determinedAssetType: DisplayAssetType;
    const alchemyTokenType = clickedNft.tokenType?.toUpperCase();

    if (alchemyTokenType === 'ERC721') {
      determinedAssetType = DisplayAssetType.ERC721;
    } else if (alchemyTokenType === 'ERC1155') {
      determinedAssetType = DisplayAssetType.ERC1155;
    } else {
      setFormMessage(`Desteklenmeyen token tipi: ${clickedNft.tokenType}.`);
      return;
    }

    // assetInput'u bilgilendirme amaçlı güncelle (kontrat, token ID)
    setAssetInput(prev => ({
      ...prev,
      contractAddress: clickedNft.contract.address,
      tokenId: clickedNft.tokenId,
      assetType: determinedAssetType, 
      amount: '1', // ERC721 için 1, ERC1155 için bu alan artık doğrudan kullanılmayacak
    }));
    setFetchOwnedNftsError(null);
    setFormMessage(''); // Önceki mesajları temizle

    if (determinedAssetType === DisplayAssetType.ERC721) {
      // ERC721 ise doğrudan ekle/kontrol et
      const existingAssetIndex = assetsToWrap.findIndex(
        asset =>
          asset.contractAddress.toLowerCase() === clickedNft.contract.address.toLowerCase() &&
          asset.tokenId === BigInt(clickedNft.tokenId)
      );
      if (existingAssetIndex !== -1) {
        setFormMessage(`Bu ERC721 NFT (Token ID: ${clickedNft.tokenId}) zaten paketleme listesinde.`);
      } else {
        const newAssetToAdd: AssetInList = {
          id: `${clickedNft.contract.address}-${clickedNft.tokenId}`,
          contractAddress: clickedNft.contract.address as Address,
          assetType: DisplayAssetType.ERC721,
          tokenId: BigInt(clickedNft.tokenId),
          amount: BigInt(1),
          name: clickedNft.name || clickedNft.contract.name || `Token ID: ${clickedNft.tokenId}`,
          imageUrl: clickedNft.image?.thumbnailUrl || clickedNft.image?.cachedUrl || clickedNft.image?.originalUrl,
        };
        setAssetsToWrap(prevAssets => [...prevAssets, newAssetToAdd]);
        setFormMessage(`ERC721 NFT (Token ID: ${clickedNft.tokenId}) listeye eklendi.`);
      }
      setNftForAmountEntry(null); // ERC721 seçildiğinde miktar sorma bölümünü gizle
    } else if (determinedAssetType === DisplayAssetType.ERC1155) {
      // ERC1155 ise, miktar sorma bölümünü göster
      setNftForAmountEntry(clickedNft);
      const existingAsset = assetsToWrap.find(
        asset =>
          asset.contractAddress.toLowerCase() === clickedNft.contract.address.toLowerCase() &&
          asset.tokenId === BigInt(clickedNft.tokenId)
      );
      setAmountPromptValue(existingAsset ? existingAsset.amount.toString() : '1');
    }
  };

  const handleAddErc1155ToListWithAmount = () => {
    if (!nftForAmountEntry) return;

    const clickedNft = nftForAmountEntry;
    let desiredAmountBigInt = BigInt(1);

    const parsedAmount = parseInt(amountPromptValue, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormMessage("ERC1155 için girdiğiniz miktar geçersiz. Miktar 1 olarak ayarlandı.");
      desiredAmountBigInt = BigInt(1);
      setAmountPromptValue('1'); // Input'u da düzelt
    } else {
      desiredAmountBigInt = BigInt(parsedAmount);
    }

    const ownedBalance = BigInt(clickedNft.balance || '0');
    if (ownedBalance <= 0 && desiredAmountBigInt > 0) { // Eğer bakiyesi 0 ama eklemeye çalışıyorsa
      setFormMessage(`Bu ERC1155 token (ID: ${clickedNft.tokenId}) için bakiyeniz 0. Eklenemez.`);
      setNftForAmountEntry(null); // Miktar sormayı kapat
      return;
    }
    if (desiredAmountBigInt > ownedBalance) {
      setFormMessage(`Girdiğiniz miktar (${desiredAmountBigInt}) sahip olduğunuzdan (${ownedBalance}) fazla. Miktar otomatik olarak ${ownedBalance} yapıldı.`);
      desiredAmountBigInt = ownedBalance;
      setAmountPromptValue(ownedBalance.toString()); // Input'u da düzelt
    }
    
    if (desiredAmountBigInt <= 0 && ownedBalance > 0) { // Eğer geçerli bakiye varken 0 veya negatif girmeye çalışırsa
        setFormMessage("Miktar 0'dan büyük olmalıdır. Eklenmedi.");
        // setNftForAmountEntry(null); // İsteğe bağlı: Miktar sormayı kapat veya kullanıcıya düzeltme şansı ver
        return;
    }
     if (desiredAmountBigInt <= 0 && ownedBalance <= 0) { // Zaten bakiyesi yokken ve 0 girmeye çalışırsa
        setFormMessage(`Bu ERC1155 token (ID: ${clickedNft.tokenId}) için bakiyeniz 0. Eklenemez.`);
        setNftForAmountEntry(null);
        return;
    }

    const existingAssetIndex = assetsToWrap.findIndex(
      asset =>
        asset.contractAddress.toLowerCase() === clickedNft.contract.address.toLowerCase() &&
        asset.tokenId === BigInt(clickedNft.tokenId)
    );

    if (existingAssetIndex !== -1) {
      // Varlık zaten listede, miktarını güncelle
      const updatedAssets = [...assetsToWrap];
      if (updatedAssets[existingAssetIndex].amount === desiredAmountBigInt) {
        setFormMessage(`ERC1155 (Token ID: ${clickedNft.tokenId}) zaten listede ve miktar aynı (${desiredAmountBigInt}). Değişiklik yapılmadı.`);
      } else {
        updatedAssets[existingAssetIndex].amount = desiredAmountBigInt;
        setAssetsToWrap(updatedAssets);
        setFormMessage(`Listedeki ERC1155 (Token ID: ${clickedNft.tokenId}) miktarı güncellendi: ${desiredAmountBigInt}.`);
      }
    } else {
      // Varlık listede değil, yeni ekle
      const newAssetToAdd: AssetInList = {
        id: `${clickedNft.contract.address}-${clickedNft.tokenId}`,
        contractAddress: clickedNft.contract.address as Address,
        assetType: DisplayAssetType.ERC1155,
        tokenId: BigInt(clickedNft.tokenId),
        amount: desiredAmountBigInt,
        name: clickedNft.name || clickedNft.contract.name || `Token ID: ${clickedNft.tokenId}`,
        imageUrl: clickedNft.image?.thumbnailUrl || clickedNft.image?.cachedUrl || clickedNft.image?.originalUrl,
      };
      setAssetsToWrap(prevAssets => [...prevAssets, newAssetToAdd]);
      setFormMessage(`ERC1155 NFT (Token ID: ${clickedNft.tokenId}) listeye eklendi (Miktar: ${desiredAmountBigInt}).`);
    }
    setNftForAmountEntry(null); // Miktar sorma bölümünü kapat
  };

  const handleCancelAmountEntry = () => {
    setNftForAmountEntry(null);
    setFormMessage("Miktar girişi iptal edildi.");
  };

  const executeActualWrap = async () => {
    if (!connectedAddress || !assetWrapperContractAddress) {
      setFormMessage('Cüzdan bağlı değil veya wrapper kontrat adresi eksik.');
      setIsCheckingApproval(false); 
      return;
    }
    setFormMessage('Paketleme işlemi hazırlanıyor...');
    resetWrap(); 
    
    const assetsToWrapPayload = assetsToWrap.map(asset => ({
      contractAddress: asset.contractAddress,
      assetType: asset.assetType, 
      tokenId: asset.tokenId,
      amount: asset.amount
    }));

    try {
      const nftAssets = assetsToWrap.filter(asset => asset.assetType === DisplayAssetType.ERC721);
      const erc1155Assets = assetsToWrap.filter(asset => asset.assetType === DisplayAssetType.ERC1155);
      
      let combinedTxHash: `0x${string}` | undefined = undefined;

      if (nftAssets.length > 0 && erc1155Assets.length > 0) {
        setFormMessage("Uyarı: Hem ERC721 hem ERC1155 varlıklarını aynı anda paketlemek şu anda tam desteklenmiyor. Lütfen tek türde varlıkları paketleyin.");
        setIsCheckingApproval(false);
        return;
      }

      if (nftAssets.length > 0) {
        const nftAddresses = nftAssets.map(a => a.contractAddress);
        const tokenIds = nftAssets.map(a => a.tokenId);
        await wrapNFTs({ 
          nftAddresses: nftAddresses,
          tokenIds: tokenIds
        }); 
      } else if (erc1155Assets.length > 0) {
        const tokenAddresses = erc1155Assets.map(a => a.contractAddress);
        const ids = erc1155Assets.map(a => a.tokenId);
        const amounts = erc1155Assets.map(a => a.amount);
        const dataArray = erc1155Assets.map(() => '0x' as `0x${string}`); 
        await wrapERC1155s({ 
            tokenAddresses: tokenAddresses,
            ids: ids,
            amounts: amounts,
            data: dataArray
        });
      }
    } catch (err: any) {
      console.error('Paketleme hatası (executeActualWrap) (güvenli log):', {
        message: err?.message,
        name: err?.name,
        cause: err?.cause,
      });
      setFormMessage(`Paketleme başlatılırken hata: ${err.shortMessage || err.message}`);
    }
  };

  const checkAndProceedWithWrap = async () => {
    if (!connectedAddress || !assetWrapperContractAddress) {
      setFormMessage('Bağlantı veya yapılandırma hatası.');
      setIsCheckingApproval(false);
      return;
    }
    
    setFormMessage('Onaylar kontrol ediliyor...');
    setIsCheckingApproval(true); 

    for (const asset of assetsToWrap) {
      try {
        const isApproved = await readContract(wagmiConfig, {
          address: asset.contractAddress,
          abi: asset.assetType === DisplayAssetType.ERC721 ? erc721AbiMinimal : erc1155AbiMinimal,
          functionName: 'isApprovedForAll',
          args: [connectedAddress, assetWrapperContractAddress!], 
        });

        if (!isApproved) {
          setFormMessage(`${DisplayAssetType[asset.assetType]} (Kontrat: ${asset.contractAddress.substring(0,6)}...) için harcama izni gerekiyor. Lütfen onaylayın.`);
          setApprovalToProceed(() => () => checkAndProceedWithWrap()); 
          
          await callWriteContract({
            address: asset.contractAddress,
            abi: asset.assetType === DisplayAssetType.ERC721 ? erc721AbiMinimal : erc1155AbiMinimal,
            functionName: 'setApprovalForAll',
            args: [assetWrapperContractAddress!, true], 
          });
          return; 
        }
      } catch (error: any) {
        console.error(`Onay kontrolü sırasında hata (${asset.contractAddress}):`, error);
        setFormMessage(`Onay kontrol hatası: ${error.shortMessage || error.message}. Lütfen konsolu kontrol edin.`);
        setIsCheckingApproval(false); 
        return;
      }
    }
    setFormMessage("Tüm varlıklar için onay mevcut. Paket sarılıyor...");
    await executeActualWrap();
  };

  const handleRemoveAssetFromList = (idToRemove: string) => {
    setAssetsToWrap(prev => prev.filter(asset => asset.id !== idToRemove));
    setFormMessage("Varlık paketten çıkarıldı.");
  };

  const handleWrapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormMessage('');
    resetWrap(); 
    resetApprovalTx(); 

    if (assetsToWrap.length === 0) {
      setFormMessage('Lütfen pakete sarmak için en az bir varlık ekleyin.');
      return;
    }
    if (!connectedAddress) {
      setFormMessage('Lütfen cüzdanınızı bağlayın.');
      return;
    }
    if (!assetWrapperContractAddress) {
      setFormMessage('Wrapper kontrat adresi .env.local dosyasında ayarlanmamış.');
      return;
    }

    await checkAndProceedWithWrap();
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg mx-auto my-8 border border-purple-700/50">
      <h2 className="text-2xl font-bold text-purple-300 mb-6 text-center">Varlıkları Paketle</h2>
      
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); checkAndProceedWithWrap(); }} className="space-y-4">
        <div>
          <label htmlFor="contractAddress" className="block text-sm font-medium text-purple-200 mb-1">Kontrat Adresi</label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              name="contractAddress"
              id="contractAddress"
              value={assetInput.contractAddress}
              onChange={handleAssetInputChange}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-100 focus:ring-purple-500 focus:border-purple-500"
              required
            />
            <button 
              type="button"
              onClick={handleFetchNftsFromContract}
              disabled={isLoadingOwnedNfts || !assetInput.contractAddress || !isAddress(assetInput.contractAddress) || !alchemy}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isLoadingOwnedNfts ? 'Yükleniyor...' : 'NFTleri Getir'}
            </button>
          </div>
          {fetchOwnedNftsError && <p className="text-red-400 text-xs mt-1">{fetchOwnedNftsError}</p>}
        </div>

        {ownedNftsFromContract && ownedNftsFromContract.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-purple-200 mb-1">Sahip Olduğunuz NFTler (Kontrat: ...{assetInput.contractAddress.slice(-6)})</label>
            <div className="max-h-60 overflow-y-auto bg-gray-700/50 p-2 rounded-md border border-gray-600 scrollbar-thin scrollbar-thumb-purple-700 scrollbar-track-gray-700/50 pr-2">
              {ownedNftsFromContract.map(nft => (
                <div 
                  key={`${nft.contract.address}-${nft.tokenId}`}
                  onClick={() => handleNftSelection(nft)}
                  className={`p-3 mb-2 rounded-md cursor-pointer transition-all hover:bg-purple-700/70 ${nft.tokenId === assetInput.tokenId && nft.contract.address === assetInput.contractAddress ? 'bg-purple-600 ring-2 ring-purple-400' : 'bg-gray-600/80'}`}
                >
                  <div className="flex items-center space-x-3">
                    {nft.image?.thumbnailUrl ? (
                      <img src={nft.image.thumbnailUrl} alt={nft.name || 'NFT image'} className="w-12 h-12 rounded-md object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-gray-700 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
                        Resim Yok
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <p className="font-semibold truncate text-white" title={nft.name || nft.contract.name || 'İsimsiz NFT'}>
                        {nft.name || nft.contract.name || 'İsimsiz NFT'}
                      </p>
                      <p className="text-xs text-gray-400 truncate" title={nft.tokenId}>
                        Token ID: {nft.tokenId}
                      </p>
                      {nft.tokenType === 'ERC1155' && nft.balance && (
                        <p className="text-xs text-purple-300">
                          Sahip olunan: {nft.balance}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* ERC1155 için Miktar Sorma Bölümü */} 
        {nftForAmountEntry && nftForAmountEntry.tokenType === 'ERC1155' && (
          <div className="mt-4 p-4 border border-purple-700 rounded-lg bg-gray-700/30">
            <h4 className="text-md font-semibold text-purple-200 mb-2">
              '{nftForAmountEntry.name || 'İsimsiz NFT'}' (ID: {nftForAmountEntry.tokenId}) için Miktar Girin
            </h4>
            <p className="text-xs text-gray-400 mb-1">Sahip olunan: {nftForAmountEntry.balance || '0'}</p>
            <div className='flex items-center space-x-2'>
                <input
                type="number"
                value={amountPromptValue}
                onChange={(e) => setAmountPromptValue(e.target.value)}
                placeholder="Miktar"
                min="1"
                className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 text-white"
                />
                <button
                type="button"
                onClick={handleAddErc1155ToListWithAmount}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors whitespace-nowrap"
                >
                Ekle/Güncelle
                </button>
                <button
                type="button"
                onClick={handleCancelAmountEntry}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-md transition-colors whitespace-nowrap"
                >
                İptal
                </button>
            </div>
            {/* Miktar alanı için anlık hata mesajları da buraya eklenebilir */} 
          </div>
        )}

        {assetsToWrap.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Paketlenecek Varlıklar:</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-700 scrollbar-track-gray-700/50 pr-2">
              {assetsToWrap.map(asset => (
                <div key={asset.id} className="flex items-center justify-between bg-gray-700/60 p-3 rounded-md shadow hover:bg-gray-700/80 transition-colors">
                  <div className="flex items-center space-x-3 flex-grow min-w-0">
                    {asset.imageUrl ? (
                      <img 
                        src={asset.imageUrl} 
                        alt={asset.name || 'NFT image'} 
                        className="w-12 h-12 rounded-md object-cover flex-shrink-0 border border-gray-600"
                        onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-gray-600 flex items-center justify-center text-gray-400 text-xs flex-shrink-0 border border-gray-500">
                        Resim Yok
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <p className="font-semibold text-white truncate" title={asset.name || `Token ID: ${asset.tokenId.toString()}`}>
                        {asset.name || `Token ID: ${asset.tokenId.toString()}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        Token ID: <span className="font-mono">{asset.tokenId.toString()}</span>
                      </p>
                      {asset.assetType === DisplayAssetType.ERC1155 && (
                        <p className="text-xs text-gray-500">
                          Miktar: {asset.amount.toString()}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 truncate" title={asset.contractAddress}>
                        Kontrat: ...{asset.contractAddress.slice(-6)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAssetFromList(asset.id)}
                    className="ml-4 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-colors flex-shrink-0"
                  >
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button 
          type="submit" 
          disabled={assetsToWrap.length === 0 || isCheckingApproval || isSendingApprovalTx || isWrapping || isConfirmingApproval || isConfirmingWrap}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-md disabled:opacity-60 transition-colors duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
        >
          {isCheckingApproval ? 'Onaylar Kontrol Ediliyor...' : 
           isSendingApprovalTx ? 'Onay Bekleniyor...' : 
           isConfirmingApproval ? 'Onay Doğrulanıyor...' : 
           isWrapping ? 'Paketleniyor...' : 
           isConfirmingWrap ? 'Paketleme Doğrulanıyor...' : 
           'Varlıkları Paketle'}
        </button>

        {formMessage && <p className={`text-sm mt-3 p-3 rounded-md ${formMessage.includes('başarıyla') ? 'bg-green-600/30 text-green-300' : formMessage.includes('hatası') || formMessage.includes('Uyarı') ? 'bg-red-600/30 text-red-300' : 'bg-blue-600/30 text-blue-300'}`}>{formMessage}</p>}
      </form>
    </div>
  );
};

export default AssetWrapperForm;