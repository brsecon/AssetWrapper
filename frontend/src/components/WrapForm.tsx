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
interface WrapFormProps {
    availableErc20s: EnrichedTokenBalance[];
    availableNfts: Nft[];
    isLoading: boolean; // Varlıkları yükleme durumu (App.tsx'den)
    ownerAddress: string;
    maxAssets: number;
    wrapperFee: bigint | undefined; // Wrapper ücreti (bigint veya undefined)
    onWrapSuccess: () => void; // Başarılı wrap sonrası çağrılacak fonksiyon
    isFeeLoading: boolean; // Ücret yüklenme durumu
}

// --- Yardımcı Fonksiyon: Viem WalletClient -> Ethers v6 Signer ---
export function walletClientToSigner(walletClient: WalletClient | null | undefined): JsonRpcSigner | undefined {
    if (!walletClient) return undefined;
    const { account, chain, transport } = walletClient;
    const network = { chainId: chain.id, name: chain.name, ensAddress: chain.contracts?.ensRegistry?.address };
    try { const provider = new BrowserProvider(transport, network.chainId); const signer = new JsonRpcSigner(provider, account.address); return signer; }
    catch (e) { console.error("E: walletClientToSigner", e); return undefined; }
}

const WrapForm: React.FC<WrapFormProps> = ({
    availableErc20s,
    availableNfts,
    isLoading, // Varlık yükleme durumu
    ownerAddress,
    maxAssets,
    wrapperFee, // Wrapper ücreti prop'u
    onWrapSuccess, // Callback prop'u
    isFeeLoading, // Fee yüklenme durumu
}) => {
    // --- State Tanımlamaları ---
    const [assetsToWrap, setAssetsToWrap] = useState<Asset[]>([]);
    const [erc20Amounts, setErc20Amounts] = useState<{ [contractAddress: string]: string }>({});
    const [erc20Allowances, setErc20Allowances] = useState<{ [address: string]: bigint }>({});
    const [checkingAllowances, setCheckingAllowances] = useState(false);
    const [nftCollectionApprovals, setNftCollectionApprovals] = useState<{ [address: string]: boolean }>({});
    const [checkingNftApprovals, setCheckingNftApprovals] = useState(false);
    // Onay State'leri
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
    // Wrap İşlemi State'leri
    const [isWrapping, setIsWrapping] = useState(false);
    const [wrapTxHash, setWrapTxHash] = useState<string | null>(null);
    const [wrapError, setWrapError] = useState<string | null>(null);
    // --- State Sonu ---

    const config = useConfig();
    const { data: walletClient } = useWalletClient();
    const signer = useMemo(() => walletClientToSigner(walletClient), [walletClient]);

    // --- Memoized Değişkenler ---
    const uniqueErc20ContractsInWrap = useMemo(() => { const a = new Set<string>(); assetsToWrap.forEach(as => { if (!as.isNFT) a.add(as.contractAddress); }); return Array.from(a); }, [assetsToWrap]);
    const uniqueNftContractsInWrap = useMemo(() => { const a = new Set<string>(); assetsToWrap.forEach(as => { if (as.isNFT) a.add(as.contractAddress); }); return Array.from(a); }, [assetsToWrap]);
    // --- Memo Sonu ---

    // --- Effect'ler (Allowance ve NFT Approval kontrolü) ---
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
         checkAllowances();
    }, [uniqueErc20ContractsInWrap, ownerAddress, config]);

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
         checkNftApprovals();
    }, [uniqueNftContractsInWrap, ownerAddress, config]);

    // --- Yenileme Fonksiyonları ---
    const refetchAllowance = async (tokenAddress: string) => { try { const a = await readContract(config,{address: tokenAddress as `0x${string}`, abi: erc20AbiMinimal, functionName: 'allowance', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id }); setErc20Allowances(p=>({...p,[tokenAddress]:a as bigint})); } catch(e){console.error(e);} };
    const refetchNftApproval = async (collectionAddress: string) => { try { const a = await readContract(config,{address: collectionAddress as `0x${string}`, abi: nftAbiMinimal, functionName: 'isApprovedForAll', args: [ownerAddress as `0x${string}`, contractConfig.vault.address as `0x${string}`], chainId: base.id }); setNftCollectionApprovals(p=>({...p,[collectionAddress]:a as boolean})); } catch(e){console.error(e);} };

    // --- ERC20 Approve Handler ---
     const handleApproveClick = async (tokenAddress: string) => {
         if (!signer || isAnyApprovalPending || isWrapping) return;
         setErc20ApprovingAddress(tokenAddress); setIsErc20Approving(true); setErc20ApprovalError(null); setErc20ApprovalTxHash(null); setJustApprovedErc20Address(null); setJustApprovedNftAddress(null); setWrapError(null);
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

    // --- NFT Koleksiyon Onaylama Handler ---
     const handleApproveNftCollection = async (collectionAddress: string) => {
         if (!signer || isAnyApprovalPending || isWrapping) return;
         setNftApprovingAddress(collectionAddress); setIsNftApproving(true); setNftApprovalError(null); setNftApprovalTxHash(null); setJustApprovedNftAddress(null); setJustApprovedErc20Address(null); setWrapError(null);
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

    // --- Varlık Ekleme/Çıkarma Fonksiyonları ---
    const handleAmountChange = (address: string, amount: string) => { const cleanedAmount = amount.replace(/[^0-9.,]/g, ''); setErc20Amounts(prev => ({ ...prev, [address]: cleanedAmount })); };
    const addErc20ToWrap = (token: EnrichedTokenBalance) => { if (!token.contractAddress) return; const amountString = erc20Amounts[token.contractAddress] || ''; const decimals = token.metadata?.decimals ?? 18; if (assetsToWrap.length >= maxAssets) { alert(`Maksimum ${maxAssets} varlık ekleyebilirsiniz.`); return; } try { const amountBigInt = parseUnits(amountString.replace(',', '.'), decimals); if (amountBigInt <= 0n) { alert("Lütfen geçerli bir miktar girin (0'dan büyük)."); return; } if (token.tokenBalance && amountBigInt > BigInt(token.tokenBalance)) { alert("Yetersiz bakiye!"); return; } const newAsset: Asset = { contractAddress: token.contractAddress, idOrAmount: amountBigInt, isNFT: false }; setAssetsToWrap(prev => [...prev, newAsset]); setWrapError(null); setWrapTxHash(null); } catch (e) { alert("Geçersiz miktar formatı."); console.error("Parsing amount error:", e); } };
    const addNftToWrap = (nft: Nft) => { if (assetsToWrap.length >= maxAssets) { alert(`Maksimum ${maxAssets} varlık ekleyebilirsiniz.`); return; } if (assetsToWrap.some(a => a.isNFT && a.contractAddress.toLowerCase() === nft.contract.address.toLowerCase() && a.idOrAmount === BigInt(nft.tokenId))) { alert("Bu NFT zaten pakete eklenmiş."); return; } const newAsset: Asset = { contractAddress: nft.contract.address, idOrAmount: BigInt(nft.tokenId), isNFT: true }; setAssetsToWrap(prev => [...prev, newAsset]); setWrapError(null); setWrapTxHash(null);};
    const removeFromWrap = (index: number) => { setAssetsToWrap(prev => prev.filter((_, i) => i !== index)); setWrapError(null); setWrapTxHash(null); };
    // --- Fonksiyonlar Sonu ---

    // --- Wrap İşlemi ---
    const handleWrap = async () => {
        // Gerekli kontroller
        if (!signer) { alert("Lütfen cüzdanınızı bağlayın."); return; }
        if (isWrapping) { return; }
        if (isAnyApprovalPending) { alert("Devam eden bir onay işlemi var. Lütfen bekleyin."); return; }
        if (assetsToWrap.length === 0) { alert("Paketlemek için en az bir varlık eklemelisiniz."); return; }
        if (!areAllApprovalsDone) { alert("Lütfen paketlemeden önce tüm varlıklar için gerekli onayları verin."); return; }
        if (isFeeLoading) { alert("Wrapper ücreti yükleniyor, lütfen bekleyin."); return; }
        if (wrapperFee === undefined) { alert("Wrapper ücreti alınamadı. Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin."); return; }

        // State'i ayarla
        setIsWrapping(true);
        setWrapTxHash(null);
        setWrapError(null);
        setErc20ApprovalError(null);
        setNftApprovalError(null);
        setJustApprovedErc20Address(null);
        setJustApprovedNftAddress(null);

        // --- Hata Ayıklama Logları ---
        console.log("Checking approvals just before wrap:");
        assetsToWrap.forEach(asset => {
            if (asset.isNFT) {
                // NFT onayı Vault adresi (`contractConfig.vault.address`) için olmalı
                console.log(`NFT: ${asset.contractAddress} - ID: ${asset.idOrAmount} - ApprovedForAll for Vault (${contractConfig.vault.address}): ${nftCollectionApprovals[asset.contractAddress]}`);
            } else {
                // ERC20 onayı Vault adresi (`contractConfig.vault.address`) için olmalı
                const allowance = erc20Allowances[asset.contractAddress];
                console.log(`ERC20: ${asset.contractAddress} - Amount: ${asset.idOrAmount} - Allowance for Vault (${contractConfig.vault.address}): ${allowance !== undefined ? allowance.toString() : 'undefined'}`);
            }
        });
        console.log("Using fee:", wrapperFee?.toString());
        // --- Log Sonu ---


        try {
            console.log("Wrapping assets:", assetsToWrap);

            const nftContract = new ethers.Contract(
                contractConfig.nft.address,
                contractConfig.nft.abi,
                signer
            );

            const txOptions = { value: wrapperFee };
            // --- İşlemi Gönderme ---
            const txResponse = await nftContract.wrapAssets(assetsToWrap, txOptions);

            console.log("Wrap transaction submitted:", txResponse.hash);
            setWrapTxHash(txResponse.hash);

            await txResponse.wait();

            console.log("Wrap transaction confirmed:", txResponse.hash);
            alert(`Paketleme işlemi başarılı! İşlem Hash: ${txResponse.hash}`);

            setAssetsToWrap([]);
            setErc20Amounts({});
            setWrapError(null);
            onWrapSuccess();

        } catch (error: any) {
            console.error("Wrap transaction failed:", error); // Detaylı hatayı konsola yazdır
            let reason = "Bilinmeyen bir hata oluştu.";
            // Ethers v6 hata ayrıştırması
            if (error.code === 'ACTION_REJECTED') {
                reason = "İşlem cüzdan tarafından reddedildi.";
            } else if (error.code === 'CALL_EXCEPTION') {
                 if (error.reason) {
                     reason = error.reason; // Kontrattan dönen reason string (varsa)
                 } else if (error.data?.message) { // Bazı RPC'lerin sağladığı hata mesajı
                     reason = error.data.message;
                 } else if (error.revert?.args?.length > 0) { // Standard Solidity revert mesajını yakala
                    reason = error.revert.args[0];
                 } else {
                     // Hata mesajı yoksa, işlem verisini ekleyerek daha fazla ipucu verelim
                     reason = `Kontrat çağrısı başarısız oldu (revert). Detaylı bilgi yok. Tx Data: ${error.transaction?.data?.substring(0, 100)}...`;
                     console.log("Revert Error Details:", error); // Tüm hata objesini logla
                 }
            } else if (error.code === 'INSUFFICIENT_FUNDS') {
                 reason = "İşlem ücreti (gas) veya wrapper ücreti için yetersiz ETH bakiyesi.";
            } else if (error.message) { // Genel JavaScript hatası
                reason = error.message;
            }

            // Bilinen kontrat hatalarını daha okunabilir yap
            if (reason.includes("IncorrectFee")) {
                reason = "Gönderilen wrapper ücreti doğru değil. Sayfayı yenileyip tekrar deneyin.";
            } else if (reason.includes("AssetLockFailed")) {
                reason = "Varlıkların Vault kontratına kilitlenmesinde hata oluştu. Varlık onaylarını veya bakiyelerini kontrol edin.";
            } else if (reason.includes("MaxAssetsExceeded")) {
                 reason = `Maksimum varlık sayısı (${maxAssets}) aşıldı.`;
            } else if (reason.includes("NftAlreadyLocked")) {
                 reason = "Paketlenmeye çalışılan NFT zaten başka bir wrapper içinde kilitli.";
            } else if (reason.includes("SafeERC20FailedOperation")) { // Vault'tan gelebilir
                 reason = "ERC20 transferi başarısız oldu. Token kontratını veya bakiyenizi kontrol edin.";
            }

            setWrapError(`Paketleme işlemi başarısız oldu: ${reason}`);
            alert(`Paketleme Hatası: ${reason}`);
            setWrapTxHash(null);

        } finally {
            setIsWrapping(false);
        }
    };
    // --- Wrap İşlemi Sonu ---


    // --- Tüm Onaylar Tamam Mı Kontrolü ---
    const areAllApprovalsDone = useMemo(() => {
        if (assetsToWrap.length === 0) return false;
        return assetsToWrap.every(asset => {
            if (asset.isNFT) {
                return nftCollectionApprovals[asset.contractAddress] === true;
            } else {
                const required = asset.idOrAmount;
                const allowed = erc20Allowances[asset.contractAddress] ?? 0n;
                return allowed >= required;
            }
        });
    }, [assetsToWrap, erc20Allowances, nftCollectionApprovals]);

    // --- Render ---
    if (isLoading && assetsToWrap.length === 0 && Object.keys(availableErc20s).length === 0 && availableNfts.length === 0) {
        return <p>Varlıklarınız yükleniyor...</p>;
    }

    const baseExplorerUrl = "https://basescan.org";

    return (
        <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>

            {/* Bölüm 1: Seçilecek Varlıklar */}
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                 {/* ERC20 Seçimi */}
                 <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto', opacity: isWrapping ? 0.6 : 1, pointerEvents: isWrapping ? 'none' : 'auto' }}>
                     <h4>Pakete Eklenecek ERC20'ler {isLoading && '(Yükleniyor...)'}</h4>
                     {availableErc20s.length > 0 ? ( availableErc20s.map(token => {
                         if (!token.contractAddress) return null;
                         const address = token.contractAddress;
                         const symbol = token.metadata?.symbol ?? '???';
                         const logo = token.metadata?.logo;
                         const name = token.metadata?.name ?? address;
                         const isAmountValid = erc20Amounts[address] && parseFloat(erc20Amounts[address].replace(',', '.')) > 0;
                         const canAdd = isAmountValid && assetsToWrap.length < maxAssets;

                         return (
                           <div key={address} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}>
                             <input
                               type="text"
                               placeholder="Miktar"
                               value={erc20Amounts[address] || ''}
                               onChange={(e) => handleAmountChange(address, e.target.value)}
                               style={{ width: '80px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' }}
                               disabled={isWrapping}
                             />
                             <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} title={name}>
                               {logo && <img src={logo} alt={symbol} style={{ width: '18px', height: '18px', borderRadius: '50%' }} onError={(e) => (e.currentTarget.style.display = 'none')} />}
                               {!logo && <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eee' }}></div>}
                               {symbol}
                             </span>
                             <button
                               onClick={() => addErc20ToWrap(token)}
                               disabled={!canAdd || isWrapping}
                               style={{ padding: '2px 6px', marginLeft: 'auto', cursor: (!canAdd || isWrapping) ? 'not-allowed' : 'pointer' }}
                             >
                               + Ekle
                             </button>
                           </div>
                         );
                       })
                     ) : (isLoading ? <p>...</p> : <p>Paketlenecek ERC20 bulunamadı.</p>) }
                 </div>
                 {/* NFT Seçimi */}
                 <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto', opacity: isWrapping ? 0.6 : 1, pointerEvents: isWrapping ? 'none' : 'auto' }}>
                    <h4>Pakete Eklenecek NFT'ler {isLoading && '(Yükleniyor...)'}</h4>
                      {availableNfts.length > 0 ? ( availableNfts.map(nft => {
                           const imageUrl = (nft.media && nft.media.length > 0) ? (nft.media[0]?.thumbnail || nft.media[0]?.gateway) : null;
                           const isAlreadyAdded = assetsToWrap.some(a => a.isNFT && a.contractAddress.toLowerCase() === nft.contract.address.toLowerCase() && a.idOrAmount === BigInt(nft.tokenId));
                           const canAdd = !isAlreadyAdded && assetsToWrap.length < maxAssets;
                           return (
                             <div key={`${nft.contract.address}-${nft.tokenId}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}>
                               <button
                                 onClick={() => addNftToWrap(nft)}
                                 disabled={!canAdd || isWrapping}
                                 style={{ padding: '2px 6px', cursor: (!canAdd || isWrapping) ? 'not-allowed' : 'pointer' }}
                               >
                                 + Ekle
                               </button>
                               {imageUrl ? ( <img src={imageUrl} alt={nft.name || `#${nft.tokenId}`} style={{width: '24px', height: '24px', borderRadius: '3px', objectFit: 'cover', background: '#eee'}} onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; /* Simple placeholder */ }} /> ) : ( <div style={{width: '24px', height: '24px', borderRadius: '3px', background: '#eee', display: 'inline-block', textAlign: 'center', lineHeight: '24px', fontSize: '0.7em'}}>NFT</div> )}
                               <span title={`${nft.contract.name || 'Kontrat Adı Yok'} (${nft.contract.symbol || 'Sembol Yok'}) - ${nft.contract.address}`}>
                                 {nft.name || `#${nft.tokenId}`}
                                 <code style={{fontSize: '0.8em', marginLeft: '4px'}}>({nft.contract.symbol || nft.contract.address.substring(0, 4)})</code>
                               </span>
                             </div>
                           );
                         })
                       ) : (isLoading ? <p>...</p> : <p>Paketlenecek (Wrapper veya Spam olmayan) NFT bulunamadı.</p>) }
                 </div>
            </div>


            {/* Bölüm 2: Oluşturulan Paket */}
            <div style={{ border: '1px solid #007bff', padding: '15px', borderRadius: '5px', background: '#f0f8ff', opacity: isWrapping ? 0.6 : 1 }}>
                <h4>Oluşturulan Paket ({assetsToWrap.length}/{maxAssets})</h4>
                {(checkingAllowances || checkingNftApprovals) && !isWrapping && <p><small>Onaylar kontrol ediliyor...</small></p>}
                {assetsToWrap.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {assetsToWrap.map((asset, index) => {
                            let displayInfo = ''; let needsApproval = false; let symbol = ''; let isApprovedSufficiently = false;
                            let isThisAssetApproving = false; let currentApprovalError: string | null = null; let wasJustApproved = false; let approvalTxHashToShow: string | null = null;

                             if (asset.isNFT) { const nftMeta = availableNfts.find(n => n.contract.address.toLowerCase() === asset.contractAddress.toLowerCase() && n.tokenId === asset.idOrAmount.toString()); symbol = nftMeta?.contract.symbol ?? 'NFT'; displayInfo = `NFT - ${symbol} - ID: ${asset.idOrAmount}`; needsApproval = nftCollectionApprovals[asset.contractAddress] !== true; isApprovedSufficiently = !needsApproval; isThisAssetApproving = isNftApproving && nftApprovingAddress === asset.contractAddress; currentApprovalError = (nftApprovalError && nftApprovingAddress === asset.contractAddress) ? nftApprovalError : null; wasJustApproved = justApprovedNftAddress === asset.contractAddress; approvalTxHashToShow = isThisAssetApproving ? nftApprovalTxHash : null; }
                             else { const requiredAmount = asset.idOrAmount; const currentAllowance = erc20Allowances[asset.contractAddress] ?? 0n; needsApproval = currentAllowance < requiredAmount; isApprovedSufficiently = !needsApproval && currentAllowance >= requiredAmount; const tokenMeta = availableErc20s.find(t => t.contractAddress === asset.contractAddress); symbol = tokenMeta?.metadata?.symbol ?? 'Token'; const decimals = tokenMeta?.metadata?.decimals ?? 18; let formattedAmount = `(Ham: ${requiredAmount.toString()})`; try { formattedAmount = formatUnits(requiredAmount, decimals); const amountNum = parseFloat(formattedAmount); if(amountNum < 0.000001 && amountNum > 0) formattedAmount = "< 0.000001"; else formattedAmount = amountNum.toLocaleString(undefined, {maximumFractionDigits: 6}); } catch {} displayInfo = `ERC20 - ${symbol} - Miktar: ${formattedAmount}`; isThisAssetApproving = isErc20Approving && erc20ApprovingAddress === asset.contractAddress; currentApprovalError = (erc20ApprovalError && erc20ApprovingAddress === asset.contractAddress) ? erc20ApprovalError : null; wasJustApproved = justApprovedErc20Address === asset.contractAddress; approvalTxHashToShow = isThisAssetApproving ? erc20ApprovalTxHash : null; }

                            return (
                                <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '0.9em', borderBottom: '1px dashed #ccc', paddingBottom: '5px' }}>
                                    <span style={{ overflowWrap: 'break-word', maxWidth: '60%' }}>{displayInfo}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                        {needsApproval && !wasJustApproved && (
                                            <button
                                                onClick={() => asset.isNFT ? handleApproveNftCollection(asset.contractAddress) : handleApproveClick(asset.contractAddress)}
                                                disabled={isAnyApprovalPending || isWrapping}
                                                style={{ background: '#ffc107', border: 'none', borderRadius: '3px', padding: '2px 5px', fontSize: '0.8em', cursor: (isAnyApprovalPending || isWrapping) ? 'not-allowed' : 'pointer' }}
                                            >
                                                {isThisAssetApproving ? 'Onaylanıyor...' : `Onayla ${asset.isNFT ? 'Koleksiyon' : symbol}`}
                                            </button>
                                        )}
                                        {isThisAssetApproving && approvalTxHashToShow &&
                                            <a href={`${baseExplorerUrl}/tx/${approvalTxHashToShow}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8em' }}>
                                                (Tx: {approvalTxHashToShow.substring(0, 6)}...)
                                            </a>
                                        }
                                        {currentApprovalError && <span style={{ color: 'red', fontSize: '0.8em', marginLeft: '5px' }} title={currentApprovalError}>Hata!</span>}
                                        {wasJustApproved && <span style={{ color: 'green', fontSize: '0.8em', marginLeft: '5px' }}>✓ Onaylandı</span>}
                                        {isApprovedSufficiently && !wasJustApproved && <span style={{ color: 'green', fontSize: '0.8em', marginLeft: '5px' }}>✓ Onaylı</span>}
                                        <button
                                            onClick={() => removeFromWrap(index)}
                                            disabled={isWrapping}
                                            style={{ color: 'red', background: 'none', border: 'none', cursor: isWrapping ? 'not-allowed' : 'pointer', padding: '0 5px', marginLeft: '5px', fontWeight:'bold' }}
                                        >
                                            X
                                        </button>
                                    </div>
                                </li> );
                        })}
                    </ul>
                ) : <p>Paketlemek için yukarıdan varlık ekleyin.</p>}
                 {!wrapError && erc20ApprovalError && !erc20ApprovingAddress && <p style={{color: 'red', fontSize: '0.8em', marginTop: '5px'}}>Son ERC20 Onay Hatası: {erc20ApprovalError}</p>}
                 {!wrapError && nftApprovalError && !nftApprovingAddress && <p style={{color: 'red', fontSize: '0.8em', marginTop: '5px'}}>Son NFT Onay Hatası: {nftApprovalError}</p>}
            </div>

            {/* Bölüm 3: Wrap Butonu ve Durum Mesajları */}
            <div style={{marginTop: '15px'}}>
                 <button
                     onClick={handleWrap}
                     disabled={assetsToWrap.length === 0 || !areAllApprovalsDone || isAnyApprovalPending || isWrapping || wrapperFee === undefined || isFeeLoading}
                     style={{
                         padding: '10px 15px',
                         background: (!areAllApprovalsDone || assetsToWrap.length === 0 || isAnyApprovalPending || isWrapping || wrapperFee === undefined || isFeeLoading) ? '#ccc' : '#28a745',
                         color: 'white',
                         border: 'none',
                         borderRadius: '5px',
                         cursor: (!areAllApprovalsDone || assetsToWrap.length === 0 || isAnyApprovalPending || isWrapping || wrapperFee === undefined || isFeeLoading) ? 'not-allowed' : 'pointer',
                         fontSize: '1em',
                         width: '100%',
                     }}
                 >
                     {isWrapping ? 'Paketleniyor...' :
                      isAnyApprovalPending ? 'Onay İşlemi Sürüyor...' :
                      isFeeLoading ? 'Ücret Yükleniyor...' :
                      wrapperFee === undefined && !isFeeLoading ? 'Hata: Ücret Alınamadı' :
                      assetsToWrap.length === 0 ? 'Paketlenecek Varlık Seçin' :
                      !areAllApprovalsDone ? 'Önce Tüm Varlıkları Onaylayın' :
                      'Paketi Oluştur (Wrap)'}
                 </button>

                 {/* Wrap İşlem Durumu */}
                 {isWrapping && !wrapTxHash && <p style={{textAlign: 'center', marginTop: '10px', fontSize: '0.9em'}}>İşlem cüzdana gönderiliyor, lütfen onaylayın...</p>}
                 {isWrapping && wrapTxHash && <p style={{textAlign: 'center', marginTop: '10px', fontSize: '0.9em'}}>İşlem gönderildi, onay bekleniyor... <a href={`${baseExplorerUrl}/tx/${wrapTxHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9em' }}>(Tx: {wrapTxHash.substring(0, 6)}...{wrapTxHash.substring(wrapTxHash.length - 4)})</a></p>}
                 {wrapError && <p style={{color: 'red', marginTop: '10px', textAlign: 'center', fontSize: '0.9em'}}>{wrapError}</p>}
            </div>
        </div>
    );
};

export default WrapForm;