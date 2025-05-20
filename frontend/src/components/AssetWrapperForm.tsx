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
  const [selectedNftFromList, setSelectedNftFromList] = useState<OwnedNft | null>(null); 

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
      setSelectedNftFromList(null);
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
    setSelectedNftFromList(null);
    setAssetInput(prev => ({ ...prev, tokenId: '' }));

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

  const handleNftSelection = (selectedNft: OwnedNft) => {
    setSelectedNftFromList(selectedNft);

    let newAssetType: DisplayAssetType;
    const alchemyTokenType = selectedNft.tokenType?.toUpperCase(); 

    if (alchemyTokenType === 'ERC721') {
      newAssetType = DisplayAssetType.ERC721;
    } else if (alchemyTokenType === 'ERC1155') {
      newAssetType = DisplayAssetType.ERC1155;
    } else {
      console.warn(`Desteklenmeyen NFT tipi seçildi: ${selectedNft.tokenType}. ERC721 olarak varsayılıyor.`);
      newAssetType = DisplayAssetType.ERC721; // Desteklenmeyen veya bilinmeyen tip için varsayılan
      // Kullanıcıya bir hata mesajı göstermeyi düşünebilirsiniz
      // setFormError(`Seçilen NFT tipi (${selectedNft.tokenType}) şu anda desteklenmiyor.`);
    }

    setAssetInput(prev => ({
      ...prev,
      contractAddress: selectedNft.contract.address,
      tokenId: selectedNft.tokenId,
      assetType: newAssetType,
      amount: '1', // NFT'ler için miktar genellikle 1'dir.
    }));
    setFetchOwnedNftsError(null);
  };

  const handleAddAssetToList = () => {
    let contractAddressToAdd: Address;
    let assetTypeToAdd: DisplayAssetType;
    let tokenIdToAddString: string;
    let amountToAddString: string;

    if (selectedNftFromList) {
      contractAddressToAdd = selectedNftFromList.contract.address as Address;
      assetTypeToAdd = selectedNftFromList.tokenType === 'ERC1155' ? DisplayAssetType.ERC1155 : DisplayAssetType.ERC721;
      tokenIdToAddString = selectedNftFromList.tokenId;
      amountToAddString = assetInput.amount; 
    } else {
      if (!assetInput.tokenId) {
        setFormMessage('Lütfen listeden bir NFT seçin veya Token ID girin.');
        return;
      }
      contractAddressToAdd = assetInput.contractAddress as Address;
      assetTypeToAdd = assetInput.assetType;
      tokenIdToAddString = assetInput.tokenId;
      amountToAddString = assetInput.amount;
    }

    if (!isAddress(contractAddressToAdd)) {
      setFormMessage('Geçerli bir kontrat adresi girilmedi.');
      return;
    }
    if (!tokenIdToAddString) {
      setFormMessage('Token ID girilmedi.');
      return;
    }

    const tokenIdBigInt = BigInt(tokenIdToAddString);
    const amountBigInt = BigInt(amountToAddString);

    if (assetTypeToAdd === DisplayAssetType.ERC721 && amountBigInt !== 1n) {
      setFormMessage('ERC721 varlıkları için miktar 1 olmalıdır.');
      return;
    }
    if (amountBigInt <= 0n) {
        setFormMessage('Miktar 0 dan büyük olmalıdır.');
        return;
    }

    if (selectedNftFromList && selectedNftFromList.tokenType === 'ERC1155') {
        const ownedBalance = BigInt(selectedNftFromList.balance || '0');
        if (amountBigInt > ownedBalance) {
            setFormMessage(`Girdiğiniz miktar (${amountToAddString}), sahip olduğunuz bakiyeden (${selectedNftFromList.balance}) fazla olamaz.`);
            return;
        }
    }

    setAssetsToWrap(prev => [
      ...prev,
      {
        id: `${contractAddressToAdd}-${tokenIdBigInt}-${Math.random()}`,
        contractAddress: contractAddressToAdd,
        assetType: assetTypeToAdd,
        tokenId: tokenIdBigInt,
        amount: amountBigInt,
      },
    ]);
    setFormMessage('Varlık listeye eklendi.');
    setSelectedNftFromList(null);
    setAssetInput(prev => ({
        ...prev,
        tokenId: '',
        // amount: '1', 
        // contractAddress: '', 
    }));
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
            <div className="max-h-60 overflow-y-auto bg-gray-700/50 p-2 rounded-md border border-gray-600 scrollbar-thin scrollbar-thumb-purple-700 scrollbar-track-gray-700/50">
              {ownedNftsFromContract.map(nft => (
                <div 
                  key={`${nft.contract.address}-${nft.tokenId}`}
                  onClick={() => handleNftSelection(nft)}
                  className={`p-3 mb-2 rounded-md cursor-pointer transition-all hover:bg-purple-700/70 ${selectedNftFromList?.tokenId === nft.tokenId && selectedNftFromList?.contract.address === nft.contract.address ? 'bg-purple-600 ring-2 ring-purple-400' : 'bg-gray-600/80'}`}
                >
                  <div className="flex items-center space-x-3">
                    {nft.image?.thumbnailUrl ? (
                      <img src={nft.image.thumbnailUrl} alt={nft.name || 'NFT Resmi'} className="w-12 h-12 rounded object-cover" />
                    ) : nft.image?.cachedUrl ? (
                      <img src={nft.image.cachedUrl} alt={nft.name || 'NFT Resmi'} className="w-12 h-12 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-500 flex items-center justify-center text-gray-300 text-xs">Resim Yok</div>
                    )}
                    <div>
                      <p className="font-semibold text-purple-200 truncate max-w-xs">{nft.name || 'İsimsiz NFT'}</p>
                      <p className="text-xs text-gray-400">Token ID: <span className="font-mono">{nft.tokenId}</span></p>
                      {nft.tokenType === 'ERC1155' && nft.balance && <p className="text-xs text-gray-400">Bakiye: {nft.balance}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {selectedNftFromList && (
            <div>
                <label htmlFor="tokenIdDisplay" className="block text-sm font-medium text-purple-200 mb-1">Seçilen Token ID</label>
                <input
                    type="text"
                    name="tokenIdDisplay"
                    id="tokenIdDisplay"
                    value={assetInput.tokenId} 
                    readOnly
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md shadow-sm text-gray-300 cursor-not-allowed"
                />
            </div>
        )}

        {selectedNftFromList && (
          <div className="mb-4">
            <p className="text-sm text-purple-300">
              Varlık Tipi: <span className="font-semibold text-white">{DisplayAssetType[assetInput.assetType]} (Otomatik Belirlendi)</span>
            </p>
          </div>
        )}

        {assetInput.assetType === DisplayAssetType.ERC1155 && (
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-purple-200 mb-1">
              Miktar {selectedNftFromList && selectedNftFromList.tokenType === 'ERC1155' ? `(Sahip olunan: ${selectedNftFromList.balance || '0'})` : ''}
            </label>
            <input
              type="number"
              name="amount"
              id="amount"
              value={assetInput.amount}
              onChange={handleAssetInputChange}
              min="1"
              placeholder="1"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-100 focus:ring-purple-500 focus:border-purple-500"
              required
            />
          </div>
        )}

        <button 
          type="button" 
          onClick={handleAddAssetToList}
          disabled={!selectedNftFromList && !assetInput.tokenId} 
          className="w-full px-4 py-2 border border-purple-500 text-purple-300 hover:bg-purple-700/30 font-semibold rounded-md disabled:opacity-50 transition-colors"
        >
          Varlığı Listeye Ekle
        </button>

        {assetsToWrap.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Paketlenecek Varlıklar:</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-700 scrollbar-track-gray-700/50 pr-2">
              {assetsToWrap.map(asset => (
                <div key={asset.id} className="bg-gray-700/70 p-3 rounded-md flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-200 truncate max-w-xs">Kontrat: <span className="font-mono text-xs">{asset.contractAddress}</span></p>
                    <p className="text-sm text-gray-300">Token ID: <span className="font-mono">{asset.tokenId.toString()}</span></p>
                    <p className="text-sm text-gray-400">Tip: {asset.assetType === DisplayAssetType.ERC721 ? 'ERC721' : 'ERC1155'}, Miktar: {asset.amount.toString()}</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setAssetsToWrap(prev => prev.filter(a => a.id !== asset.id))}
                    className="text-red-400 hover:text-red-300 text-xs"
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
          className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-md disabled:opacity-60 transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
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