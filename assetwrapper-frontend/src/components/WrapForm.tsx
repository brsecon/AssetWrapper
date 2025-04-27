// src/components/WrapForm.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ethers, parseUnits, formatUnits, Contract, Signer, parseEther, toBigInt, isAddress, ContractTransactionResponse, TransactionReceipt } from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
import { AssetWrapperVaultAbi } from '../abi/AssetWrapperVaultAbi';
import { erc20Abi } from '../abi/erc20Abi';
import { erc721Abi } from '../abi/erc721Abi';
import {
  NFT_CONTRACT_ADDRESS,
  VAULT_CONTRACT_ADDRESS,
  ALCHEMY_NETWORK_NAME,
  BLOCK_EXPLORER_URL,
  SelectableAsset
} from '../config';
import { Alchemy, Network, TokenBalancesResponse, Nft, OwnedNftsResponse } from 'alchemy-sdk';

// --- Sabitler ve Kurulumlar ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) { console.warn("VITE_ALCHEMY_API_KEY .env dosyasında tanımlanmamış!"); }
const REFRESH_COOLDOWN = 30000;
const WRAPPER_FEE_DISPLAY = "0.0005";
const WRAPPER_FEE_WEI = parseEther(WRAPPER_FEE_DISPLAY);
// --- Sabitler ve Kurulumlar Sonu ---


// --- Tipler ---
interface AssetToWrapInternal extends SelectableAsset { idOrAmount: string; isNFT: boolean; }
interface FormattedAsset { contractAddress: string; idOrAmount: bigint; isNFT: boolean; }
const formatDisplayNumber = (value: string | number | null | undefined, decimals: number = 4): string => { if (value === null || value === undefined) return '-'; try { const s = String(value).replace(',', '.'); const n = parseFloat(s); if (isNaN(n)) return String(value); if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n!==0)) return n.toExponential(decimals>0?decimals-1:0); return parseFloat(n.toFixed(decimals)).toString(); } catch { return String(value); }};
// --- Tipler Sonu ---

function WrapForm() {
  const { address, isConnected } = useAccount();
  const signer = useEthersSignerAsync();

  // --- State'ler ---
  const [availableAssets, setAvailableAssets] = useState<SelectableAsset[]>([]);
  const [allOwnedNfts, setAllOwnedNfts] = useState<Nft[]>([]);
  const [selectedAssetAddress, setSelectedAssetAddress] = useState<string>("");
  const [nftsInSelectedCollection, setNftsInSelectedCollection] = useState<Nft[]>([]);
  const [selectedNftTokenId, setSelectedNftTokenId] = useState<string>("");
  const [erc20Amount, setErc20Amount] = useState('');
  const [assetsToWrap, setAssetsToWrap] = useState<AssetToWrapInternal[]>([]);
  const [message, setMessage] = useState<{text: string | React.ReactNode, type: 'info' | 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [erc20Balance, setErc20Balance] = useState<string | null>(null);
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [vaultContract, setVaultContract] = useState<Contract | null>(null);
  const [isRefreshAssetsDisabled, setIsRefreshAssetsDisabled] = useState(false);
  const refreshAssetsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // --- State Tanımları Sonu ---


  const alchemy = useMemo(() => { if (!alchemyApiKey) { console.warn("WrapForm: VITE_ALCHEMY_API_KEY not set!"); return null; } try { return new Alchemy({ apiKey: alchemyApiKey, network: ALCHEMY_NETWORK_NAME }); } catch (e) { console.error("Alchemy SDK oluşturulurken hata:", e); return null; } }, []);
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string | React.ReactNode, type: 'info' | 'success' | 'error' = 'info') => { if (typeof text !== 'string') { setMessage({ text: '', type }); setTimeout(() => setMessage({ text: text as any, type }), 0); } else { setMessage({ text, type }); } }, []);
  const formatError = useCallback((error: any): string => { if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.code === 'CALL_EXCEPTION' && error?.data === null) return `İşlem revert oldu (CALL_EXCEPTION - data=null). Sebep belirtilmedi.`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);
  const selectedAssetInfo: SelectableAsset | undefined = useMemo(() => availableAssets.find(asset => asset.address === selectedAssetAddress), [selectedAssetAddress, availableAssets]);

  // --- Efektler ---
  useEffect(() => {
    console.log('Kontrat useEffect ÇALIŞIYOR. Signer:', signer, 'isConnected:', isConnected);
    if (signer && NFT_CONTRACT_ADDRESS && VAULT_CONTRACT_ADDRESS) {
      try {
          console.log('Kontratlar oluşturuluyor...');
          const nftWrapper = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer);
          const vault = new Contract(VAULT_CONTRACT_ADDRESS, AssetWrapperVaultAbi, signer);
          setNftWrapperContract(nftWrapper); setVaultContract(vault);
          console.log(`Kontratlar yüklendi: NFT: ${NFT_CONTRACT_ADDRESS}, Vault: ${VAULT_CONTRACT_ADDRESS}`);
      } catch (error) {
           console.error("Kontratlar oluşturulurken useEffect içinde hata:", error);
           setNftWrapperContract(null); setVaultContract(null); showMessage("Kontratlar yüklenemedi.", "error");
      }
    } else {
      console.log('Kontratlar için signer veya adresler hazır değil, state temizleniyor.');
      setNftWrapperContract(null); setVaultContract(null);
      if (isConnected && (!NFT_CONTRACT_ADDRESS || !VAULT_CONTRACT_ADDRESS)) { showMessage("Kontrat adresleri yapılandırmada eksik.", "error"); }
    }
  }, [signer, isConnected, showMessage]);

  // Cüzdan varlıklarını çekme fonksiyonu (LOGLU VE message bağımlılığı olmayan hali)
  const fetchWalletAssets = useCallback(async (triggeredByUser: boolean = false) => {
    console.log("fetchWalletAssets tetiklendi. Adres:", address, "Alchemy Hazır:", !!alchemy); // LOG 1
    if (!address || !alchemy) { console.log("Adres/Alchemy eksik."); setAvailableAssets([]); setAllOwnedNfts([]); return; };
    if (triggeredByUser && isRefreshAssetsDisabled) { console.log("Yenileme bekleniyor."); showMessage("Listeyi yenilemek için lütfen biraz bekleyin.", "info"); return; }

    setIsFetchingAssets(true);
    if (!message || message.type !== 'error') { showMessage("Cüzdan varlıkları yükleniyor...", "info"); }
    setAvailableAssets([]); setAllOwnedNfts([]); setSelectedAssetAddress(""); setNftsInSelectedCollection([]); setSelectedNftTokenId(""); setErc20Amount("");
    console.log("State'ler sıfırlandı, fetch başlıyor..."); // LOG 4
    if (triggeredByUser) { setIsRefreshAssetsDisabled(true); if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } refreshAssetsTimeoutRef.current = setTimeout(() => { setIsRefreshAssetsDisabled(false); }, REFRESH_COOLDOWN); }

    let fetchSuccess = false; let finalAvailableAssets: SelectableAsset[] = [];
    try {
        console.log("Adım 1: ERC20 token bakiyeleri çekiliyor..."); // LOG 5
        const tokenBalancesResponse: TokenBalancesResponse = await alchemy.core.getTokenBalances(address);
        console.log("ERC20 Bakiye Yanıtı Alındı"); // LOG 6
        const nonZeroBalances = tokenBalancesResponse.tokenBalances.filter( token => { try { return !token.error && ethers.toBigInt(token.tokenBalance ?? '0') > 0n } catch { return false; } } );
        console.log(`Sıfır olmayan ${nonZeroBalances.length} ERC20 bakiyesi bulundu.`); // LOG 7
        console.log("ERC20 metadata çekiliyor..."); // LOG 8
        const tokenPromises = nonZeroBalances.map(async (token): Promise<SelectableAsset | null> => { try { const metadata = await alchemy.core.getTokenMetadata(token.contractAddress); const decimals = metadata.decimals ?? 18; const balance = ethers.formatUnits(token.tokenBalance!, decimals); return { name: metadata.name ?? 'Bilinmeyen Token', address: token.contractAddress, symbol: metadata.symbol ?? '???', type: 'ERC20', decimals: decimals, logo: metadata.logo ?? null, balance: balance, }; } catch (metaError) { console.warn(`Metadata alınamadı: ${token.contractAddress}`, metaError); try { const balance = token.tokenBalance ? ethers.formatUnits(token.tokenBalance, 18) : "0"; return { name: 'Bilinmeyen Token', address: token.contractAddress, symbol: '???', type: 'ERC20', decimals: 18, logo: null, balance: balance }; } catch (fallbackError) { console.error(`Fallback metadata oluşturulamadı: ${token.contractAddress}`, fallbackError); return null; } } });
        const resolvedTokens = (await Promise.all(tokenPromises)).filter(t => t !== null) as SelectableAsset[];
        console.log(`${resolvedTokens.length} ERC20 token metadata başarıyla işlendi.`); // LOG 11

        console.log("Adım 2: Sahip olunan NFT'ler çekiliyor..."); // LOG 12
        const nftResponse: OwnedNftsResponse = await alchemy.nft.getNftsForOwner(address);
        console.log("NFT Yanıtı Alındı"); // LOG 13
        const ownedNfts = nftResponse.ownedNfts.filter(nft => !(NFT_CONTRACT_ADDRESS && nft.contract.address.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()));
        setAllOwnedNfts(ownedNfts);
        console.log(`${ownedNfts.length} adet Wrapper olmayan NFT bulundu.`); // LOG 14
        const uniqueNftCollections = new Map<string, SelectableAsset>();
        for (const nft of ownedNfts) { const collectionAddress = nft.contract.address; if (!uniqueNftCollections.has(collectionAddress)) { const nftAsset : SelectableAsset = { name: nft.contract.name ?? nft.contract.openSea?.collectionName ?? 'Bilinmeyen Koleksiyon', address: collectionAddress, symbol: nft.contract.symbol ?? nft.contract.openSea?.collectionName ?? 'NFT', type: 'ERC721', logo: nft.contract.openSea?.imageUrl ?? nft.media?.[0]?.thumbnail ?? nft.contract.openSea?.imageUrl ?? null, }; uniqueNftCollections.set(collectionAddress, nftAsset); } }
        console.log(`${uniqueNftCollections.size} benzersiz NFT koleksiyonu bulundu.`); // LOG 15

        finalAvailableAssets = [...resolvedTokens, ...Array.from(uniqueNftCollections.values())];
        setAvailableAssets(finalAvailableAssets);
        console.log("Son 'availableAssets' state'i ayarlandı:", finalAvailableAssets); // LOG 16
        fetchSuccess = true;
    }
    catch (error) { console.error("fetchWalletAssets içinde HATA oluştu:", error); showMessage("Cüzdan varlıkları alınırken bir hata oluştu.", "error"); setAvailableAssets([]); setAllOwnedNfts([]); fetchSuccess = false; } // LOG 17
    finally {
        setIsFetchingAssets(false);
        if (fetchSuccess) { const totalAssetsFound = finalAvailableAssets.length; if (message && typeof message.text === 'string' && message.text.includes("yükleniyor")) { showMessage(totalAssetsFound > 0 ? `${totalAssetsFound} varlık türü bulundu.` : "Bu adreste paketlenecek varlık bulunamadı.", "info"); } else if (!message) { showMessage(totalAssetsFound > 0 ? `${totalAssetsFound} varlık türü bulundu.` : "Bu adreste paketlenecek varlık bulunamadı.", "info"); } }
        else if (!message) { showMessage("Cüzdan varlıkları alınamadı.", "error"); }
        console.log("fetchWalletAssets tamamlandı."); // LOG 18
    }
  }, [ address, alchemy, showMessage, clearMessage, isRefreshAssetsDisabled, isConnected ]); // message kaldırıldı

  useEffect(() => { return () => { if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } }; }, []);
  useEffect(() => { if (isConnected && address) { fetchWalletAssets(); } else { setAvailableAssets([]); setAllOwnedNfts([]); } }, [isConnected, address, fetchWalletAssets]);

  // NFT Filtreleme useEffect (LOGLU HALİ)
  useEffect(() => {
    console.log("SelectedAssetInfo veya AllOwnedNfts değişti. SelectedAssetInfo:", selectedAssetInfo); // LOG X1
    console.log("Mevcut allOwnedNfts sayısı:", allOwnedNfts.length); // LOG X2
    if (selectedAssetInfo) {
      if (selectedAssetInfo.type === 'ERC721') {
        console.log(`Filtreleme başlıyor: Koleksiyon Adresi = ${selectedAssetInfo.address}`); // LOG X3
        setErc20Balance(null); setErc20Amount("");
        const filteredNfts = allOwnedNfts.filter(nft => { const nftContractAddrLower = nft.contract.address?.toLowerCase(); const selectedAddrLower = selectedAssetInfo.address?.toLowerCase(); return nftContractAddrLower === selectedAddrLower; });
        console.log("Filtreleme sonucu (filteredNfts):", filteredNfts); // LOG X4
        setNftsInSelectedCollection(filteredNfts);
        setSelectedNftTokenId("");
        console.log("nftsInSelectedCollection state'i güncellendi."); // LOG X5
      } else { console.log("ERC20 seçildi..."); setErc20Balance(selectedAssetInfo.balance ?? null); setNftsInSelectedCollection([]); setSelectedNftTokenId(""); } // LOG X6
    } else { console.log("Seçili varlık yok..."); setErc20Balance(null); setNftsInSelectedCollection([]); setSelectedNftTokenId(""); setErc20Amount(""); } // LOG X7
  }, [selectedAssetInfo, allOwnedNfts]);


  // --- Olay Yöneticileri ---
  // addAssetToList (LOGLU HALİ)
  const addAssetToList = () => {
    console.log("addAssetToList çağrıldı."); // LOG A
    clearMessage();
    console.log("Seçili Varlık Bilgisi:", selectedAssetInfo); // LOG B
    if (!selectedAssetInfo) { console.log("Varlık seçilmedi, fonksiyondan çıkılıyor."); showMessage("Lütfen bir varlık seçin.", "error"); return; } // LOG C
    let idOrAmountToAdd: string; let isNftAsset: boolean;
    if (selectedAssetInfo.type === 'ERC721') {
        console.log("Seçili varlık tipi: ERC721. Seçilen NFT ID:", selectedNftTokenId); // LOG D
        if (!selectedNftTokenId) { console.log("NFT ID seçilmedi, fonksiyondan çıkılıyor."); showMessage("Lütfen koleksiyondan bir NFT seçin.", "error"); return; } // LOG E
        idOrAmountToAdd = selectedNftTokenId; isNftAsset = true;
        console.log("NFT eklenecek:", idOrAmountToAdd); // LOG F
    } else { // ERC20
        console.log("Seçili varlık tipi: ERC20. Girilen Miktar:", erc20Amount); // LOG G
        if (!erc20Amount) { console.log("Miktar girilmedi, fonksiyondan çıkılıyor."); showMessage("Lütfen geçerli bir miktar girin.", "error"); return; } // LOG H
        let amountValue: number; let amountBigInt: bigint; const decimals = selectedAssetInfo.decimals ?? 18;
        try { const cleanedAmount = erc20Amount.replace(',', '.'); amountValue = parseFloat(cleanedAmount); if (isNaN(amountValue) || amountValue <= 0) { console.log("Geçersiz miktar (<= 0 veya NaN)..."); showMessage("Geçerli pozitif bir Miktar girin.", "error"); return; } amountBigInt = parseUnits(cleanedAmount, decimals); } // LOG I
        catch (e) { console.log("Miktar parse hatası:", e); showMessage("Geçersiz miktar formatı.", "error"); return; } // LOG J
        if (erc20Balance !== null) { try { const cleanedBalance = erc20Balance.replace(',', '.'); const balanceBigInt = parseUnits(cleanedBalance, decimals); console.log("Bakiye kontrolü: İstenen:", amountBigInt.toString(), "Mevcut:", balanceBigInt.toString()); if (amountBigInt > balanceBigInt) { console.log("Yetersiz bakiye..."); showMessage(`Yetersiz bakiye!...`, "error"); return; } } // LOG K, L
            catch (e) { console.error("Bakiye karşılaştırma hatası:", e); } } else { console.warn("Bakiye kontrolü için bakiye bilgisi bulunamadı."); }
        idOrAmountToAdd = erc20Amount; isNftAsset = false;
        console.log("ERC20 eklenecek Miktar:", idOrAmountToAdd); // LOG M
    }
    const newAsset: AssetToWrapInternal = { ...selectedAssetInfo, idOrAmount: idOrAmountToAdd, isNFT: isNftAsset, };
    console.log("Oluşturulan yeni varlık objesi:", newAsset); // LOG N
    setAssetsToWrap(currentAssets => { const updatedAssets = [...currentAssets, newAsset]; console.log("AssetsToWrap state'i güncelleniyor. Yeni liste:", updatedAssets); return updatedAssets; }); // LOG O
    console.log("Giriş alanları sıfırlanıyor."); // LOG P
    setErc20Amount(''); setSelectedNftTokenId('');
  };
  const removeAssetFromList = (indexToRemove: number) => { /* ... */ setAssetsToWrap(currentAssets => currentAssets.filter((_, index) => index !== indexToRemove)); clearMessage(); };
  const handleWrap = async () => { /* ... Öncekiyle aynı (isApprovedForAll kontrolü içeren hali) ... */ };
  // --- Olay Yöneticileri Sonu ---


  // --- JSX (Render) ---
  return (
    <div className="wrap-form-section">
      <h3 className="section-title">Varlıkları Paketle (Base Mainnet)</h3>
      {!isConnected ? (
           <div className={`message-area info visible`}><small>Varlıkları görmek ve işlem yapmak için lütfen cüzdanınızı bağlayın.</small></div>
      ) : (
         <>
              {/* 1. Adım: Varlık Türü Seçimi */}
              <div className="form-group">
                   <label htmlFor="asset-select">Varlık Seç (ERC20 veya NFT Koleksiyonu):</label>
                   <div className="input-group">
                        <select id="asset-select" value={selectedAssetAddress} onChange={(e) => { setSelectedAssetAddress(e.target.value); clearMessage(); }} disabled={isLoading || isFetchingAssets || !isConnected}>
                            <option value="" disabled> {isFetchingAssets ? "Yükleniyor..." : (availableAssets.length === 0 ? "Varlık bulunamadı" : "-- Bir varlık seçin --")} </option>
                            {availableAssets.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((asset) => (<option key={asset.address} value={asset.address}>{asset.name ?? 'İsimsiz Varlık'} ({asset.symbol ?? '??'}) - {asset.type}</option>))}
                        </select>
                        <button className="refresh-button" onClick={() => fetchWalletAssets(true)} disabled={isLoading || isFetchingAssets || !isConnected || isRefreshAssetsDisabled} title={isRefreshAssetsDisabled ? "Bekleyin..." : "Listeyi Yenile"}>
                             {isFetchingAssets ? '⏳' : (isRefreshAssetsDisabled ? 'Bekle' : 'Yenile')}
                        </button>
                   </div>
                   <div style={{minHeight: '20px'}}>
                       {isFetchingAssets && <span className="loading-spinner" style={{visibility: isFetchingAssets ? 'visible' : 'hidden'}}><small>Liste yenileniyor...</small></span>}
                   </div>
               </div>

               {/* 2. Adım: Detay Seçimi */}
               {selectedAssetInfo && (
                    <div className="form-group">
                        {selectedAssetInfo.type === 'ERC20' && ( <> <label htmlFor="erc20-amount">Miktar:</label> <div className="input-with-button"> <input id="erc20-amount" type="text" placeholder="Miktar girin" value={erc20Amount} onChange={(e) => setErc20Amount(e.target.value)} disabled={isLoading || isFetchingAssets} /> </div> {erc20Balance !== null && (<span className="balance-info">(Bakiye: {formatDisplayNumber(erc20Balance, 4)})</span>)} </> )}
                        {selectedAssetInfo.type === 'ERC721' && ( <> <label htmlFor="nft-select">Paketlenecek NFT'yi Seç:</label> <div className="input-with-button"> <select id="nft-select" value={selectedNftTokenId} onChange={(e) => { setSelectedNftTokenId(e.target.value); }} disabled={isLoading || isFetchingAssets || nftsInSelectedCollection.length === 0}> <option value="" disabled>{nftsInSelectedCollection.length === 0 ? "Bu koleksiyonda NFT bulunamadı" : "-- NFT Seçin --"}</option> {nftsInSelectedCollection.map(nft => (<option key={nft.tokenId} value={nft.tokenId}>ID: {nft.tokenId} {nft.name ? `- ${nft.name}` : ''}</option>))} </select> </div> </> )}
                         <button onClick={addAssetToList} disabled={isLoading || isFetchingAssets || !selectedAssetInfo || (selectedAssetInfo.type === 'ERC20' && !erc20Amount) || (selectedAssetInfo.type === 'ERC721' && !selectedNftTokenId) } style={{marginTop: 'var(--spacing-md)'}}>Listeye Ekle</button>
                    </div>
               )}

               <h4 className="section-title" style={{ marginTop: 'var(--spacing-lg)' }}>Paketlenecek Varlıklar:</h4>
               {assetsToWrap.length === 0 ? ( <p><small>Henüz varlık eklenmedi.</small></p> ) : ( <ul className="asset-list"> {assetsToWrap.map((asset, index) => { const assetLink = `${BLOCK_EXPLORER_URL}/${asset.isNFT ? 'nft' : 'address'}/${asset.address}${asset.isNFT ? '/'+asset.idOrAmount : ''}`; return ( <li key={`${asset.address}-${asset.idOrAmount}-${index}`}> {asset.logo && <img src={asset.logo} alt={asset.symbol ?? ''} className="asset-logo" />} {!asset.logo && <div className="asset-logo" />} <div className="asset-info"> <a href={assetLink} target="_blank" rel="noopener noreferrer" title={asset.address} className="asset-name">{asset.name ?? asset.address.substring(0,6)+'...'} ({asset.symbol ?? '??'})</a> <span className="asset-details">{asset.isNFT ? `ID: ${asset.idOrAmount}` : ` Miktar: ${formatDisplayNumber(asset.idOrAmount, 4)}`}</span> </div> <div className="asset-actions"><button onClick={() => removeAssetFromList(index)} disabled={isLoading || isFetchingAssets} title="Listeden Kaldır">X</button></div> </li> ); })} </ul> )}
               <div className="action-button-group">
                    {assetsToWrap.length > 0 && (<p style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-sm)' }}>Paketleme Ücreti: {WRAPPER_FEE_DISPLAY} ETH (+ Gas)</p>)}
                    <button onClick={handleWrap} disabled={isLoading || isFetchingAssets || !signer || assetsToWrap.length === 0} >{isLoading ? 'İşlem Sürüyor... ⏳' : `Paketle (${assetsToWrap.length} Varlık)`}</button>
               </div>
         </>
      )}
      {/* Mesaj Alanı (Visibility ile) */}
      <div className={`message-area ${message?.type ?? ''} ${message ? 'visible' : ''}`}>
          {message && <small>{typeof message.text === 'string' ? message.text : message.text}</small>}
      </div>
    </div>
  );
}

export default WrapForm;