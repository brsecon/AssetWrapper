// src/App.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { contractConfig } from './constants/contractConfig';
import { formatEther, formatUnits } from 'ethers';

// --- Alchemy SDK import ---
// NftFilters'ı import etmeye artık gerek yok (kullanmayacağız)
import { Alchemy, Network, Nft, TokenBalance, TokenBalancesResponse, TokenMetadataResponse } from 'alchemy-sdk';

// --- Component importları ---
import WrapperContentsViewer from './components/WrapperContentsViewer';
import WrapForm from './components/WrapForm';

// Tek bir yerden import edelim
import { alchemy } from './alchemyClient';

// --- Tipler ---
interface EnrichedTokenBalance extends TokenBalance { metadata?: TokenMetadataResponse | null; }

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

    // --- State'ler ---
    const [ownedWrapperNfts, setOwnedWrapperNfts] = useState<Nft[]>([]);
    const [allOwnedNfts, setAllOwnedNfts] = useState<Nft[]>([]);
    const [enrichedTokenBalances, setEnrichedTokenBalances] = useState<EnrichedTokenBalance[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [errorAssets, setErrorAssets] = useState<string | null>(null);
    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
    const [fetchTrigger, setFetchTrigger] = useState(0);


    // --- Alchemy API ile TÜM Varlıkları Çekmek İçin Fonksiyon ---
    const fetchAssetsAndMetadata = useCallback(async () => {
        if (!isConnected || !userAddress) {
             setOwnedWrapperNfts([]);
             setEnrichedTokenBalances([]);
             setAllOwnedNfts([]);
             setIsLoadingAssets(false);
             setErrorAssets(null);
             setSelectedTokenId(null);
             return;
         }

        setSelectedTokenId(null);
        setIsLoadingAssets(true);
        setErrorAssets(null); // Hata mesajını temizle

        try {
            console.log(`Workspaceing assets for ${userAddress} using Alchemy... Trigger: ${fetchTrigger}`);

            // --- DÜZELTME: excludeFilters kaldırıldı ---
            const nftOptions = {
                 // excludeFilters: [NftFilters.SPAM], // BU SATIRI KALDIR VEYA YORUMA AL
                 // pageSize: 100
            };

            const [wrapperNftsResponse, allNftsResponse, balancesResponse] = await Promise.all([
                alchemy.nft.getNftsForOwner(userAddress, { contractAddresses: [contractConfig.nft.address] }),
                alchemy.nft.getNftsForOwner(userAddress /* nftOptions */ ), // nftOptions artık boş veya kullanılmıyor
                alchemy.core.getTokenBalances(userAddress)
            ]);
            // --- DÜZELTME SONU ---

            console.log("Owned Wrapper NFTs:", wrapperNftsResponse.ownedNfts);
            setOwnedWrapperNfts(wrapperNftsResponse.ownedNfts);

            console.log("All Owned NFTs:", allNftsResponse.ownedNfts); // Artık spam olanlar da gelebilir
            setAllOwnedNfts(allNftsResponse.ownedNfts);

            const nonZeroBalances = balancesResponse.tokenBalances.filter(token =>
                token.tokenBalance && BigInt(token.tokenBalance) > 0
            );
            console.log("Non-zero raw Token Balances:", nonZeroBalances);

            if (nonZeroBalances.length > 0) {
                console.log(`Workspaceing metadata for ${nonZeroBalances.length} tokens...`);
                const metadataPromises = nonZeroBalances.map(token => alchemy.core.getTokenMetadata(token.contractAddress));
                const metadataResults = await Promise.all(metadataPromises.map(p => p.catch(e => {
                    console.warn("Metadata fetch failed for one token:", e);
                    return null;
                })));

                const enrichedBalances: EnrichedTokenBalance[] = nonZeroBalances.map((balance, index) => {
                    return { ...balance, metadata: metadataResults[index] };
                });
                console.log("Enriched Token Balances:", enrichedBalances);
                setEnrichedTokenBalances(enrichedBalances);
            } else {
                setEnrichedTokenBalances([]);
            }

        } catch (error: any) {
            // Hata yönetimi aynen kalabilir, ancak 403 hatası artık gelmemeli
            console.error("Error fetching assets/metadata from Alchemy:", error);
            setErrorAssets(`Alchemy'den varlık/metadata çekilirken hata oluştu: ${error.message || error}`);
        } finally {
            setIsLoadingAssets(false);
        }
    }, [isConnected, userAddress, fetchTrigger]);

    // --- useEffect ---
    useEffect(() => {
        fetchAssetsAndMetadata();
    }, [fetchAssetsAndMetadata]);

    // --- handleWrapSuccess ---
    const handleWrapSuccess = () => {
        console.log("Wrap successful! Refetching assets...");
        setFetchTrigger(prev => prev + 1);
    };

    // --- handleNftSelect ---
    const handleNftSelect = (tokenId: string) => {
        if (selectedTokenId === tokenId) {
            setSelectedTokenId(null);
        } else {
            setSelectedTokenId(tokenId);
        }
    };

    // --- NFT Listesi İçeriği ---
    let nftListContent = null;
    // ... (Bu kısım aynı kalabilir) ...
    if (isLoadingAssets && ownedWrapperNfts.length === 0) {
         nftListContent = <p>Wrapper NFT'leriniz yükleniyor...</p>;
    } else if (!isLoadingAssets && errorAssets && ownedWrapperNfts.length === 0) {
         nftListContent = <p style={{ color: 'red' }}>{errorAssets}</p>;
    } else if (!isLoadingAssets && ownedWrapperNfts.length > 0) {
        nftListContent = (
            <ul style={{ listStyle: 'none', padding: 0 }}>
                {ownedWrapperNfts.map(nft => (
                    <li key={`${nft.contract.address}-${nft.tokenId}`} style={{ marginBottom: '5px' }}>
                        <button
                            onClick={() => handleNftSelect(nft.tokenId)}
                            style={{ /* ... styles ... */
                                 background: selectedTokenId === nft.tokenId ? '#e0e0ff' : 'none',
                                 border: '1px solid #ccc', padding: '3px 8px', marginRight: '5px',
                                 cursor: 'pointer', borderRadius: '4px', textAlign: 'left', width: 'auto'
                            }}
                        >
                            Token ID: {nft.tokenId} {(nft.name || nft.contract.name) && `(${nft.name || nft.contract.name})`}
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


    // --- Render ---
    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>Asset Wrapper DApp</h1>
            <header style={{ /* ... styles ... */ marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Base Mainnet</span>
                <ConnectButton />
            </header>

             {isConnected && userAddress && (
                <div style={{ /* ... styles ... */ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0ff', borderRadius: '5px', background: '#f8f8ff' }}>
                    <div><strong>Bağlı Cüzdan:</strong> {userAddress}</div>
                </div>
            )}

            {/* Hata Mesajını Gösterme Alanı */}
             {errorAssets && (
                 <div style={{ padding: '10px', marginBottom: '15px', background: '#ffe0e0', border: '1px solid red', color: 'red', borderRadius: '5px' }}>
                     <strong>Hata:</strong> {errorAssets}
                 </div>
             )}


            <main style={{ /* ... styles ... */ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>

                {/* Sol Taraf */}
                <section style={{ /* ... styles ... */ flex: '1 1 400px', minWidth: '300px' }}>
                    <h2>Kontrat Bilgileri</h2>
                    <div style={{ /* ... styles ... */ marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
                        <strong>Mevcut Wrapper Ücreti:</strong>{' '}
                        {isLoadingFee && <span>Yükleniyor...</span>}
                        {isErrorFee && <span style={{ color: 'red' }}> Ücret yüklenirken hata! ({errorFee?.message})</span>}
                        {!isLoadingFee && !isErrorFee && wrapperFeeData !== undefined && <span>{formattedFee} ETH</span>}
                    </div>

                    {/* Sahip Olunan Wrapper NFT Listesi */}
                    <div style={{ /* ... styles ... */ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px', minHeight: '150px' }}>
                        <h3>Sahip Olduğunuz Wrapper NFT'ler (Alchemy):</h3>
                        {nftListContent}
                         {isLoadingAssets && ownedWrapperNfts.length > 0 && <p><small>Liste güncelleniyor...</small></p>}
                    </div>

                     {/* Wrapper İçeriğini Gösterme Alanı */}
                     {selectedTokenId && <WrapperContentsViewer tokenId={selectedTokenId} />}

                </section>

                {/* Orta/Sağ Taraf: ERC20'ler ve Wrap Formu */}
                <section style={{ /* ... styles ... */ flex: '1 1 400px', minWidth: '300px' }}>
                     <h2>ERC20 Varlıklarınız (Alchemy)</h2>
                     <div style={{ /* ... styles ... */ marginTop: '0px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px', minHeight: '150px', marginBottom: '20px' }}>
                        {/* ... ERC20 listeleme kodu aynı kalabilir ... */}
                        {isLoadingAssets && enrichedTokenBalances.length === 0 && <p>Varlıklar Alchemy'den yükleniyor...</p>}
                        {/* {errorAssets && enrichedTokenBalances.length === 0 && <p style={{ color: 'red' }}>{errorAssets}</p>} Hata yukarıda genel olarak gösteriliyor */}
                        {!isLoadingAssets && !errorAssets && (
                             <>
                                {enrichedTokenBalances.length > 0 ? (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                        {enrichedTokenBalances.map(token => {
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
                                            return ( <li key={token.contractAddress} style={{ /* ... styles ... */ marginBottom: '10px', paddingBottom: '5px', borderBottom: '1px solid #eee', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                          {isLoadingAssets && enrichedTokenBalances.length > 0 && <p><small>Liste güncelleniyor...</small></p>}
                    </div>

                    {/* --- Wrap Formu Alanı --- */}
                     <div style={{ marginTop: '0px' }}>
                         <h2>Yeni Wrapper Oluştur</h2>
                         {isConnected && userAddress ? (
                             <WrapForm
                                 availableErc20s={enrichedTokenBalances}
                                 // WrapForm'a geçerken spam olmayanları filtrele (Alchemy etiketine göre)
                                 availableNfts={allOwnedNfts.filter(nft =>
                                     nft.contract.address.toLowerCase() !== contractConfig.nft.address.toLowerCase() &&
                                     !nft.spamInfo?.isSpam // Alchemy'nin spam etiketini kullan
                                     // nft.tokenType !== "SPAM" // eski yöntem
                                 )}
                                 isLoading={isLoadingAssets}
                                 ownerAddress={userAddress}
                                 maxAssets={10}
                                 wrapperFee={wrapperFeeData}
                                 onWrapSuccess={handleWrapSuccess}
                                 isFeeLoading={isLoadingFee}
                             />
                         ) : (
                             <p>Varlıklarınızı paketlemek için lütfen cüzdanınızı bağlayın.</p>
                         )}
                     </div>
                </section>
            </main>
        </div>
    );
}

export default App;