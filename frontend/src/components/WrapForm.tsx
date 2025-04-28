// src/components/WrapForm.tsx
import React, { useState } from 'react';
import { Nft, TokenMetadataResponse } from 'alchemy-sdk';
import { formatUnits, parseUnits } from 'ethers'; // Gerekli utils

// App'ten gelen EnrichedTokenBalance tipi (veya ortak bir yerden import)
interface EnrichedTokenBalance {
    contractAddress: string | null;
    tokenBalance: string | null;
    error?: string | undefined;
    metadata?: TokenMetadataResponse | null;
}

// Solidity'deki Asset struct'ına karşılık gelen Tip
interface Asset {
    contractAddress: string;
    idOrAmount: bigint; // Wrap fonksiyonuna bigint göndereceğiz
    isNFT: boolean;
}

interface WrapFormProps {
    availableErc20s: EnrichedTokenBalance[];
    availableNfts: Nft[];
    isLoading: boolean;
    ownerAddress: string;
    maxAssets: number; // Maksimum eklenecek varlık sayısı
}

const WrapForm: React.FC<WrapFormProps> = ({ availableErc20s, availableNfts, isLoading, ownerAddress, maxAssets }) => {
    const [assetsToWrap, setAssetsToWrap] = useState<Asset[]>([]); // Pakete eklenecek varlıklar
    const [erc20Amounts, setErc20Amounts] = useState<{ [contractAddress: string]: string }>({}); // Girilen ERC20 miktarları

    // ERC20 miktarını state'te güncelle
    const handleAmountChange = (address: string, amount: string) => {
        setErc20Amounts(prev => ({ ...prev, [address]: amount }));
    };

    // ERC20'yi pakete ekle
    const addErc20ToWrap = (token: EnrichedTokenBalance) => {
        if (!token.contractAddress) return;
        const amountString = erc20Amounts[token.contractAddress] || '';
        const decimals = token.metadata?.decimals ?? 18;

        if (assetsToWrap.length >= maxAssets) {
            alert(`Pakete en fazla ${maxAssets} varlık ekleyebilirsiniz.`);
            return;
        }

        try {
            const amountBigInt = parseUnits(amountString.replace(',', '.'), decimals); // Virgülü noktaya çevir ve parse et
            if (amountBigInt <= 0n) {
                alert("Lütfen geçerli bir miktar girin.");
                return;
            }
            // TODO: Kullanıcının bakiyesinden fazla girip girmediğini kontrol et (token.tokenBalance ile karşılaştır)

            const newAsset: Asset = {
                contractAddress: token.contractAddress,
                idOrAmount: amountBigInt,
                isNFT: false
            };
            setAssetsToWrap(prev => [...prev, newAsset]);
            // Miktar alanını temizle (isteğe bağlı)
            // handleAmountChange(token.contractAddress, '');
        } catch (e) {
            alert("Geçersiz miktar formatı.");
            console.error("Parsing error:", e);
        }
    };

    // NFT'yi pakete ekle
    const addNftToWrap = (nft: Nft) => {
         if (assetsToWrap.length >= maxAssets) {
            alert(`Pakete en fazla ${maxAssets} varlık ekleyebilirsiniz.`);
            return;
        }
         // Aynı NFT'nin tekrar eklenmesini kontrol et (isteğe bağlı)
        if (assetsToWrap.some(a => a.isNFT && a.contractAddress === nft.contract.address && a.idOrAmount === BigInt(nft.tokenId))) {
            alert("Bu NFT zaten pakette.");
            return;
        }

        const newAsset: Asset = {
            contractAddress: nft.contract.address,
            idOrAmount: BigInt(nft.tokenId), // Token ID'yi bigint yap
            isNFT: true
        };
        setAssetsToWrap(prev => [...prev, newAsset]);
    };

    // Varlığı paketten çıkar
    const removeFromWrap = (index: number) => {
        setAssetsToWrap(prev => prev.filter((_, i) => i !== index));
    };

    // --- Placeholder Wrap Fonksiyonu ---
    const handleWrap = () => {
         if (assetsToWrap.length === 0) {
             alert("Lütfen paketlemek için en az bir varlık ekleyin.");
             return;
         }
        console.log("Paketlenecek Varlıklar:", assetsToWrap);
        alert("Wrap fonksiyonu henüz eklenmedi. Konsolu kontrol edin.");
        // TODO: Adım 2 - Onayları kontrol et/iste
        // TODO: Adım 3 - wrapAssets işlemini gönder
    };

    if (isLoading) {
        return <p>Varlıklarınız yükleniyor...</p>;
    }

    return (
        <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
            {/* Bölüm 1: Seçilecek Varlıklar */}
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {/* ERC20 Seçimi */}
                <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px' }}>
                    <h4>Pakete Eklenecek ERC20'ler</h4>
                    {availableErc20s.length > 0 ? (
                         availableErc20s.map(token => {
                             const address = token.contractAddress!;
                             const symbol = token.metadata?.symbol ?? 'Bilinmeyen';
                             return (
                                <div key={address} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}>
                                    <input
                                        type="text" // number yerine text, ondalıklar için daha iyi
                                        placeholder="Miktar"
                                        value={erc20Amounts[address] || ''}
                                        onChange={(e) => handleAmountChange(address, e.target.value)}
                                        style={{ width: '80px', padding: '4px' }}
                                    />
                                    <span>{symbol}</span>
                                    <button onClick={() => addErc20ToWrap(token)} style={{ padding: '2px 6px' }}>+</button>
                                </div>
                             );
                         })
                    ) : <p>Paketlenecek ERC20 bulunamadı.</p>}
                </div>

                {/* NFT Seçimi */}
                <div style={{ flex: '1', minWidth: '250px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                    <h4>Pakete Eklenecek NFT'ler</h4>
                     {availableNfts.length > 0 ? (
                         availableNfts.map(nft => (
                            <div key={`<span class="math-inline">\{nft\.contract\.address\}\-</span>{nft.tokenId}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '0.9em' }}>
                                <button onClick={() => addNftToWrap(nft)} style={{ padding: '2px 6px' }}>+</button>
                                <span>{nft.name || `#${nft.tokenId}`} ({nft.contract.symbol || nft.contract.address.substring(0, 6)})</span>
                                 {/* NFT görseli isteğe bağlı eklenebilir: nft.media[0]?.thumbnail */}
                            </div>
                         ))
                     ) : <p>Paketlenecek NFT bulunamadı.</p>}
                </div>
            </div>

            {/* Bölüm 2: Oluşturulan Paket */}
            <div style={{ border: '1px solid #007bff', padding: '15px', borderRadius: '5px', background: '#f0f8ff' }}>
                <h4>Oluşturulan Paket ({assetsToWrap.length}/{maxAssets})</h4>
                {assetsToWrap.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {assetsToWrap.map((asset, index) => (
                            <li key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '0.9em', borderBottom: '1px dashed #ccc', paddingBottom: '5px' }}>
                                <span>
                                    {asset.isNFT ? 'NFT' : 'ERC20'} -
                                    <code title={asset.contractAddress}>{` ${asset.contractAddress.substring(0, 6)}... `}</code>
                                    ({asset.isNFT ? `ID: ${asset.idOrAmount}` : `Miktar: ${asset.idOrAmount.toString()} (Ham)`})
                                    {/* TODO: Format ERC20 amount using decimals */}
                                </span>
                                <button onClick={() => removeFromWrap(index)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px' }}>X</button>
                            </li>
                        ))}
                    </ul>
                ) : <p>Paketlemek için yukarıdan varlık ekleyin.</p>}
            </div>

             {/* Bölüm 3: Wrap Butonu */}
            <button
                onClick={handleWrap}
                disabled={assetsToWrap.length === 0} // Paket boşsa veya işlem yapılıyorsa (ileride eklenecek) devre dışı bırak
                style={{ padding: '10px 15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1em', marginTop: '10px' }}
            >
                Paketi Onayla ve Oluştur (Wrap) - Yakında!
            </button>
        </div>
    );
};

export default WrapForm;