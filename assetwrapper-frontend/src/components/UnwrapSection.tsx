// src/components/UnwrapSection.tsx

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// formatUnits eklendi
import { ethers, Contract, Signer, formatUnits, ContractTransactionResponse, TransactionReceipt } from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
import {
    NFT_CONTRACT_ADDRESS,
    ALCHEMY_NETWORK_NAME,
    BLOCK_EXPLORER_URL,
    // SelectableAsset // Bu arayüze burada ihtiyaç yok
} from '../config';
// Gerekli Alchemy tipleri eklendi
import { Alchemy, Network, Nft, OwnedNftsResponse, TokenMetadataResponse } from 'alchemy-sdk';

// --- Sabitler ve Kurulumlar ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) { console.warn("UnwrapSection: VITE_ALCHEMY_API_KEY not set!"); }
const errorStyle = { color: 'red', marginTop: '1rem' };
const successStyle = { color: 'green', marginTop: '1rem' };
const infoStyle = { color: '#555', marginTop: '1rem' };
const REFRESH_COOLDOWN = 30000;
// --- Sabitler ve Kurulumlar Sonu ---


// --- Tipler ---
// Kontrattan gelen temel veri
interface ContractAsset {
    contractAddress: string;
    idOrAmount: bigint;
    isNFT: boolean;
}
// Gösterim için zenginleştirilmiş veri
interface DisplayedAsset {
    contractAddress: string;
    // idOrAmount artık undefined olabilir (hata durumunda)
    idOrAmount: bigint | undefined;
    isNFT: boolean;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    formattedAmount?: string; // ERC20 için formatlanmış miktar
    logo?: string | null;
}
interface OwnedWrapper { tokenId: string; name?: string | null; symbol?: string | null; }
const formatDisplayNumber = (value: string | number | null | undefined, decimals: number = 4): string => { if (value === null || value === undefined) return '-'; try { const s = String(value).replace(',', '.'); const n = parseFloat(s); if (isNaN(n)) return String(value); if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n!==0)) return n.toExponential(decimals>0?decimals-1:0); return parseFloat(n.toFixed(decimals)).toString(); } catch { return String(value); }};
// --- Tipler Sonu ---

function UnwrapSection() {
  const { address, isConnected } = useAccount();
  const signer = useEthersSignerAsync();

  // --- State'ler ---
  const [ownedWrappers, setOwnedWrappers] = useState<OwnedWrapper[]>([]);
  const [selectedWrapperId, setSelectedWrapperId] = useState<string>("");
  const [displayedContents, setDisplayedContents] = useState<DisplayedAsset[]>([]);
  const [message, setMessage] = useState<{text: string | React.ReactNode, type: 'info' | 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Unwrap işlemi için loading
  const [isFetchingWrappers, setIsFetchingWrappers] = useState(false); // Wrapper listesi için
  const [isFetchingContents, setIsFetchingContents] = useState(false); // İçerik+Metadata için
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [isRefreshWrappersDisabled, setIsRefreshWrappersDisabled] = useState(false);
  const refreshWrappersTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // --- State'ler Sonu ---

  // *** LOG (Render anındaki değeri görmek için) ***
  console.log("UnwrapSection RENDERED - selectedWrapperId:", selectedWrapperId);


  // Alchemy örneği
  const alchemy = useMemo(() => {
    if (!alchemyApiKey) {
      console.warn("UnwrapSection: VITE_ALCHEMY_API_KEY not set!");
      return null;
    }
    try {
      return new Alchemy({ apiKey: alchemyApiKey, network: ALCHEMY_NETWORK_NAME });
    } catch (e) {
      console.error("Alchemy SDK oluşturulurken hata:", e);
      return null;
    }
  }, []);


  // --- Yardımcı Fonksiyonlar ---
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string | React.ReactNode, type: 'info' | 'success' | 'error' = 'info') => { setMessage({ text: text as any, type }) }, []);
  const formatError = useCallback((error: any): string => { if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);
  // --- Yardımcı Fonksiyonlar Sonu ---


  // --- Efektler (useEffect) ---

  // Kontratı oluşturma efekti
  useEffect(() => {
    if (signer && NFT_CONTRACT_ADDRESS) {
        try {
            const contract = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer);
            setNftWrapperContract(contract);
            console.log(`UnwrapSection: Kontrat Base Mainnet için yüklendi: NFT: ${NFT_CONTRACT_ADDRESS}`);
        } catch (error) {
            console.error("NFT Wrapper kontratı oluşturulurken hata:", error);
            setNftWrapperContract(null);
            showMessage("NFT Wrapper kontratı yüklenemedi.", "error");
        }
    } else {
      setNftWrapperContract(null);
       if (isConnected && !NFT_CONTRACT_ADDRESS) {
           showMessage("NFT Wrapper kontrat adresi yapılandırmada eksik.", "error");
       }
    }
  }, [signer, isConnected, showMessage]);

  // Timeout temizleme efekti
  useEffect(() => {
    return () => { if (refreshWrappersTimeoutRef.current) { clearTimeout(refreshWrappersTimeoutRef.current); } };
  }, []);

  // Sahip olunan wrapperları çekme efekti
  const fetchOwnedWrappers = useCallback(async (triggeredByUser: boolean = false) => {
    if (!address || !alchemy) { /* ... */ return; }
    if (triggeredByUser && isRefreshWrappersDisabled) { /* ... */ return; }
    setIsFetchingWrappers(true); clearMessage(); showMessage("Sahip olunan paketler yükleniyor...", "info");
    // *** LOG (Resetleme logu) ***
    console.log("fetchOwnedWrappers CALLED - Resetting selectedWrapperId");
    setOwnedWrappers([]); setSelectedWrapperId(""); setDisplayedContents([]); // Resetleme burada
    if (triggeredByUser) { setIsRefreshWrappersDisabled(true); if (refreshWrappersTimeoutRef.current) { clearTimeout(refreshWrappersTimeoutRef.current); } refreshWrappersTimeoutRef.current = setTimeout(() => { setIsRefreshWrappersDisabled(false); }, REFRESH_COOLDOWN); }
    try {
      const options = { contractAddresses: [NFT_CONTRACT_ADDRESS] };
      const response: OwnedNftsResponse = await alchemy.nft.getNftsForOwner(address, options);
      const wrappers: OwnedWrapper[] = response.ownedNfts.map((nft: Nft) => ({ tokenId: nft.tokenId, name: nft.contract.name, symbol: nft.contract.symbol }));
      console.log("Owned Wrappers fetched:", wrappers); // <<< Fetch edilen wrapperları logla
      setOwnedWrappers(wrappers);
      clearMessage(); showMessage(wrappers.length > 0 ? `${wrappers.length} paket bulundu.` : "Henüz hiç paketiniz yok.", "info");
    } catch (error) {
        console.error("Paketler alınamadı:", error); clearMessage();
        showMessage("Sahip olunan paketler alınırken bir hata oluştu.", "error"); setOwnedWrappers([]);
    } finally { setIsFetchingWrappers(false); }
  }, [ address, alchemy, showMessage, clearMessage, isRefreshWrappersDisabled, isConnected ]); // message kaldırıldı

  useEffect(() => {
    if (isConnected && address) { fetchOwnedWrappers(); }
    else { setOwnedWrappers([]); }
  }, [isConnected, address, fetchOwnedWrappers]);


  // Seçili wrapper içeriğini ve METADATASINI çekme
  useEffect(() => {
    // *** LOG (Effect çalıştığında ID değerini görmek için) ***
    console.log("Effect for fetchContentsAndMetadata RUNNING - selectedWrapperId:", selectedWrapperId);
    const fetchContentsAndMetadata = async () => {
      if (!selectedWrapperId || !nftWrapperContract || !address || !alchemy) {
         // *** LOG (Effect neden işlem yapmıyor?) ***
         console.log("fetchContentsAndMetadata SKIPPED - Conditions not met:", { hasId: !!selectedWrapperId, hasContract: !!nftWrapperContract, hasAddress: !!address, hasAlchemy: !!alchemy });
         setDisplayedContents([]); return;
      }
      setIsFetchingContents(true); setDisplayedContents([]); clearMessage();
      showMessage("Paket içeriği ve detayları yükleniyor...", "info");
      console.log("Trying to fetch contents for selectedWrapperId:", selectedWrapperId);

      let rawContents: ContractAsset[] = []; // Dizi olarak başlat

      try {
          // Önce sahiplik kontrolü
          console.log(`Checking owner of token ID ${selectedWrapperId}...`);
          try {
            const owner = await nftWrapperContract.ownerOf(selectedWrapperId);
            console.log(`Owner of ${selectedWrapperId} according to contract: ${owner}`);
            if (owner.toLowerCase() !== address.toLowerCase()) {
              clearMessage(); showMessage(`Hata: Token ${selectedWrapperId} sahibi siz değilsiniz.`, "error");
              setIsFetchingContents(false); return;
            }
            console.log("Ownership confirmed via ownerOf check.");
          } catch (ownerError: any) {
            console.error(`Error calling ownerOf(${selectedWrapperId}):`, ownerError);
            clearMessage(); showMessage(`Hata: Token ID ${selectedWrapperId} sorgulanamadı.`, "error");
            setIsFetchingContents(false); return;
          }

          // İçeriği al
          console.log("Calling getWrapperContents...");
          const resultFromContract: any = await nftWrapperContract.getWrapperContents(selectedWrapperId);
          console.log("getWrapperContents raw result:", resultFromContract);

          // Gelen sonucu işle
          if (Array.isArray(resultFromContract) && resultFromContract.length > 0) {
             rawContents = resultFromContract;
          } else if (resultFromContract && typeof resultFromContract === 'object' && resultFromContract.length !== undefined) {
             try { rawContents = Array.from(resultFromContract); console.log("Converted Result to Array:", rawContents); }
             catch (convError) { console.error("Could not convert contract result to array:", convError); throw new Error("Kontrattan gelen veri formatı anlaşılamadı."); }
          } else if (resultFromContract && typeof resultFromContract === 'object' && Object.keys(resultFromContract).length === 0){
             console.log("getWrapperContents returned empty object/result."); rawContents = [];
          } else { console.warn("getWrapperContents did not return a valid array or array-like object:", resultFromContract); rawContents = []; }

          console.log("Processed rawContents (length):", rawContents.length);

          if (rawContents.length === 0) {
               clearMessage(); showMessage("Paket içeriği boş.", "info");
               setDisplayedContents([]); setIsFetchingContents(false); return;
          }

          // Metadata çekme
          console.log("Fetching metadata for assets...");
          const metadataPromises = rawContents.map(asset => alchemy.core.getTokenMetadata(asset?.contractAddress ?? '').catch(err => { console.warn(`Metadata alınamadı (${asset?.contractAddress}):`, err); return null; }) );
          const metadataResults = await Promise.allSettled(metadataPromises);
          console.log("Metadata results (settled):", metadataResults);

          // Veriyi birleştir ve formatla (Güvenli property erişimi)
          const detailedContents: DisplayedAsset[] = rawContents.map((rawAsset, index) => {
              console.log(`Mapping rawAsset index ${index}:`, rawAsset);
              const metadataResult = metadataResults[index];
              const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
              let formattedAmount: string | undefined = undefined;
              let contractAddress: string = '0xUNKNOWN';
              let idOrAmount: bigint | undefined = undefined;
              let isNFT: boolean = false;

              try {
                  contractAddress = rawAsset.contractAddress;
                  const idOrAmountRaw = rawAsset?.idOrAmount;
                  if (typeof idOrAmountRaw === 'bigint') { idOrAmount = idOrAmountRaw; }
                  else if (typeof idOrAmountRaw === 'number' || typeof idOrAmountRaw === 'string') { try { idOrAmount = BigInt(idOrAmountRaw); } catch { idOrAmount = undefined; } }
                  isNFT = !!rawAsset?.isNFT;
                  console.log(`  -> Extracted for index ${index}: addr=${contractAddress}, idOrAmount=${idOrAmount?.toString() ?? 'undefined'}, isNFT=${isNFT}`);
                  if (idOrAmount === undefined) { console.error(`  -> CRITICAL: idOrAmount could not be determined for index ${index}!`); }
              } catch (accessError) { console.error(`Error accessing properties of rawAsset at index ${index}:`, accessError, rawAsset); }

              const decimals = metadata?.decimals ?? null;
              if (!isNFT && decimals !== null && idOrAmount !== undefined) { try { formattedAmount = formatUnits(idOrAmount, decimals); } catch (formatError) { console.error(`Miktar formatlanamadı:`, formatError); formattedAmount = `~${idOrAmount?.toString() ?? 'N/A'}`; } }

              return { contractAddress, idOrAmount, isNFT, name: metadata?.name ?? null, symbol: metadata?.symbol ?? null, decimals, logo: metadata?.logo ?? null, formattedAmount, };
          }).filter(asset => asset.idOrAmount !== undefined); // Render hatası önlemek için filtrele

          console.log("Final detailedContents to be set:", detailedContents);
          setDisplayedContents(detailedContents);
          clearMessage(); showMessage(detailedContents.length > 0 ? `${detailedContents.length} varlık detayı bulundu.` : "Detaylar yüklenemedi veya içerik boş.", "info");

      } catch (error: any) {
          console.error(`Paket içeriği veya metadata alınamadı (ID: ${selectedWrapperId}):`, error); clearMessage();
          showMessage(`Paket içeriği/detayları alınamadı: ${error.message || 'Bilinmeyen Hata'}`, "error"); setDisplayedContents([]);
      } finally { setIsFetchingContents(false); }
    };
    fetchContentsAndMetadata();
  }, [selectedWrapperId, nftWrapperContract, address, alchemy, showMessage, clearMessage]);
  // --- Efektler Sonu ---


  // --- Olay Yöneticileri ---
  const handleUnwrap = async () => {
    clearMessage();
    if (!selectedWrapperId || !nftWrapperContract || !signer) { /*...*/ return; }
    setIsLoading(true); showMessage("Paket açma işlemi başlatılıyor... Cüzdanınızı kontrol edin.", "info");
    try {
      const tx: ContractTransactionResponse = await nftWrapperContract.unwrapAssets(selectedWrapperId);
      showMessage(`İşlem gönderildi (${tx.hash})... Bekleniyor...`, "info");
      const receipt: TransactionReceipt | null = await tx.wait();
       if (receipt?.status === 1) {
           const txLink = `${BLOCK_EXPLORER_URL}/tx/${receipt.hash}`;
           clearMessage(); showMessage( <span>Paket başarıyla açıldı! <a href={txLink} target="_blank" rel="noopener noreferrer">İşlemi Görüntüle</a></span>, "success" );
           setSelectedWrapperId(""); setDisplayedContents([]);
           fetchOwnedWrappers(); // Listeyi yenile
        }
       else { throw new Error(`Paket açma işlemi başarısız oldu. Tx: ${tx.hash ?? 'N/A'}`); }
    } catch (error: any) {
        console.error("Unwrap hatası:", error); clearMessage();
        showMessage(formatError(error), "error");
    } finally { setIsLoading(false); }
  };
  // --- Olay Yöneticileri Sonu ---


  // --- JSX ---
  return (
    <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #ccc' }}>
      <h2>Paketleri Aç (Base Mainnet)</h2>
      {!isConnected ? ( <p style={infoStyle}>Paketleri görmek ve açmak için lütfen cüzdanınızı bağlayın.</p> ) : (
          <>
              {/* Paket Seçme Dropdown */}
              <div>
                <label htmlFor="wrapper-select" style={{ marginRight: '10px' }}>Paket Seç:</label>
                <select
                    id="wrapper-select"
                    value={selectedWrapperId}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        // *** LOG (Dropdown değiştiğinde) ***
                        console.log("Dropdown CHANGED - New value:", newValue);
                        setSelectedWrapperId(newValue);
                        // Seçim değişince eski içeriği ve mesajı temizle
                        setDisplayedContents([]);
                        clearMessage();
                    }}
                    disabled={isLoading || isFetchingWrappers || !isConnected || ownedWrappers.length === 0}
                    style={{ marginRight: '10px', minWidth: '200px' }} >
                  <option value="" disabled> {isFetchingWrappers ? "Yükleniyor..." : (!isConnected ? "Lütfen cüzdan bağlayın" : (ownedWrappers.length === 0 ? "Açılacak paket yok" : "-- Bir paket seçin --"))} </option>
                  {ownedWrappers.map((wrapper) => ( <option key={wrapper.tokenId} value={wrapper.tokenId}> {wrapper.name ?? 'Wrapper'} ({wrapper.symbol ?? '??'}) - ID: {wrapper.tokenId} </option> ))}
                </select>
                 {/* Paketleri Yenile Butonu */}
                 <button
                     onClick={() => fetchOwnedWrappers(true)}
                     disabled={isLoading || isFetchingWrappers || !isConnected || isRefreshWrappersDisabled}
                     title={isRefreshWrappersDisabled ? "Tekrar yenilemek için lütfen 30 saniye bekleyin." : "Sahip olunan paket listesini yenile"}
                 >
                     {isFetchingWrappers ? 'Yenileniyor... ⏳' : (isRefreshWrappersDisabled ? 'Bekleyin...' : 'Paketleri Yenile')}
                  </button>
                 {isFetchingWrappers && <span style={{ marginLeft: '10px' }}>⏳</span>}
              </div>

              {/* Seçili Paket İçeriği */}
               {/* *** LOG (Bu bölüm render ediliyor mu?) *** */}
               {console.log("Rendering content section check - selectedWrapperId:", selectedWrapperId)}
              {selectedWrapperId && ( // Sadece ID seçiliyse bu bölümü göster
                <div style={{ marginTop: '20px' }}>
                   <h4>Seçili Paket İçeriği (ID: {selectedWrapperId}):</h4>
                   {isFetchingContents ? ( <p>İçerik ve detaylar yükleniyor... ⏳</p> ) : displayedContents.length === 0 ? (
                       message?.type !== 'error' ? <p>Bu paketin içeriği boş veya detaylar yüklenemedi.</p> : null
                   ) : (
                    // İçerik listesi (Güvenli toString kontrolü ile)
                    <ul style={{ listStyle: 'none', paddingLeft: 0, border: '1px solid #eee', padding: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                      {displayedContents.map((asset, index) => {
                          const assetLink = `${BLOCK_EXPLORER_URL}/address/${asset.contractAddress}`;
                          const displayName = asset.name || asset.symbol || `${asset.contractAddress.substring(0, 6)}...`;
                          const displaySymbol = asset.symbol && asset.name !== asset.symbol ? `(${asset.symbol})` : '';
                          // idOrAmount undefined ise 'N/A' göster
                          const displayIdOrAmount = asset.idOrAmount !== undefined ? asset.idOrAmount.toString() : 'N/A';
                          // Key için de fallback kullan
                          const keyIdOrAmount = asset.idOrAmount !== undefined ? asset.idOrAmount.toString() : `undefined_${index}`;

                          return (
                              <li key={`${asset.contractAddress}-${keyIdOrAmount}-${index}`} style={{ display:'flex', alignItems: 'center', marginBottom: '5px', fontSize: '0.9em', borderBottom: '1px dashed #eee', paddingBottom: '5px' }}>
                                {asset.logo && <img src={asset.logo} alt={asset.symbol ?? ''} width={20} height={20} style={{ marginRight: '8px', verticalAlign: 'middle', borderRadius: '50%' }} />}
                                <span style={{ flexGrow: 1 }}>
                                    <a href={assetLink} target="_blank" rel="noopener noreferrer" title={asset.contractAddress}>
                                        {displayName} {displaySymbol}
                                    </a>
                                    {asset.isNFT
                                        ? ` - ID: ${displayIdOrAmount}`
                                        : ` - Miktar: ${asset.formattedAmount !== undefined ? asset.formattedAmount : `~${displayIdOrAmount}`}`
                                    }
                                </span>
                              </li>
                          );
                      })}
                    </ul>
                  )}

                  {/* Paketi Aç Butonu */}
                  <button
                     onClick={handleUnwrap}
                     disabled={isLoading || isFetchingWrappers || isFetchingContents || !signer || !selectedWrapperId}
                     style={{ marginTop: '10px' }}
                   >
                       {isLoading ? 'İşlem Sürüyor... ⏳' : `Paketi Aç (ID: ${selectedWrapperId})`}
                  </button>

                </div>
              )}
          </>
       )}
      {/* Mesaj alanı */}
      {message && <p style={message.type === 'error' ? errorStyle : (message.type === 'success' ? successStyle : infoStyle)}><small>{typeof message.text === 'string' ? message.text : message.text}</small></p>}
    </div>
  );
}

export default UnwrapSection;