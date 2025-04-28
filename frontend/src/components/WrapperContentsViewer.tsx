// src/components/WrapperContentsViewer.tsx
import React, { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { contractConfig } from '../constants/contractConfig'; // Üst dizine çıkıp import et

// Asset tipini tanımla (veya ortak bir yerden import et)
interface Asset {
    contractAddress: string;
    idOrAmount: bigint;
    isNFT: boolean;
}

// Component'in alacağı prop'ları tanımla
interface WrapperContentsViewerProps {
    tokenId: string; // Seçilen Token ID'si prop olarak gelecek
}

const WrapperContentsViewer: React.FC<WrapperContentsViewerProps> = ({ tokenId }) => {
    // State'ler bu component'e özel olacak
    const [wrapperContents, setWrapperContents] = useState<Asset[] | null>(null);
    const [isLoadingContents, setIsLoadingContents] = useState(false);
    const [errorContents, setErrorContents] = useState<string | null>(null);

    // İçeriği çekmek için useReadContract (artık 'enabled'a gerek yok, component sadece ID varsa render edilecek)
    const {
        data: rawContentsData,
        error: readContentsError,
        isLoading: isLoadingHookContents,
        isFetching: isFetchingHookContents,
    } = useReadContract({
        address: contractConfig.nft.address,
        abi: contractConfig.nft.abi,
        functionName: 'getWrapperContents',
        args: [tokenId], // Prop'tan gelen tokenId doğrudan kullanılıyor
        chainId: base.id,
        // enabled: true, // Artık her zaman etkin olabilir veya kaldırılabilir
    });

    // useReadContract sonucunu izleyip state'i güncelleyen useEffect
    useEffect(() => {
        setIsLoadingContents(isLoadingHookContents || isFetchingHookContents);

        if (readContentsError) {
            console.error(`Error reading contents for token ${tokenId}:`, readContentsError);
            // @ts-ignore
            setErrorContents(`NFT ${tokenId} içeriği okunamadı: ${readContentsError.shortMessage || readContentsError.message}`);
            setWrapperContents(null);
        } else if (rawContentsData) {
             try {
                const contents = rawContentsData as Asset[];
                setWrapperContents(contents);
                setErrorContents(null);
            } catch (castError) {
                console.error("Error processing contents data:", castError, rawContentsData);
                setErrorContents("Kontrattan gelen içerik verisi işlenemedi.");
                setWrapperContents(null);
            }
        } else if (!isLoadingHookContents && !isFetchingHookContents && !rawContentsData) {
             // Veri yoksa (boş içerik)
             setWrapperContents([]);
             setErrorContents(null);
        }

    }, [rawContentsData, readContentsError, isLoadingHookContents, isFetchingHookContents, tokenId]); // tokenId'yi de bağımlılıklara ekle


    // Render kısmı
    return (
        <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #bbf', borderRadius: '5px', background: '#f0f8ff', minHeight: '150px' }}>
            <h3>Wrapper NFT İçeriği (ID: {tokenId})</h3>

            {isLoadingContents && <p>İçerik yükleniyor...</p>}
            {errorContents && <p style={{ color: 'red' }}>{errorContents}</p>}

            {!isLoadingContents && !errorContents && wrapperContents && wrapperContents.length > 0 && (
                 <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9em' }}>
                    {wrapperContents.map((asset, index) => {
                         let displayAmount = asset.idOrAmount.toString();
                         if (!asset.isNFT) { displayAmount = `${asset.idOrAmount.toString()} (Ham)`; }
                         return (
                             <li key={`<span class="math-inline">\{asset\.contractAddress\}\-</span>{asset.idOrAmount.toString()}-${index}`} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #ccc' }}>
                                 <strong>Tip:</strong> {asset.isNFT ? 'NFT' : 'ERC20'} <br />
                                 <strong>Kontrat:</strong> <code title={asset.contractAddress} style={{ fontSize: '0.9em' }}>{asset.contractAddress}</code> <br />
                                 <strong>{asset.isNFT ? 'Token ID:' : 'Miktar:'}</strong> {displayAmount}
                                 {/* TODO: İçerikteki varlıklar için metadata çek */}
                             </li>
                         );
                     })}
                </ul>
            )}
            {!isLoadingContents && !errorContents && wrapperContents && wrapperContents.length === 0 && ( <p>Bu wrapper'ın içi boş.</p> )}
         </div>
    );
};

export default WrapperContentsViewer;