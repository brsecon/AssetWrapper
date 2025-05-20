'use client';

import { useState, FormEvent, useEffect } from 'react'; 
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '@/providers';
import { useWrapAssets } from '@/hooks/useWrapAssets';
import { type Address, parseAbiItem } from 'viem';

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
        const dataArray = erc1155Assets.map(() => '0x' as `0x${string}`); // Her varlık için boş data ('0x')
        await wrapERC1155s({ 
            tokenAddresses: tokenAddresses,
            ids: ids,
            amounts: amounts,
            data: dataArray
        });
      }
    } catch (err: any) {
      console.error('Paketleme hatası (executeActualWrap):', err);
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

  const handleAddAssetToList = () => {
    if (!assetInput.contractAddress.startsWith('0x') || assetInput.contractAddress.length !== 42) {
      setFormMessage('Lütfen geçerli bir Ethereum kontrat adresi girin.');
      return;
    }
    if (!assetInput.tokenId.trim()) {
      setFormMessage('Lütfen bir Token ID girin.');
      return;
    }
    try { BigInt(assetInput.tokenId); } catch (e) { setFormMessage('Token ID geçerli bir sayı olmalıdır.'); return; }

    if (assetInput.assetType === DisplayAssetType.ERC1155) {
      if (!assetInput.amount.trim() || parseInt(assetInput.amount, 10) < 1) {
        setFormMessage('Lütfen ERC1155 için geçerli bir miktar girin (en az 1).');
        return;
      }
      try { BigInt(assetInput.amount); } catch (e) { setFormMessage('Miktar geçerli bir sayı olmalıdır.'); return; }
    }

    try {
      const newAsset: AssetInList = {
        id: `${Date.now()}-${assetInput.contractAddress}-${assetInput.tokenId}`,
        contractAddress: assetInput.contractAddress as Address,
        assetType: assetInput.assetType,
        tokenId: BigInt(assetInput.tokenId),
        amount: assetInput.assetType === DisplayAssetType.ERC721 ? BigInt(1) : BigInt(assetInput.amount),
      };
      const alreadyExists = assetsToWrap.some(
        asset => asset.contractAddress.toLowerCase() === newAsset.contractAddress.toLowerCase() &&
                 asset.tokenId === newAsset.tokenId &&
                 asset.assetType === newAsset.assetType
      );
      if (alreadyExists) {
        setFormMessage("Bu varlık zaten pakete eklenmiş.");
        return;
      }
      setAssetsToWrap(prev => [...prev, newAsset]);
      setFormMessage(`${DisplayAssetType[newAsset.assetType]} (ID: ${newAsset.tokenId.toString()}) pakete eklendi.`);
      setAssetInput(prev => ({ ...prev, contractAddress: prev.contractAddress, assetType: prev.assetType, tokenId: '', amount: '1' })); 
    } catch (error) {
      console.error("Varlık eklenirken hata:", error);
      setFormMessage("Varlık eklenirken bir hata oluştu.");
    }
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
    <div className="space-y-6 bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold text-center text-purple-400 mb-6">Varlıkları Paketle</h2>

      {formMessage && (
        <div className={`p-3 rounded-md text-sm text-center ${wrapError || approvalTxError || wrapConfirmationError ? 'bg-red-900/50 text-red-300' : isWrapConfirmed ? 'bg-green-800/60 text-green-200' : 'bg-blue-900/50 text-blue-200'}`}>
          {formMessage}
        </div>
      )}

      {/* Varlık Ekleme Formu */}
      <div className="bg-gray-700 p-4 rounded-lg shadow-md">
        <h3 className="text-lg font-medium text-purple-300 mb-3">Pakete Eklenecek Varlık</h3>
        <div>
          <label htmlFor="contractAddress" className="block text-sm font-medium text-gray-300">Varlık Kontrat Adresi:</label>
          <input
            type="text"
            name="contractAddress"
            id="contractAddress"
            placeholder="0x..."
            value={assetInput.contractAddress}
            onChange={handleAssetInputChange}
            required
            className="mt-1 block w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="assetType" className="block text-sm font-medium text-gray-300">Varlık Tipi:</label>
          <select
            name="assetType"
            id="assetType"
            value={assetInput.assetType}
            onChange={handleAssetInputChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base bg-gray-600 border-gray-600 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md"
          >
            <option value={DisplayAssetType.ERC721}>ERC721</option>
            <option value={DisplayAssetType.ERC1155}>ERC1155</option>
          </select>
        </div>
        <div>
          <label htmlFor="tokenId" className="block text-sm font-medium text-gray-300">Token ID:</label>
          <input
            type="text"
            name="tokenId"
            id="tokenId"
            placeholder="Örn: 123"
            value={assetInput.tokenId}
            onChange={handleAssetInputChange}
            required
            className="mt-1 block w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
          />
        </div>
        {assetInput.assetType === DisplayAssetType.ERC1155 && (
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-300">Miktar (ERC1155 için):</label>
            <input
              type="number"
              name="amount"
              id="amount"
              placeholder="Örn: 10"
              value={assetInput.amount}
              onChange={handleAssetInputChange}
              min="1"
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
            />
          </div>
        )}
        <button 
          type="button" 
          onClick={handleAddAssetToList} 
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-gray-900"
        >
          Listeye Ekle
        </button>
      </div>

      {/* Paketlenecek Varlıklar Listesi */}
      {assetsToWrap.length > 0 && (
        <div className="bg-gray-700 p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-medium text-purple-300 mb-3">Paketlenecek Varlıklar ({assetsToWrap.length})</h3>
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {assetsToWrap.map((asset) => (
              <li key={asset.id} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                <span className="text-sm">{DisplayAssetType[asset.assetType]} - <span className='font-mono text-xs'>{asset.contractAddress.substring(0,6)}...{asset.contractAddress.substring(asset.contractAddress.length - 4)}</span> - ID: {asset.tokenId.toString()}{asset.assetType === DisplayAssetType.ERC1155 ? ` (Miktar: ${asset.amount.toString()})` : ''}</span>
                <button onClick={() => handleRemoveAssetFromList(asset.id)} className="text-red-400 hover:text-red-300 text-xs">Kaldır</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Paketleme Butonu */}
      {assetsToWrap.length > 0 && (
        <button
          onClick={handleWrapSubmit}
          disabled={isCheckingApproval || isSendingApprovalTx || isConfirmingApproval || isWrapping || isConfirmingWrap}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-150 shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75"
        >
          {(isCheckingApproval || isSendingApprovalTx || isConfirmingApproval || isWrapping || isConfirmingWrap) ? 
            <span className='animate-pulse'>İşlem Sürüyor... ({ 
              isConfirmingWrap ? 'Paketleme Onaylanıyor' :
              isWrapping ? 'Paketleme Gönderiliyor' :
              isConfirmingApproval ? 'Onay Bekleniyor' :
              isSendingApprovalTx ? 'Onay Gönderiliyor' :
              'Onaylar Kontrol Ediliyor'
            })</span> : 
            `Paketle (${assetsToWrap.length} Varlık)`
          }
        </button>
      )}

      {onCloseModal && (
        <button
          onClick={onCloseModal}
          className="w-full mt-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-150 shadow-md"
        >
          İptal / Kapat
        </button>
      )}
    </div>
  );
};

export default AssetWrapperForm;