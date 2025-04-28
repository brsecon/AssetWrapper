// src/components/WrapForm.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAccount, useWalletClient, useConfig } from 'wagmi';
import { readContract } from '@wagmi/core';
import { ethers, BrowserProvider, JsonRpcSigner, MaxUint256, formatUnits, parseUnits } from 'ethers';
import { type WalletClient, FallbackTransport, HttpTransport } from 'viem';
import { Nft, TokenMetadataResponse, TokenBalance } from 'alchemy-sdk';
import { contractConfig } from '../constants/contractConfig';
import { base } from 'wagmi/chains';

// --- Minimal ABIs ---
const erc20AbiMinimal = [ { constant: true, inputs: [{ name: "_owner", type: "address" }, { name: "_spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], type: "function", stateMutability: "view" }, { constant: false, inputs: [{ name: "_spender", type: "address" }, { name: "_amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], type: "function", stateMutability: "nonpayable" } ] as const;
const nftAbiMinimal = [ { inputs: [{ internalType: "address", name: "owner", type: "address" }, { internalType: "address", name: "operator", type: "address" }], name: "isApprovedForAll", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" }, { inputs: [{ internalType: "address", name: "operator", type: "address" }, { internalType: "bool", name: "approved", type: "bool" }], name: "setApprovalForAll", outputs: [], stateMutability: "nonpayable", type: "function" } ] as const;

// --- Tipler ---
interface EnrichedTokenBalance extends TokenBalance { metadata?: TokenMetadataResponse | null; }
interface Asset { contractAddress: string; idOrAmount: bigint; isNFT: boolean; }
interface WrapFormProps { availableErc20s: EnrichedTokenBalance[]; availableNfts: Nft[]; isLoading: boolean; ownerAddress: string; maxAssets: number; }

// --- Yardımcı Fonksiyon: Viem WalletClient -> Ethers v6 Signer ---
export function walletClientToSigner(walletClient: WalletClient | null | undefined): JsonRpcSigner | undefined {
    if (!walletClient) return undefined;
    const { account, chain, transport } = walletClient;
    const network = { chainId: chain.id, name: chain.name, ensAddress: chain.contracts?.ensRegistry?.address };
    try { const provider = new BrowserProvider(transport, network.chainId); const signer = new JsonRpcSigner(provider, account.address); return signer; }
    catch (e) { console.error("E: walletClientToSigner", e); return undefined; }
}

const WrapForm: React.FC<WrapFormProps> = ({ availableErc20s, availableNfts, isLoading, ownerAddress, maxAssets }) => {
    // --- State Tanımlamaları ---
    const [assetsToWrap, setAssetsToWrap] = useState<Asset[]>([]);
    const [erc20Amounts, setErc20Amounts] = useState<{ [contractAddress: string]: string }>({});
    const [erc20Allowances, setErc20Allowances] = useState<{ [address: string]: bigint }>({});
    const [checkingAllowances, setCheckingAllowances] = useState(false);
    const [nftCollectionApprovals, setNftCollectionApprovals] = useState<{ [address: string]: boolean }>({});
    const [checkingNftApprovals, setCheckingNftApprovals] = useState(false);
    // Ayrı Onay State'leri
    const [erc20ApprovingAddress, setErc20ApprovingAddress] = useState<string | null>(null);
    const [isErc20Approving, setIsErc20Approving] = useState(false);
    const [erc20ApprovalTxHash, setErc20ApprovalTxHash] = useState<string | null>(null);
    const [erc20ApprovalError, setErc20ApprovalError] = useState<string | null>(null);
    const [justApprovedErc20Address, setJustApprovedErc20Address] = useState<string | null>(null);
    const [nftApprovingAddress, setNftApprovingAddress] = useState<string | null>(null);
    const [isNftApproving, setIsNftApproving] = useState(false);
    const [nftApprovalTxHash, setNftApprovalTxHash] = useState<string | null>(null);
    const [nftApprovalError, setNftApprovalError] = useState<string | null>(null);
    const [justApprovedNftAddress, setJustApprovedNftAddress] = useState<string | null>(null);
    const isAnyApprovalPending = isErc20Approving || isNftApproving;
    // --- State Sonu ---

    const config = useConfig();
    const { data: walletClient } = useWalletClient();
    const signer = useMemo(() => walletClientToSigner(walletClient), [walletClient]);

    // --- Memoized Değişkenler ---
    const uniqueErc20ContractsInWrap = useMemo(() => { const a = new Set<string>(); assetsToWrap.forEach(as => { if (!as.isNFT) a.add(as.contractAddress); }); return Array.from(a); }, [assetsToWrap]);
    const uniqueNftContractsInWrap = useMemo(() => { const a = new Set<string>(); assetsToWrap.forEach(as => { if (as.isNFT) a.add(as.contractAddress); }); return Array.from(a); }, [assetsToWrap]);
    // --- Memo Sonu ---

    // --- ERC20 Allowance Kontrol Effect'i (setTimeout yok) ---
    useEffect(() => {
        const checkAllowances = async () => {
            if (!ownerAddress || !uniqueErc20ContractsInWrap || uniqueErc20ContractsInWrap.length === 0) { setErc20Allowances({}); return; }
            setCheckingAllowances(true); const newAllowances: { [address: string]: bigint } = {};
            try {
                const allowancePromises = uniqueErc20ContractsInWrap.map(tokenAddress => readContract(config, { address: tokenAddress as `0x${string}`, abi: erc20AbiMinimal, functionName: 'allowance', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id, }));
                const results = await Promise.all(allowancePromises);
                uniqueErc20ContractsInWrap.forEach((addr, index) => { newAllowances[addr] = results[index] as bigint; });
                setErc20Allowances(newAllowances);
            } catch (error) { console.error("E: checkAllowances", error); setErc20Allowances({}); } finally { setCheckingAllowances(false); }
        };
        checkAllowances(); // Direkt çağır
    }, [uniqueErc20ContractsInWrap, ownerAddress, config]);

    // --- NFT Koleksiyon Onay Kontrol Effect'i (setTimeout yok) ---
    useEffect(() => {
        const checkNftApprovals = async () => {
            if (!ownerAddress || !uniqueNftContractsInWrap || uniqueNftContractsInWrap.length === 0) { setNftCollectionApprovals({}); return; }
            setCheckingNftApprovals(true); const newApprovals: { [address: string]: boolean } = {};
            try {
                const approvalPromises = uniqueNftContractsInWrap.map(collectionAddress => readContract(config, { address: collectionAddress as `0x${string}`, abi: nftAbiMinimal, functionName: 'isApprovedForAll', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id, }));
                const results = await Promise.all(approvalPromises);
                uniqueNftContractsInWrap.forEach((addr, index) => { newApprovals[addr] = results[index] as boolean; });
                setNftCollectionApprovals(newApprovals);
            } catch (error) { console.error("E: checkNftApprovals", error); setNftCollectionApprovals({}); } finally { setCheckingNftApprovals(false); }
        };
        checkNftApprovals(); // Direkt çağır
    }, [uniqueNftContractsInWrap, ownerAddress, config]);

    // --- Yenileme Fonksiyonları ---
    const refetchAllowance = async (tokenAddress: string) => { try { const a = await readContract(config,{address: tokenAddress as `0x${string}`, abi: erc20AbiMinimal, functionName: 'allowance', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id }); setErc20Allowances(p=>({...p,[tokenAddress]:a as bigint})); } catch(e){console.error(e);} };
    const refetchNftApproval = async (collectionAddress: string) => { try { const a = await readContract(config,{address: collectionAddress as `0x${string}`, abi: nftAbiMinimal, functionName: 'isApprovedForAll', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id }); setNftCollectionApprovals(p=>({...p,[collectionAddress]:a as boolean})); } catch(e){console.error(e);} };

    // --- ERC20 Approve Handler'ı (Ethers.js - Tam Hali) ---
    const handleApproveClick = async (tokenAddress: string) => {
        if (!signer || isAnyApprovalPending) return;
        setErc20ApprovingAddress(tokenAddress); setIsErc20Approving(true); setErc20ApprovalError(null); setErc20ApprovalTxHash(null); setJustApprovedErc20Address(null); setJustApprovedNftAddress(null);
        try {
            const tokenContract = new ethers.Contract(tokenAddress, erc20AbiMinimal, signer);
            const txResponse = await tokenContract.approve(contractConfig.vault.address, MaxUint256);
            setErc20ApprovalTxHash(txResponse.hash); await txResponse.wait();
            await refetchAllowance(tokenAddress); setJustApprovedErc20Address(tokenAddress); setErc20ApprovalError(null);
        } catch (error: any) {
             console.error(`ERC20 Approve failed for ${tokenAddress}:`, error);
             const reason = error.reason || error.data?.message || error.message || "Bilinmeyen hata.";
             setErc20ApprovalError(`Onay başarısız: ${reason}`); alert(`ERC20 Onay hatası: ${reason}`); setJustApprovedErc20Address(null);
        } finally { setIsErc20Approving(false); setErc20ApprovingAddress(null); }
    };

    // --- NFT Koleksiyon Onaylama Handler'ı (Ethers.js - Tam Hali) ---
    const handleApproveNftCollection = async (collectionAddress: string) => {
        if (!signer || isAnyApprovalPending) return;
        setNftApprovingAddress(collectionAddress); setIsNftApproving(true); setNftApprovalError(null); setNftApprovalTxHash(null); setJustApprovedNftAddress(null); setJustApprovedErc20Address(null);
        try {
            const nftContract = new ethers.Contract(collectionAddress, nftAbiMinimal, signer);
            const txResponse = await nftContract.setApprovalForAll(contractConfig.vault.address, true);
            setNftApprovalTxHash(txResponse.hash); await txResponse.wait();
            await refetchNftApproval(collectionAddress); setJustApprovedNftAddress(collectionAddress); setNftApprovalError(null);
        } catch (error: any) {
            console.error(`setApprovalForAll failed for ${collectionAddress}:`, error);
            const reason = error.reason || error.data?.message || error.message || "Bilinmeyen hata.";
            setNftApprovalError(`Koleksiyon onayı başarısız: ${reason}`); alert(`NFT Koleksiyon Onay hatası: ${reason}`); setJustApprovedNftAddress(null);
        } finally { setIsNftApproving(false); setNftApprovingAddress(null); }
    };

    // --- Diğer Fonksiyonlar (Tam Tanımları) ---
    const handleAmountChange = (address: string, amount: string) => { const cleanedAmount = amount.replace(/[^0-9.,]/g, ''); setErc20Amounts(prev => ({ ...prev, [address]: cleanedAmount })); };
    const addErc20ToWrap = (token: EnrichedTokenBalance) => { if (!token.contractAddress) return; const amountString = erc20Amounts[token.contractAddress] || ''; const decimals = token.metadata?.decimals ?? 18; if (assetsToWrap.length >= maxAssets) { alert(`Max ${maxAssets} varlık.`); return; } try { const amountBigInt = parseUnits(amountString.replace(',', '.'), decimals); if (amountBigInt <= 0n) { alert("Geçerli miktar girin."); return; } if (token.tokenBalance && amountBigInt > BigInt(token.tokenBalance)) { alert("Yetersiz bakiye!"); return; } const newAsset: Asset = { contractAddress: token.contractAddress, idOrAmount: amountBigInt, isNFT: false }; setAssetsToWrap(prev => [...prev, newAsset]); } catch (e) { alert("Geçersiz miktar formatı."); console.error("Parsing amount error:", e); } };
    const addNftToWrap = (nft: Nft) => { if (assetsToWrap.length >= maxAssets) { alert(`Max ${maxAssets} varlık.`); return; } if (assetsToWrap.some(a => a.isNFT && a.contractAddress.toLowerCase() === nft.contract.address.toLowerCase() && a.idOrAmount === BigInt(nft.tokenId))) { alert("Bu NFT zaten pakette."); return; } const newAsset: Asset = { contractAddress: nft.contract.address, idOrAmount: BigInt(nft.tokenId), isNFT: true }; setAssetsToWrap(prev => [...prev, newAsset]); };
    const removeFromWrap = (index: number) => { setAssetsToWrap(prev => prev.filter((_, i) => i !== index)); };
    const handleWrap = () => { console.log("Paketlenecek Varlıklar:", assetsToWrap); alert("Wrap fonksiyonu henüz tam olarak eklenmedi."); /* TODO: Wrap Logic */};
    // --- Fonksiyonlar Sonu ---

    // --- Tüm Onaylar Tamam Mı Kontrolü ---
    const areAllApprovalsDone = useMemo(() => { if (assetsToWrap.length === 0) return false; return assetsToWrap.every(asset => { if (asset.isNFT) { return nftCollectionApprovals[asset.contractAddress] === true; } else { const required = asset.idOrAmount; const allowed = erc20Allowances[asset.contractAddress] ?? 0n; return allowed >= required; } }); }, [assetsToWrap, erc20Allowances, nftCollectionApprovals]);

    // --- Render ---
    if (isLoading) { return <p>Varlıklarınız yükleniyor...</p>; } // App.tsx'ten gelen prop

    return (
        <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>

            {/* Bölüm 1: Seçilecek Varlıklar (Tam JSX ile) */}
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                 {/* ERC20 Seçimi */}
                 <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                     <h4>Pakete Eklenecek ERC20'ler</h4>
                     {availableErc20s.length > 0 ? ( availableErc20s.map(token => { if (!token.contractAddress) return null; const address = token.contractAddress; const symbol = token.metadata?.symbol ?? '???'; const logo = token.metadata?.logo; const name = token.metadata?.name ?? address; return ( <div key={address} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}> <input type="text" placeholder="Miktar" value={erc20Amounts[address] || ''} onChange={(e) => handleAmountChange(address, e.target.value)} style={{ width: '80px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' }} /> <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} title={name}> {logo && <img src={logo} alt={symbol} style={{ width: '18px', height: '18px', borderRadius: '50%' }} onError={(e) => (e.currentTarget.style.display = 'none')} />} {!logo && <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eee' }}></div>} {symbol} </span> <button onClick={() => addErc20ToWrap(token)} disabled={!erc20Amounts[address] || parseFloat(erc20Amounts[address].replace(',','.')) <= 0} style={{ padding: '2px 6px', marginLeft: 'auto', cursor: 'pointer' }} > + Ekle </button> </div> ); }) ) : <p>Paketlenecek ERC20 bulunamadı.</p>}
                 </div>
                 {/* NFT Seçimi */}
                 <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                    <h4>Pakete Eklenecek NFT'ler</h4>
                      {availableNfts.length > 0 ? ( availableNfts.map(nft => { const imageUrl = (nft.media && nft.media.length > 0) ? (nft.media[0]?.thumbnail || nft.media[0]?.gateway) : null; return ( <div key={`${nft.contract.address}-${nft.tokenId}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}> <button onClick={() => addNftToWrap(nft)} disabled={assetsToWrap.some(a => a.isNFT && a.contractAddress.toLowerCase() === nft.contract.address.toLowerCase() && a.idOrAmount === BigInt(nft.tokenId))} style={{ padding: '2px 6px', cursor: 'pointer' }} > + Ekle </button> {imageUrl ? ( <img src={imageUrl} alt={nft.name || `#${nft.tokenId}`} style={{width: '24px', height: '24px', borderRadius: '3px', objectFit: 'cover', background: '#eee'}} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> ) : ( <div style={{width: '24px', height: '24px', borderRadius: '3px', background: '#eee', display: 'inline-block'}}></div> )} <span title={`${nft.contract.name} (${nft.contract.symbol}) - ${nft.contract.address}`}> {nft.name || `#${nft.tokenId}`} <code style={{fontSize: '0.8em', marginLeft: '4px'}}>({nft.contract.symbol || nft.contract.address.substring(0, 4)})</code> </span> </div> ); }) ) : <p>Paketlenecek (Wrapper olmayan) NFT bulunamadı.</p>}
                 </div>
            </div>


            {/* Bölüm 2: Oluşturulan Paket (Tam JSX ile) */}
            <div style={{ border: '1px solid #007bff', padding: '15px', borderRadius: '5px', background: '#f0f8ff' }}>
                <h4>Oluşturulan Paket ({assetsToWrap.length}/{maxAssets})</h4>
                {(checkingAllowances || checkingNftApprovals) && <p><small>Onaylar kontrol ediliyor...</small></p>}
                {assetsToWrap.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {assetsToWrap.map((asset, index) => {
                            // Onay Kontrolü ve Buton Mantığı (Ayrı State'ler ile)
                            let displayInfo = ''; let needsApproval = false; let symbol = ''; let isApprovedSufficiently = false;
                            let isThisAssetApproving = false; let currentApprovalError: string | null = null; let wasJustApproved = false; let approvalTxHashToShow: string | null = null;

                            if (asset.isNFT) { const nftMeta = availableNfts.find(n => n.contract.address.toLowerCase() === asset.contractAddress.toLowerCase() && n.tokenId === asset.idOrAmount.toString()); symbol = nftMeta?.contract.symbol ?? 'NFT'; displayInfo = `NFT - ${symbol} - ID: ${asset.idOrAmount}`; needsApproval = nftCollectionApprovals[asset.contractAddress] !== true; isApprovedSufficiently = !needsApproval; isThisAssetApproving = isNftApproving && nftApprovingAddress === asset.contractAddress; currentApprovalError = (nftApprovalError && nftApprovingAddress === asset.contractAddress) ? nftApprovalError : null; wasJustApproved = justApprovedNftAddress === asset.contractAddress; approvalTxHashToShow = isThisAssetApproving ? nftApprovalTxHash : null; }
                            else { const requiredAmount = asset.idOrAmount; const currentAllowance = erc20Allowances[asset.contractAddress] ?? 0n; needsApproval = currentAllowance < requiredAmount; isApprovedSufficiently = !needsApproval && currentAllowance >= requiredAmount; const tokenMeta = availableErc20s.find(t => t.contractAddress === asset.contractAddress); symbol = tokenMeta?.metadata?.symbol ?? 'Token'; const decimals = tokenMeta?.metadata?.decimals ?? 18; let formattedAmount = `(Ham: ${requiredAmount.toString()})`; try { formattedAmount = formatUnits(requiredAmount, decimals); } catch {} displayInfo = `ERC20 - ${symbol} - Miktar: ${formattedAmount}`; isThisAssetApproving = isErc20Approving && erc20ApprovingAddress === asset.contractAddress; currentApprovalError = (erc20ApprovalError && erc20ApprovingAddress === asset.contractAddress) ? erc20ApprovalError : null; wasJustApproved = justApprovedErc20Address === asset.contractAddress; approvalTxHashToShow = isThisAssetApproving ? erc20ApprovalTxHash : null; }

                            return (
                                <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '0.9em', borderBottom: '1px dashed #ccc', paddingBottom: '5px' }}>
                                    <span>{displayInfo}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {needsApproval && !wasJustApproved && ( <button onClick={() => asset.isNFT ? handleApproveNftCollection(asset.contractAddress) : handleApproveClick(asset.contractAddress)} disabled={isAnyApprovalPending} style={{ background: '#ffc107', border: 'none', borderRadius: '3px', padding: '2px 5px', fontSize: '0.8em', cursor: 'pointer' }} > {isThisAssetApproving ? 'Onaylanıyor...' : `Onayla ${asset.isNFT ? 'Koleksiyon' : symbol}`} </button> )}
                                        {isThisAssetApproving && approvalTxHashToShow && <span style={{ fontSize: '0.8em' }}>(Tx: {approvalTxHashToShow.substring(0, 6)}...)</span>}
                                        {currentApprovalError && <span style={{ color: 'red', fontSize: '0.8em' }}>Hata!</span>}
                                        {wasJustApproved && <span style={{ color: 'green', fontSize: '0.8em' }}>✓ Onaylandı</span>}
                                        {isApprovedSufficiently && !wasJustApproved && <span style={{ color: 'green', fontSize: '0.8em' }}>✓ Onaylı</span>}
                                        <button onClick={() => removeFromWrap(index)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', marginLeft: '5px', fontWeight:'bold' }}>X</button>
                                    </div>
                                </li> );
                        })}
                    </ul>
                ) : <p>Paketlemek için yukarıdan varlık ekleyin.</p>}
                 {/* Genel Hatalar */}
                 {erc20ApprovalError && !erc20ApprovingAddress && <p style={{color: 'red', fontSize: '0.8em'}}>Son ERC20 Onay Hatası: {erc20ApprovalError}</p>}
                 {nftApprovalError && !nftApprovingAddress && <p style={{color: 'red', fontSize: '0.8em'}}>Son NFT Onay Hatası: {nftApprovalError}</p>}
            </div>

            {/* Bölüm 3: Wrap Butonu */}
            <button onClick={handleWrap} disabled={assetsToWrap.length === 0 || !areAllApprovalsDone || isAnyApprovalPending} style={{ padding: '10px 15px', background: (!areAllApprovalsDone || assetsToWrap.length === 0 || isAnyApprovalPending) ? '#ccc' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: (!areAllApprovalsDone || assetsToWrap.length === 0 || isAnyApprovalPending) ? 'not-allowed' : 'pointer', fontSize: '1em', marginTop: '10px' }} >
                {isAnyApprovalPending ? 'Onay İşlemi Sürüyor...' : (assetsToWrap.length > 0 && !areAllApprovalsDone ? 'Önce Tüm Varlıkları Onaylayın' : 'Paketi Oluştur (Wrap)')}
            </button>
        </div>
    );
};

export default WrapForm;