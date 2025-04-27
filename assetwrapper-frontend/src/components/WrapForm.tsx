// src/components/WrapForm.tsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ethers, parseUnits, formatUnits, Contract, BrowserProvider, Signer, parseEther, toBigInt, isAddress, ContractTransactionResponse, TransactionReceipt } from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
import { AssetWrapperVaultAbi } from '../abi/AssetWrapperVaultAbi';
import { erc20Abi } from '../abi/erc20Abi';
import { erc721Abi } from '../abi/erc721Abi';
import {
  NFT_CONTRACT_ADDRESS,
  VAULT_CONTRACT_ADDRESS,
  SelectableAsset
} from '../config';

import { Alchemy, Network, TokenBalancesResponse, Nft, OwnedNftsResponse } from 'alchemy-sdk';

// --- Sabitler ve Kurulumlar ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) { console.warn("VITE_ALCHEMY_API_KEY .env..."); }
const alchemy = new Alchemy({ apiKey: alchemyApiKey, network: Network.BASE_SEPOLIA });
const errorStyle = { color: 'red', marginTop: '1rem' };
const successStyle = { color: 'green', marginTop: '1rem' };
const infoStyle = { color: '#555', marginTop: '1rem' };
const REFRESH_COOLDOWN = 30000; // 30 saniye (milisaniye)
// --- Sabitler ve Kurulumlar Sonu ---


interface AssetToWrapInternal extends SelectableAsset { idOrAmount: string; isNFT: boolean; }
interface FormattedAsset { contractAddress: string; idOrAmount: bigint; isNFT: boolean; }

const formatDisplayNumber = (value: string | number | null | undefined, decimals: number = 4): string => { if (value === null || value === undefined) return '-'; try { const s = String(value).replace(',', '.'); const n = parseFloat(s); if (isNaN(n)) return String(value); if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n!==0)) return n.toExponential(decimals>0?decimals-1:0); return parseFloat(n.toFixed(decimals)).toString(); } catch { return String(value); }};

function WrapForm() {
  const { address, isConnected, chainId } = useAccount();
  const signer = useEthersSignerAsync({ chainId });

  // --- State'ler ---
  const [availableAssets, setAvailableAssets] = useState<SelectableAsset[]>([]);
  const [selectedAssetAddress, setSelectedAssetAddress] = useState<string>("");
  const [assetIdOrAmount, setAssetIdOrAmount] = useState('');
  const [assetsToWrap, setAssetsToWrap] = useState<AssetToWrapInternal[]>([]);
  const [message, setMessage] = useState<{text: string, type: 'info' | 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [erc20Balance, setErc20Balance] = useState<string | null>(null);
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [vaultContract, setVaultContract] = useState<Contract | null>(null);
  const [isRefreshAssetsDisabled, setIsRefreshAssetsDisabled] = useState(false);
  const refreshAssetsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // --- State Tanımları Sonu ---


  // --- Yardımcı Fonksiyonlar ---
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => { setMessage({ text, type }); }, []);
  const formatError = useCallback((error: any): string => { /* ... (önceki gibi) ... */ if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);
  // --- Yardımcı Fonksiyonlar Sonu ---


  // --- Memoized Değerler ---
  const selectedAsset: SelectableAsset | undefined = useMemo(() => { return availableAssets.find(asset => asset.address === selectedAssetAddress); }, [selectedAssetAddress, availableAssets]);
  // --- Memoized Değerler Sonu ---


  // --- Efektler (useEffect) ---
  const fetchWalletAssets = useCallback(async (triggeredByUser: boolean = false) => {
    if (!address) { setAvailableAssets([]); return; };
    if (triggeredByUser && isRefreshAssetsDisabled) { showMessage("Listeyi yenilemek için lütfen biraz bekleyin.", "info"); return; }
    setIsFetchingAssets(true); showMessage("Cüzdan varlıkları yükleniyor...", "info");
    setAvailableAssets([]); setSelectedAssetAddress("");
    if (triggeredByUser) { setIsRefreshAssetsDisabled(true); if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } refreshAssetsTimeoutRef.current = setTimeout(() => { setIsRefreshAssetsDisabled(false); }, REFRESH_COOLDOWN); }
    try { /* ... (Alchemy API çağrıları önceki gibi) ... */ const tokenBalancesResponse: TokenBalancesResponse = await alchemy.core.getTokenBalances(address); const nonZeroBalances = tokenBalancesResponse.tokenBalances.filter( token => { try { if (!token.tokenBalance) return false; return !token.error && ethers.toBigInt(token.tokenBalance) > 0n; } catch { return false; } } ); const tokenPromises = nonZeroBalances.map(async (token): Promise<SelectableAsset | null> => { try { const metadata = await alchemy.core.getTokenMetadata(token.contractAddress); const decimals = metadata.decimals ?? 18; const balance = ethers.formatUnits(token.tokenBalance!, decimals); return { name: metadata.name ?? 'Bilinmeyen Token', address: token.contractAddress, symbol: metadata.symbol ?? '???', type: 'ERC20', decimals: decimals, logo: metadata.logo ?? null, balance: balance, }; } catch { try { const balance = token.tokenBalance ? ethers.formatUnits(token.tokenBalance, 18) : "0"; return { name: 'Bilinmeyen Token', address: token.contractAddress, symbol: '???', type: 'ERC20', decimals: 18, logo: null, balance: balance }; } catch { return null; } } }); const nftResponse: OwnedNftsResponse = await alchemy.nft.getNftsForOwner(address); const uniqueNftCollections = new Map<string, SelectableAsset>(); for (const nft of nftResponse.ownedNfts) { const nftAsset : SelectableAsset = { name: nft.contract.name ?? nft.contract.openSea?.collectionName ?? 'Bilinmeyen NFT Koleksiyonu', address: nft.contract.address, symbol: nft.contract.symbol ?? nft.contract.openSea?.collectionName ?? 'NFT', type: 'ERC721', logo: nft.contract.openSea?.imageUrl ?? nft.media?.[0]?.thumbnail ?? nft.contract.openSea?.imageUrl ?? null, }; if (!uniqueNftCollections.has(nftAsset.address)) { uniqueNftCollections.set(nftAsset.address, nftAsset); } } const resolvedTokens = (await Promise.all(tokenPromises)).filter(t => t !== null) as SelectableAsset[]; setAvailableAssets([...resolvedTokens, ...Array.from(uniqueNftCollections.values())]); const totalAssetsFound = resolvedTokens.length + uniqueNftCollections.size; showMessage(totalAssetsFound > 0 ? `${totalAssetsFound} varlık türü bulundu.` : "Bu adreste gösterilecek varlık bulunamadı.", "info"); }
    catch (error) { console.error("Cüzdan varlıkları alınamadı:", error); showMessage("Cüzdan varlıkları alınırken bir hata oluştu.", "error"); setAvailableAssets([]); }
    finally { setIsFetchingAssets(false); if (message?.text === "Cüzdan varlıkları yükleniyor...") { clearMessage(); } }
  }, [address, showMessage, clearMessage, isRefreshAssetsDisabled]);

  useEffect(() => { return () => { if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } }; }, []);
  useEffect(() => { if (isConnected && address) { fetchWalletAssets(); } else { setAvailableAssets([]); } }, [isConnected, address, fetchWalletAssets]);
  useEffect(() => { if (signer) { const nftWrapper = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer); const vault = new Contract(VAULT_CONTRACT_ADDRESS, AssetWrapperVaultAbi, signer); setNftWrapperContract(nftWrapper); setVaultContract(vault); } else { setNftWrapperContract(null); setVaultContract(null); } }, [signer]);
  useEffect(() => { if (selectedAsset && selectedAsset.type === 'ERC20') { setErc20Balance(selectedAsset.balance ?? null); } else { setErc20Balance(null); } }, [selectedAsset]);
  // --- Efektler Sonu ---


  // --- Olay Yöneticileri ---
  const addAssetToList = () => { /* ... (önceki gibi) ... */ clearMessage(); if (!selectedAsset || !assetIdOrAmount) { showMessage("Lütfen bir varlık seçin ve ID/Miktar girin.", "error"); return; } if (selectedAsset.type === 'ERC721') { if (!/^\d+$/.test(assetIdOrAmount) || BigInt(assetIdOrAmount) < 0n ) { showMessage("Geçerli, negatif olmayan bir NFT ID girin.", "error"); return; } } else if (selectedAsset.type === 'ERC20') { let amountValue: number; let amountBigInt: bigint; const decimals = selectedAsset.decimals ?? 18; try { const cleanedAmount = assetIdOrAmount.replace(',', '.'); amountValue = parseFloat(cleanedAmount); if (isNaN(amountValue) || amountValue <= 0) { showMessage("Geçerli pozitif bir Miktar girin.", "error"); return; } amountBigInt = parseUnits(cleanedAmount, decimals); } catch (e) { showMessage("Geçersiz miktar formatı.", "error"); return; } if (erc20Balance !== null) { try { const cleanedBalance = erc20Balance.replace(',', '.'); const balanceBigInt = parseUnits(cleanedBalance, decimals); if (amountBigInt > balanceBigInt) { showMessage(`Yetersiz bakiye! Girdiğiniz miktar (${assetIdOrAmount}), mevcut bakiyenizden (${formatDisplayNumber(erc20Balance, 4)}) fazla.`, "error"); return; } } catch (e) { console.error("Bakiye karşılaştırma hatası:", e); } } else { console.warn("Bakiye kontrolü için bakiye bilgisi bulunamadı."); } } const newAsset: AssetToWrapInternal = { ...selectedAsset, idOrAmount: assetIdOrAmount, isNFT: selectedAsset.type === 'ERC721' }; setAssetsToWrap([...assetsToWrap, newAsset]); setAssetIdOrAmount(''); };
  const removeAssetFromList = (indexToRemove: number) => { setAssetsToWrap(currentAssets => currentAssets.filter((_, index) => index !== indexToRemove)); clearMessage(); };
  const handleWrap = async () => { /* ... (önceki gibi, değişiklik yok) ... */ clearMessage(); if (!isConnected || !signer || !nftWrapperContract || !vaultContract || assetsToWrap.length === 0) { showMessage("Lütfen cüzdanınızı bağlayın ve paketlenecek varlık ekleyin.", "error"); return; } setIsLoading(true); showMessage("İşlem hazırlanıyor...", "info"); try { showMessage("Onaylar kontrol ediliyor...", "info"); for (const asset of assetsToWrap) { const currentContractAddress = asset.address; if (!ethers.isAddress(currentContractAddress ?? "")) { showMessage(`Listede geçersiz kontrat adresi bulundu: ${currentContractAddress}.`, "error"); setIsLoading(false); return; } if (!signer) { throw new Error("Signer not available"); } const assetConfig = availableAssets.find(a => a.address === currentContractAddress); const decimals = (asset.type === 'ERC20' ? (assetConfig?.decimals ?? asset.decimals) : undefined) ?? 18; if (asset.isNFT) { const nftContract = new Contract(currentContractAddress, erc721Abi, signer); const approvedAddress = await nftContract.getApproved(asset.idOrAmount); const isApprovedForAll = await nftContract.isApprovedForAll(address, VAULT_CONTRACT_ADDRESS); if (approvedAddress?.toLowerCase() !== VAULT_CONTRACT_ADDRESS.toLowerCase() && !isApprovedForAll) { showMessage(`${asset.name ?? 'NFT'} (ID: ${asset.idOrAmount}) için onay bekleniyor... Cüzdanınızı kontrol edin.`, "info"); const approveTx: ContractTransactionResponse = await nftContract.approve(VAULT_CONTRACT_ADDRESS, asset.idOrAmount); showMessage(`Onay işlemi gönderildi (${approveTx.hash})... Bekleniyor...`, "info"); await approveTx.wait(); showMessage(`NFT ${asset.idOrAmount} onayı başarılı.`, "success"); } } else { const erc20Contract = new Contract(currentContractAddress, erc20Abi, signer); let amountBigInt: bigint; try { amountBigInt = parseUnits(asset.idOrAmount.replace(',', '.'), decimals); } catch (e) { showMessage(`${asset.name ?? 'Token'} için geçersiz miktar: ${asset.idOrAmount}`, "error"); throw e; } const allowance: bigint = await erc20Contract.allowance(address, VAULT_CONTRACT_ADDRESS); if (allowance < amountBigInt) { showMessage(`${asset.name ?? 'Token'} için ${formatDisplayNumber(asset.idOrAmount, decimals)} onay bekleniyor... Cüzdanınızı kontrol edin.`, "info"); const approveTx: ContractTransactionResponse = await erc20Contract.approve(VAULT_CONTRACT_ADDRESS, amountBigInt); showMessage(`Onay işlemi gönderildi (${approveTx.hash})... Bekleniyor...`, "info"); await approveTx.wait(); showMessage(`ERC20 ${asset.name ?? asset.address} onayı başarılı.`, "success"); } } } showMessage("Tüm onaylar tamamlandı. Paketleme yapılıyor... Cüzdanınızı kontrol edin.", "info"); const formattedAssets: FormattedAsset[] = []; for (const asset of assetsToWrap) { const assetConfig = availableAssets.find(a => a.address === asset.address); const decimals = (asset.type === 'ERC20' ? (assetConfig?.decimals ?? asset.decimals) : undefined) ?? 18; let amountOrIdBigInt: bigint; if (asset.isNFT) { amountOrIdBigInt = BigInt(asset.idOrAmount); } else { amountOrIdBigInt = parseUnits(asset.idOrAmount.replace(',', '.'), decimals); } if (!ethers.isAddress(asset.address)) { throw new Error(`Formatlama sırasında geçersiz adres: ${asset.address}`); } formattedAssets.push({ contractAddress: asset.address, idOrAmount: amountOrIdBigInt, isNFT: asset.isNFT }); } const wrapperFee = parseEther("0.001"); if (!nftWrapperContract) throw new Error("NFT Wrapper kontratı hazır değil."); const tx: ContractTransactionResponse = await nftWrapperContract.wrapAssets(formattedAssets, { value: wrapperFee }); showMessage(`Paketleme işlemi gönderildi (${tx.hash})... Bekleniyor...`, "info"); const receipt: TransactionReceipt | null = await tx.wait(); if (receipt?.status === 1) { showMessage(`Paketleme başarılı! Tx: ${receipt.hash}`, "success"); setAssetsToWrap([]); fetchWalletAssets(); } else { throw new Error(`Paketleme işlemi başarısız oldu. Tx: ${tx.hash ?? 'N/A'}`); } } catch (error: any) { console.error("Wrap hatası (Detaylı):", error); showMessage(formatError(error), "error"); } finally { setIsLoading(false); } };
  // --- Olay Yöneticileri Sonu ---


  // --- JSX (Render) ---
  return (
    <div>
      <h3>Varlıkları Paketle (Alchemy ile)</h3>
      <div>
        <label htmlFor="asset-select" style={{ marginRight: '10px' }}>Varlık Seç:</label>
        <select id="asset-select" value={selectedAssetAddress} onChange={(e) => { setSelectedAssetAddress(e.target.value); setAssetIdOrAmount(""); clearMessage(); }} disabled={isLoading || isFetchingAssets || !isConnected} style={{ marginRight: '10px', minWidth: '200px' }}>
           <option value="" disabled> {isFetchingAssets ? "Yükleniyor..." : (!isConnected ? "Lütfen cüzdan bağlayın" : (availableAssets.length === 0 ? "Varlık bulunamadı" : "-- Bir varlık seçin --"))} </option>
           {availableAssets.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((asset) => ( <option key={asset.address} value={asset.address}> {asset.logo && <img src={asset.logo} alt="" width={16} height={16} style={{ marginRight: '5px', verticalAlign: 'middle', borderRadius: '50%' }} />} {asset.name ?? 'İsimsiz Varlık'} ({asset.symbol ?? '??'}) - {asset.type} </option> ))}
        </select>
         {/* ----> DEĞİŞİKLİK: title eklendi <---- */}
         <button
             onClick={() => fetchWalletAssets(true)}
             disabled={isLoading || isFetchingAssets || !isConnected || isRefreshAssetsDisabled}
             title={isRefreshAssetsDisabled ? "Tekrar yenilemek için lütfen 30 saniye bekleyin." : "Cüzdandaki varlık listesini yenile"} // Koşullu title
         >
             {isFetchingAssets ? 'Yenileniyor... ⏳' : (isRefreshAssetsDisabled ? 'Bekleyin...' : 'Listeyi Yenile')}
          </button>
          {/* ----> DEĞİŞİKLİK SONU <---- */}
         {isFetchingAssets && <span style={{ marginLeft: '10px' }}>⏳</span>}
      </div>
      {selectedAsset && ( <div style={{ marginTop: '10px' }}> <label htmlFor="amount-id" style={{ marginRight: '10px' }}> {selectedAsset.type === 'ERC721' ? 'NFT Token ID:' : 'Miktar:'} </label> <input id="amount-id" type={selectedAsset.type === 'ERC721' ? 'number' : 'text'} placeholder={selectedAsset.type === 'ERC721' ? 'Sahip olduğunuz ID' : 'Miktar girin'} value={assetIdOrAmount} onChange={(e) => setAssetIdOrAmount(e.target.value)} disabled={isLoading || isFetchingAssets} style={{ marginRight: '10px', width: '150px' }} min={selectedAsset.type === 'ERC721' ? "0" : undefined} step={selectedAsset.type === 'ERC721' ? "1" : undefined} /> {selectedAsset.type === 'ERC20' && erc20Balance !== null && ( <span style={{ fontSize: '0.9em', color: '#555' }}> (Bakiye: {formatDisplayNumber(erc20Balance, 4)}) </span> )} <button onClick={addAssetToList} disabled={isLoading || isFetchingAssets || !selectedAsset || !assetIdOrAmount}> Listeye Ekle </button> </div> )}
       <h4 style={{ marginTop: '20px' }}>Paketlenecek Varlıklar:</h4> {assetsToWrap.length === 0 ? ( <p>Henüz varlık eklenmedi.</p> ) : ( <ul style={{ listStyle: 'none', paddingLeft: 0 }}> {assetsToWrap.map((asset, index) => ( <li key={`${asset.address}-${asset.idOrAmount}-${index}`} style={{ display:'flex', alignItems: 'center', marginBottom: '5px', borderBottom: '1px dashed #eee', paddingBottom: '5px' }}> {asset.logo && <img src={asset.logo} alt={asset.symbol ?? ''} width={20} height={20} style={{ marginRight: '8px', verticalAlign: 'middle', borderRadius: '50%' }} />} <span style={{ flexGrow: 1 }}> {asset.name ?? asset.address} ({asset.symbol ?? '??'}) - {asset.isNFT ? `ID: ${asset.idOrAmount}` : ` Miktar: ${formatDisplayNumber(asset.idOrAmount, 4)}`} </span> <button onClick={() => removeAssetFromList(index)} disabled={isLoading || isFetchingAssets} style={{ marginLeft: '10px', color: 'red', border: '1px solid red', background: 'none', cursor: 'pointer', padding: '2px 5px', fontSize: '0.8em' }} title="Listeden Kaldır" > X </button> </li> ))} </ul> )}
      <div style={{ marginTop: '20px' }}> {assetsToWrap.length > 0 && ( <p style={{ fontSize: '0.9em', color: '#444', marginBottom: '5px' }}> Paketleme Ücreti: 0.001 ETH (+ Gas) </p> )} <button onClick={handleWrap} disabled={isLoading || isFetchingAssets || !signer || assetsToWrap.length === 0} > {isLoading ? 'İşlem Sürüyor... ⏳' : `Paketle (${assetsToWrap.length} Varlık)`} </button> </div>
      {message && <p style={message.type === 'error' ? errorStyle : (message.type === 'success' ? successStyle : infoStyle)}><small>{message.text}</small></p>}
    </div>
  );
}

export default WrapForm;