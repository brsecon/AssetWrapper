// src/components/UnwrapSection.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers, Contract, Signer, formatUnits, ContractTransactionResponse, TransactionReceipt } from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
import { NFT_CONTRACT_ADDRESS, SelectableAsset } from '../config';
import { Alchemy, Network, Nft, OwnedNftsResponse } from 'alchemy-sdk';

// --- Sabitler ve Kurulumlar ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) { console.warn("UnwrapSection: VITE_ALCHEMY_API_KEY ..."); }
const alchemy = new Alchemy({ apiKey: alchemyApiKey, network: Network.BASE_SEPOLIA });
const errorStyle = { color: 'red', marginTop: '1rem' };
const successStyle = { color: 'green', marginTop: '1rem' };
const infoStyle = { color: '#555', marginTop: '1rem' };
const REFRESH_COOLDOWN = 30000; // 30 saniye
// --- Sabitler ve Kurulumlar Sonu ---


interface ContractAsset { contractAddress: string; idOrAmount: bigint; isNFT: boolean; }
interface OwnedWrapper { tokenId: string; name?: string | null; symbol?: string | null; }

const formatDisplayNumber = (value: string | number | null | undefined, decimals: number = 4): string => { /* ... (WrapForm'daki gibi) ... */ if (value === null || value === undefined) return '-'; try { const s = String(value).replace(',', '.'); const n = parseFloat(s); if (isNaN(n)) return String(value); if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n!==0)) return n.toExponential(decimals>0?decimals-1:0); return parseFloat(n.toFixed(decimals)).toString(); } catch { return String(value); }};

function UnwrapSection() {
  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSignerAsync({ chainId });

  // --- State'ler ---
  const [ownedWrappers, setOwnedWrappers] = useState<OwnedWrapper[]>([]);
  const [selectedWrapperId, setSelectedWrapperId] = useState<string>("");
  const [wrapperContents, setWrapperContents] = useState<ContractAsset[]>([]);
  const [message, setMessage] = useState<{text: string, type: 'info' | 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingWrappers, setIsFetchingWrappers] = useState(false);
  const [isFetchingContents, setIsFetchingContents] = useState(false);
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [isRefreshWrappersDisabled, setIsRefreshWrappersDisabled] = useState(false);
  const refreshWrappersTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // --- State'ler Sonu ---


  // --- Yardımcı Fonksiyonlar ---
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => { setMessage({ text, type }); }, []);
  const formatError = useCallback((error: any): string => { /* ... (WrapForm'daki gibi) ... */ if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);
  // --- Yardımcı Fonksiyonlar Sonu ---


  // --- Efektler (useEffect) ---
  useEffect(() => { if (signer) { const contract = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer); setNftWrapperContract(contract); } else { setNftWrapperContract(null); } }, [signer]);
  useEffect(() => { return () => { if (refreshWrappersTimeoutRef.current) { clearTimeout(refreshWrappersTimeoutRef.current); } }; }, []);

  const fetchOwnedWrappers = useCallback(async (triggeredByUser: boolean = false) => {
    if (!address) { setOwnedWrappers([]); return; }
    if (triggeredByUser && isRefreshWrappersDisabled) { showMessage("Paketleri yenilemek için lütfen biraz bekleyin.", "info"); return; }
    setIsFetchingWrappers(true); showMessage("Sahip olunan paketler yükleniyor...", "info");
    setOwnedWrappers([]); setSelectedWrapperId(""); setWrapperContents([]);
    if (triggeredByUser) { setIsRefreshWrappersDisabled(true); if (refreshWrappersTimeoutRef.current) { clearTimeout(refreshWrappersTimeoutRef.current); } refreshWrappersTimeoutRef.current = setTimeout(() => { setIsRefreshWrappersDisabled(false); }, REFRESH_COOLDOWN); }
    try {
      const options = { contractAddresses: [NFT_CONTRACT_ADDRESS], };
      const response: OwnedNftsResponse = await alchemy.nft.getNftsForOwner(address, options);
      const wrappers: OwnedWrapper[] = response.ownedNfts.map((nft: Nft) => ({ tokenId: nft.tokenId, name: nft.contract.name, symbol: nft.contract.symbol, }));
      setOwnedWrappers(wrappers);
      showMessage(wrappers.length > 0 ? `${wrappers.length} paket bulundu.` : "Henüz hiç paketiniz yok.", "info");
    } catch (error) { console.error("Paketler alınamadı:", error); showMessage("Sahip olunan paketler alınırken bir hata oluştu.", "error"); setOwnedWrappers([]); }
    finally { setIsFetchingWrappers(false); if (message?.text.includes("paketler yükleniyor")) { clearMessage(); } }
  }, [address, showMessage, clearMessage, isRefreshWrappersDisabled]);

  useEffect(() => { if (isConnected && address) { fetchOwnedWrappers(); } else { setOwnedWrappers([]); } }, [isConnected, address, fetchOwnedWrappers]);

  useEffect(() => {
    const fetchContents = async () => {
      if (selectedWrapperId && nftWrapperContract) {
        setIsFetchingContents(true); setWrapperContents([]); showMessage("Paket içeriği yükleniyor...", "info");
        try { const contents: ContractAsset[] = await nftWrapperContract.getWrapperContents(selectedWrapperId); setWrapperContents(contents); showMessage(contents.length > 0 ? `${contents.length} varlık bulundu.` : "Paket içeriği boş.", "info"); }
        catch (error) { console.error("Paket içeriği alınamadı:", error); showMessage("Paket içeriği alınırken bir hata oluştu.", "error"); setWrapperContents([]); }
        finally { setIsFetchingContents(false); if (message?.text.includes("Paket içeriği yükleniyor")) { clearMessage(); }}
      } else { setWrapperContents([]); }
    };
    fetchContents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWrapperId, nftWrapperContract]);
  // --- Efektler Sonu ---


  // --- Olay Yöneticileri ---
  const handleUnwrap = async () => {
    clearMessage();
    if (!selectedWrapperId || !nftWrapperContract || !signer) { showMessage("Lütfen açmak için bir paket seçin ve cüzdanınızın bağlı olduğundan emin olun.", "error"); return; }
    setIsLoading(true); showMessage("Paket açma işlemi başlatılıyor... Cüzdanınızı kontrol edin.", "info");
    try {
      const tx: ContractTransactionResponse = await nftWrapperContract.unwrapAssets(selectedWrapperId);
      showMessage(`İşlem gönderildi (${tx.hash})... Bekleniyor...`, "info");
      const receipt: TransactionReceipt | null = await tx.wait();
       if (receipt?.status === 1) { showMessage(`Paket başarıyla açıldı! Tx: ${receipt.hash}`, "success"); setSelectedWrapperId(""); setWrapperContents([]); fetchOwnedWrappers(); }
       else { throw new Error(`Paket açma işlemi başarısız oldu. Tx: ${tx.hash ?? 'N/A'}`); }
    } catch (error: any) { console.error("Unwrap hatası:", error); showMessage(formatError(error), "error"); }
    finally { setIsLoading(false); }
  };
  // --- Olay Yöneticileri Sonu ---


  // --- JSX ---
  return (
    <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #ccc' }}>
      <h2>Paketleri Aç</h2>
      <div>
        <label htmlFor="wrapper-select" style={{ marginRight: '10px' }}>Paket Seç:</label>
        <select id="wrapper-select" value={selectedWrapperId} onChange={(e) => {setSelectedWrapperId(e.target.value); clearMessage();}} disabled={isLoading || isFetchingWrappers || !isConnected || ownedWrappers.length === 0} style={{ marginRight: '10px', minWidth: '200px' }} >
          <option value="" disabled> {isFetchingWrappers ? "Yükleniyor..." : (!isConnected ? "Lütfen cüzdan bağlayın" : (ownedWrappers.length === 0 ? "Açılacak paket yok" : "-- Bir paket seçin --"))} </option>
          {ownedWrappers.map((wrapper) => ( <option key={wrapper.tokenId} value={wrapper.tokenId}> {wrapper.name ?? 'Wrapper'} ({wrapper.symbol ?? '??'}) - ID: {wrapper.tokenId} </option> ))}
        </select>
         {/* ----> DEĞİŞİKLİK: title eklendi <---- */}
         <button
             onClick={() => fetchOwnedWrappers(true)}
             disabled={isLoading || isFetchingWrappers || !isConnected || isRefreshWrappersDisabled}
             title={isRefreshWrappersDisabled ? "Tekrar yenilemek için lütfen 30 saniye bekleyin." : "Sahip olunan paket listesini yenile"} // Koşullu title
         >
             {isFetchingWrappers ? 'Yenileniyor... ⏳' : (isRefreshWrappersDisabled ? 'Bekleyin...' : 'Paketleri Yenile')}
          </button>
          {/* ----> DEĞİŞİKLİK SONU <---- */}
         {isFetchingWrappers && <span style={{ marginLeft: '10px' }}>⏳</span>}
      </div>

      {selectedWrapperId && (
        <div style={{ marginTop: '20px' }}>
          <h4>Seçili Paket İçeriği (ID: {selectedWrapperId}):</h4>
          {isFetchingContents ? ( <p>İçerik yükleniyor... ⏳</p> ) : wrapperContents.length === 0 ? ( <p>Bu paketin içeriği boş veya yüklenemedi.</p> ) : (
            <ul style={{ listStyle: 'none', paddingLeft: 0, border: '1px solid #eee', padding: '10px', maxHeight: '200px', overflowY: 'auto' }}>
              {wrapperContents.map((asset, index) => (
                <li key={`${asset.contractAddress}-${index}`} style={{ marginBottom: '5px', fontSize: '0.9em' }}>
                  <strong style={{ marginRight: '5px' }}>{asset.isNFT ? 'NFT:' : 'Token:'}</strong>
                  <a href={`https://sepolia.basescan.org/address/${asset.contractAddress}`} target="_blank" rel="noopener noreferrer">{asset.contractAddress.substring(0, 6)}...{asset.contractAddress.substring(asset.contractAddress.length - 4)}</a>
                  {asset.isNFT ? ` - ID: ${asset.idOrAmount.toString()}` : ` - Miktar (raw): ${asset.idOrAmount.toString()}`}
                </li>
              ))}
            </ul>
          )}
          <button onClick={handleUnwrap} disabled={isLoading || isFetchingContents || isFetchingWrappers || !signer || !selectedWrapperId} style={{ marginTop: '10px' }} >
            {isLoading ? 'İşlem Sürüyor... ⏳' : `Paketi Aç (ID: ${selectedWrapperId})`}
          </button>
        </div>
      )}

      {message && <p style={message.type === 'error' ? errorStyle : (message.type === 'success' ? successStyle : infoStyle)}><small>{message.text}</small></p>}

    </div>
  );
}

export default UnwrapSection;