// src/App.tsx

import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { contractConfig } from './constants/contractConfig'; // Doğru yolda olduğundan emin olun
import { formatEther, formatUnits } from 'ethers'; // Ethers v6 için

// --- Alchemy SDK import ---
import { Alchemy, Network, Nft, TokenBalance, TokenBalancesResponse, TokenMetadataResponse } from 'alchemy-sdk';

// --- Component importları ---
import WrapperContentsViewer from './components/WrapperContentsViewer'; // İçerik görüntüleyici
import WrapForm from './components/WrapForm'; // Yeni Wrap Formu

// --- Alchemy SDK Başlatma ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) {
    console.warn("VITE_ALCHEMY_API_KEY bulunamadı! Alchemy API çağrıları düzgün çalışmayabilir.");
}
const settings = {
    apiKey: alchemyApiKey || "DEFAULT_API_KEY_FALLBACK",
    network: Network.BASE_MAINNET,
};
export const alchemy = new Alchemy(settings);
// --- SDK Başlatma Sonu ---

// --- Tipler ---
interface EnrichedTokenBalance extends TokenBalance { metadata?: TokenMetadataResponse | null; }
// Asset tipi WrapperContentsViewer içinde veya ortak bir yerde olabilir

function App() {
    const { address: userAddress, isConnected } = useAccount();

    // --- Wrapper ücretini oku ---
    const {
        data: wrapperFeeData,
        isLoading: isLoadingFee,
        isError: isErrorFee,
        error: errorFee
    } = useReadContract({
        address: contractConfig.nft.address,
        abi: contractConfig.nft.abi,
        functionName: 'wrapperFee',
        chainId: base.id,
    });
    const formattedFee = typeof wrapperFeeData === 'bigint' ? formatEther(wrapperFeeData) : 'Yükleniyor/Hata';
    // --- Ücret okuma sonu ---

    // --- State'ler ---
    const [ownedWrapperNfts, setOwnedWrapperNfts] = useState<Nft[]>([]); // Sadece bizim wrapper NFT'lerimiz
    const [allOwnedNfts, setAllOwnedNfts] = useState<Nft[]>([]); // Kullanıcının TÜM NFT'leri
    const [enrichedTokenBalances, setEnrichedTokenBalances] = useState<EnrichedTokenBalance[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false); // Genel varlık yükleme
    const [errorAssets, setErrorAssets] = useState<string | null>(null); // Genel varlık hatası
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null); // İçerik görüntüleme için
    // --- State Sonu ---


    // --- Alchemy API ile TÜM Varlıkları Çekmek İçin useEffect ---
    useEffect(() => {
        if (!isConnected || !userAddress) {
            setOwnedWrapperNfts([]);
            setEnrichedTokenBalances([]);
            setAllOwnedNfts([]); // Tüm NFT'leri de sıfırla
            setIsLoadingAssets(false);
            setErrorAssets(null);
            setSelectedTokenId(null);
            return;
        }

        setSelectedTokenId(null); // Adres değişince seçimi sıfırla
        setAllOwnedNfts([]);      // Adres değişince tüm NFT listesini sıfırla

        const fetchAssetsAndMetadata = async () => {
            setIsLoadingAssets(true);
            setErrorAssets(null);
            setOwnedWrapperNfts([]);
            setEnrichedTokenBalances([]);
            setAllOwnedNfts([]); // Başlarken temizle

            try {
                console.log(`Workspaceing assets for ${userAddress} using Alchemy...`);

                // Üç çağrıyı paralel yapalım
                const [wrapperNftsResponse, allNftsResponse, balancesResponse] = await Promise.all([
                    alchemy.nft.getNftsForOwner(userAddress, { contractAddresses: [contractConfig.nft.address] }),
                    alchemy.nft.getNftsForOwner(userAddress /*, { excludeFilters: [NftFilters.SPAM]} */ ), // Tüm NFT'ler
                    alchemy.core.getTokenBalances(userAddress)
                ]);

                console.log("Owned Wrapper NFTs:", wrapperNftsResponse.ownedNfts);
                setOwnedWrapperNfts(wrapperNftsResponse.ownedNfts);

                console.log("All Owned NFTs:", allNftsResponse.ownedNfts);
                setAllOwnedNfts(allNftsResponse.ownedNfts); // Yeni state'i güncelle

                // Token bakiye ve metadata işleme...
                const nonZeroBalances = balancesResponse.tokenBalances.filter(token =>
                    token.tokenBalance && BigInt(token.tokenBalance) > 0
                );
                console.log("Non-zero raw Token Balances:", nonZeroBalances);

                if (nonZeroBalances.length > 0) {
                    console.log(`Workspaceing metadata for ${nonZeroBalances.length} tokens...`);
                    const metadataPromises = nonZeroBalances.map(token => alchemy.core.getTokenMetadata(token.contractAddress));
                    const metadataResults = await Promise.allSettled(metadataPromises);
                    const enrichedBalances: EnrichedTokenBalance[] = nonZeroBalances.map((balance, index) => {
                        const metadataResult = metadataResults[index];
                        return { ...balance, metadata: metadataResult.status === 'fulfilled' ? metadataResult.value : null };
                    });
                    console.log("Enriched Token Balances:", enrichedBalances);
                    setEnrichedTokenBalances(enrichedBalances);
                } else {
                    setEnrichedTokenBalances([]);
                }

            } catch (error: any) {
                console.error("Error fetching assets/metadata from Alchemy:", error);
                setErrorAssets(`Alchemy'den varlık/metadata çekilirken hata oluştu: ${error.message || error}`);
                setOwnedWrapperNfts([]);
                setEnrichedTokenBalances([]);
                setAllOwnedNfts([]); // Hata durumunda tüm NFT'leri de sıfırla
            } finally {
                setIsLoadingAssets(false);
            }
        };

        fetchAssetsAndMetadata();
    }, [isConnected, userAddress]);
    // --- useEffect Sonu ---


    // --- NFT Seçimini Yöneten Fonksiyon ---
    const handleNftSelect = (tokenId: string) => {
        if (selectedTokenId === tokenId) {
            setSelectedTokenId(null);
        } else {
            setSelectedTokenId(tokenId);
        }
    };
    // --- Fonksiyon Sonu ---

    // --- NFT Listesi için Render Edilecek İçeriği Belirleme ---
    let nftListContent = null;
    if (!isLoadingAssets && !errorAssets) {
        if (ownedWrapperNfts.length > 0) {
            nftListContent = (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {ownedWrapperNfts.map(nft => (
                        <li key={`${nft.contract.address}-${nft.tokenId}`} style={{ marginBottom: '5px' }}>
                            <button
                                onClick={() => handleNftSelect(nft.tokenId)}
                                style={{ /* ... button styles ... */
                                     background: selectedTokenId === nft.tokenId ? '#e0e0ff' : 'none',
                                     border: '1px solid #ccc', padding: '3px 8px', marginRight: '5px',
                                     cursor: 'pointer', borderRadius: '4px', textAlign: 'left', width: 'auto'
                                }}
                            >
                                Token ID: {nft.tokenId}
                            </button>
                             {selectedTokenId === nft.tokenId && <span style={{ marginLeft: '5px', fontStyle: 'italic' }}>(Görüntüleniyor)</span>}
                        </li>
                    ))}
                </ul>
            );
        } else if (isConnected) {
            nftListContent = <p>Bu adreste hiç Wrapper NFT bulunamadı.</p>;
        } else {
            nftListContent = <p>NFT'lerinizi görmek için cüzdanınızı bağlayın.</p>;
        }
    }
    // --- İçerik Belirleme Sonu ---


    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>Asset Wrapper DApp</h1>
            <header style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Base Mainnet</span>
                <ConnectButton />
            </header>

             {isConnected && userAddress && (
                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0ff', borderRadius: '5px', background: '#f8f8ff' }}>
                    <div><strong>Bağlı Cüzdan:</strong> {userAddress}</div>
                </div>
            )}


            <main style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>

                {/* Sol Taraf */}
                <section style={{ flex: '1 1 400px', minWidth: '300px' }}>
                    <h2>Kontrat Bilgileri</h2>
                    <div style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
                        <strong>Mevcut Wrapper Ücreti:</strong>{' '}
                        {isLoadingFee && <span>Yükleniyor...</span>}
                        {isErrorFee && <span style={{ color: 'red' }}> Ücret yüklenirken hata! ({errorFee?.message})</span>}
                        {!isLoadingFee && !isErrorFee && <span>{formattedFee} ETH</span>}
                    </div>

                    {/* Sahip Olunan Wrapper NFT Listesi */}
                    <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px', minHeight: '150px' }}>
                        <h3>Sahip Olduğunuz Wrapper NFT'ler (Alchemy):</h3>
                        {isLoadingAssets && <p>Varlıklar Alchemy'den yükleniyor...</p>}
                        {errorAssets && <p style={{ color: 'red' }}>{errorAssets}</p>}
                        {!isLoadingAssets && !errorAssets && nftListContent}
                    </div>

                     {/* Wrapper İçeriğini Gösterme Alanı */}
                     {selectedTokenId && <WrapperContentsViewer tokenId={selectedTokenId} />}

                </section>

                {/* Orta/Sağ Taraf: ERC20'ler ve Wrap Formu */}
                <section style={{ flex: '1 1 400px', minWidth: '300px' }}>
                     <h2>ERC20 Varlıklarınız (Alchemy)</h2>
                     <div style={{ marginTop: '0px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px', minHeight: '150px', marginBottom: '20px' }}> {/* Alt boşluk eklendi */}
                        {isLoadingAssets && <p>Varlıklar Alchemy'den yükleniyor...</p>}
                        {errorAssets && <p style={{ color: 'red' }}>{errorAssets}</p>}
                        {!isLoadingAssets && !errorAssets && (
                             <>
                                {enrichedTokenBalances.length > 0 ? (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}> {/* Margin eklendi */}
                                        {enrichedTokenBalances.map(token => {
                                            // ... (ERC20 formatlama ve gösterme mantığı) ...
                                             const decimals = token.metadata?.decimals ?? 18;
                                            const symbol = token.metadata?.symbol ?? 'Bilinmeyen';
                                            const name = token.metadata?.name ?? 'Token Adı Yok';
                                            const logo = token.metadata?.logo;
                                            let formattedBalance = 'N/A';
                                            if(token.tokenBalance) {
                                                try {
                                                    formattedBalance = formatUnits(BigInt(token.tokenBalance), decimals);
                                                    const balanceNum = parseFloat(formattedBalance);
                                                    if (balanceNum > 0 && balanceNum < 0.000001) { formattedBalance = '< 0.000001'; }
                                                    else { formattedBalance = balanceNum.toLocaleString(undefined, { maximumFractionDigits: 6 }); }
                                                } catch { formattedBalance = "Formatlama hatası" }
                                            }
                                            return ( <li key={token.contractAddress} style={{ marginBottom: '10px', paddingBottom: '5px', borderBottom: '1px solid #eee', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                   {logo && <img src={logo} alt={`${symbol} logo`} style={{width: '24px', height: '24px', borderRadius: '50%'}} onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                                   {!logo && <div style={{width: '24px', height: '24px', borderRadius: '50%', background: '#eee', display: 'inline-block'}}></div>}
                                                   <div>
                                                       <strong title={name}>{symbol}</strong> <br/>
                                                       <span style={{ color: '#555' }}>Bakiye: {formattedBalance}</span><br/>
                                                       <code title={token.contractAddress} style={{ fontSize: '0.8em', color: '#777' }}>{`${token.contractAddress.substring(0, 6)}...${token.contractAddress.substring(token.contractAddress.length - 4)}`}</code>
                                                   </div>
                                                </li> );
                                        })}
                                    </ul>
                                ) : ( isConnected ? <p>Bu adreste (sıfır olmayan) ERC20 bakiyesi bulunamadı.</p> : <p>ERC20 bakiyelerinizi görmek için cüzdanınızı bağlayın.</p> )}
                            </>
                        )}
                    </div>

                    {/* --- Wrap Formu Alanı --- */}
                     <div style={{ marginTop: '0px' }}> {/* Üst boşluk azaltıldı */}
                         <h2>Yeni Wrapper Oluştur</h2>
                         {isConnected && userAddress ? ( // userAddress kontrolü eklendi
                             <WrapForm
                                 availableErc20s={enrichedTokenBalances}
                                 // Wrapper NFT'leri ve potansiyel olarak spam NFT'leri filtrele
                                 availableNfts={allOwnedNfts.filter(nft =>
                                     nft.contract.address.toLowerCase() !== contractConfig.nft.address.toLowerCase() &&
                                     nft.tokenType !== "SPAM" // Alchemy spam filtresi (varsa)
                                 )}
                                 isLoading={isLoadingAssets}
                                 ownerAddress={userAddress} // non-null assertion kaldırıldı, isConnected kontrolü var
                                 maxAssets={10} // Kontrattan gelen limit (veya sabit değer)
                             />
                         ) : (
                             <p>Varlıklarınızı paketlemek için lütfen cüzdanınızı bağlayın.</p>
                         )}
                     </div>
                    {/* --- Wrap Formu Alanı Sonu --- */}
                </section>
            </main>
        </div>
    );
}

export default App;