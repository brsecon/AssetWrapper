// src/pages/ProfilePage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Link } from 'react-router-dom';
import Modal from 'react-modal';
import WrapForm from '../components/WrapForm';
import { Alchemy, Network, Nft, OwnedNftsResponse } from 'alchemy-sdk';
import { NFT_CONTRACT_ADDRESS, ALCHEMY_NETWORK_NAME, BLOCK_EXPLORER_URL } from '../config';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
import { Contract, ContractTransactionResponse, TransactionReceipt } from 'ethers';

// --- Alchemy Kurulumu ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const alchemy = alchemyApiKey ? new Alchemy({ apiKey: alchemyApiKey, network: ALCHEMY_NETWORK_NAME }) : null;

// --- Sabitler ve Yardımcı Fonksiyonlar ---
const REFRESH_COOLDOWN = 30000;

// --- Stil Objeleri (CSS'e taşınabilir) ---
const nftCardStyle: React.CSSProperties = {
  border: `1px solid var(--color-border)`,
  borderRadius: 'var(--border-radius)',
  padding: 'var(--spacing-md)',
  backgroundColor: 'var(--color-bg-secondary)',
  marginBottom: 'var(--spacing-md)',
  textAlign: 'center',
  maxWidth: '250px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between'
};

// !!! DEĞİŞİKLİK BURADA: aspect-ratio eklendi !!!
const nftImageStyle: React.CSSProperties = {
  display: 'block', // Inline yerine block olması layout için daha iyi olabilir
  width: '100%',
  height: 'auto', // Otomatik yükseklik, aspect-ratio'ya göre ayarlanacak
  aspectRatio: '1 / 1', // Kare resimler için en-boy oranı (değiştirebilirsin 16/9 vs.)
  objectFit: 'cover',
  borderRadius: 'calc(var(--border-radius) - 4px)',
  marginBottom: 'var(--spacing-sm)',
  backgroundColor: 'var(--color-bg)', // Resim yoksa veya yüklenirken arka plan
};

const nftGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
    gap: 'var(--spacing-lg)',
    marginTop: 'var(--spacing-lg)',
};

const customModalStyles: Modal.Styles = {
    content: { top: '50%', left: '50%', right: 'auto', bottom: 'auto', marginRight: '-50%', transform: 'translate(-50%, -50%)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', padding: 'var(--spacing-lg)', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', color: 'var(--color-text)'},
    overlay: { backgroundColor: 'rgba(0, 0, 0, 0.75)', zIndex: 1000 },
};

interface OwnedWrapperNFT extends Nft { }

function ProfilePage() {
  const { address, isConnected } = useAccount();
  const signer = useEthersSignerAsync();
  const [ownedWrapperNfts, setOwnedWrapperNfts] = useState<OwnedWrapperNFT[]>([]);
  const [isLoadingNfts, setIsLoadingNfts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWrapModalOpen, setIsWrapModalOpen] = useState(false);
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [unwrappingTokenId, setUnwrappingTokenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{text: string | React.ReactNode, type: 'info' | 'success' | 'error'} | null>(null);

  // --- Yardımcı Fonksiyonlar ---
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string | React.ReactNode, type: 'info' | 'success' | 'error' = 'info') => { /* ... */ if (typeof text !== 'string') { setMessage({ text: '', type }); setTimeout(() => setMessage({ text: text as any, type }), 0); } else { setMessage({ text, type }); } }, []);
  const formatError = useCallback((error: any): string => { /* ... */ if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);

  useEffect(() => { Modal.setAppElement('#root'); }, []);

  useEffect(() => {
    // ... (Kontrat oluşturma useEffect) ...
     if (signer && NFT_CONTRACT_ADDRESS) { try { const contract = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer); setNftWrapperContract(contract); console.log(`ProfilePage: Kontrat Base Mainnet için yüklendi: NFT: ${NFT_CONTRACT_ADDRESS}`); } catch (error) { console.error("NFT Wrapper kontratı oluşturulurken hata:", error); setNftWrapperContract(null); showMessage("NFT Wrapper kontratı yüklenemedi.", "error"); } } else { setNftWrapperContract(null); }
  }, [signer, isConnected, showMessage]);

  const fetchOwnedWrappers = useCallback(async () => {
    // ... (fetchOwnedWrappers) ...
    if (!address || !alchemy || !NFT_CONTRACT_ADDRESS) { setOwnedWrapperNfts([]); if (isConnected && !alchemy) setError("Alchemy SDK yüklenemedi."); if (isConnected && !NFT_CONTRACT_ADDRESS) setError("NFT Wrapper sözleşme adresi eksik."); return; }
    setIsLoadingNfts(true); setError(null); clearMessage();
    try { const options = { contractAddresses: [NFT_CONTRACT_ADDRESS] }; const response: OwnedNftsResponse = await alchemy.nft.getNftsForOwner(address, options); setOwnedWrapperNfts(response.ownedNfts as OwnedWrapperNFT[]); }
    catch (err: any) { console.error("Paket NFT'leri alınamadı:", err); setError(`Paket NFT'leri alınırken bir hata oluştu: ${err.message || 'Bilinmeyen Hata'}`); setOwnedWrapperNfts([]); }
    finally { setIsLoadingNfts(false); }
  }, [address, isConnected, clearMessage]);

  useEffect(() => {
    if (isConnected && address) { fetchOwnedWrappers(); }
    else { setOwnedWrapperNfts([]); setError(null); }
  }, [isConnected, address, fetchOwnedWrappers]);

  const openWrapModal = () => setIsWrapModalOpen(true);
  const closeWrapModal = () => { setIsWrapModalOpen(false); fetchOwnedWrappers(); }

  const handleUnwrap = async (tokenIdToUnwrap: string) => {
    // ... (handleUnwrap) ...
    clearMessage(); setError(null);
    if (!tokenIdToUnwrap || !nftWrapperContract || !signer) { showMessage("Lütfen açılacak bir paket seçin ve cüzdanınızın bağlı olduğundan emin olun.", "error"); return; }
    setUnwrappingTokenId(tokenIdToUnwrap); showMessage(`Paket ${tokenIdToUnwrap} açma işlemi başlatılıyor... Cüzdanınızı kontrol edin.`, "info");
    try { const tx: ContractTransactionResponse = await nftWrapperContract.unwrapAssets(tokenIdToUnwrap); showMessage(`İşlem gönderildi (${tx.hash})... Bekleniyor...`, "info"); const receipt: TransactionReceipt | null = await tx.wait();
       if (receipt?.status === 1) { const txLink = `${BLOCK_EXPLORER_URL}/tx/${receipt.hash}`; showMessage( <span>Paket {tokenIdToUnwrap} başarıyla açıldı! <a href={txLink} target="_blank" rel="noopener noreferrer">İşlemi Görüntüle</a></span>, "success" ); fetchOwnedWrappers(); }
       else { throw new Error(`Paket açma işlemi başarısız oldu. Tx: ${tx.hash ?? 'N/A'}`); }
    } catch (error: any) { console.error("Unwrap hatası:", error); showMessage(formatError(error), "error"); }
    finally { setUnwrappingTokenId(null); }
  };


  return (
    <div className="container profile-page">
      <h2 className="section-title">Profilim</h2>

      {/* Mesaj Alanı (Visibility ile) */}
      <div className={`message-area ${message?.type ?? ''} ${message ? 'visible' : ''}`}>
          {message && <small>{typeof message.text === 'string' ? message.text : message.text}</small>}
      </div>

      {!isConnected ? (
         <div className={`message-area info visible`}>
             <small>Profilinizi görmek için lütfen cüzdanınızı bağlayın.</small>
         </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
            <p>
              <strong style={{ color: 'var(--color-text-secondary)'}}>Adres:</strong> {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
            </p>
            <button onClick={openWrapModal} disabled={!!unwrappingTokenId}>
              + Yeni Paket Oluştur
            </button>
          </div>

          <hr className="section-divider" />

          <h3 className="section-title" style={{ marginTop: 'var(--spacing-lg)' }}>Sahip Olduğum Paketler ({ownedWrapperNfts.length})</h3>

           {/* Yükleme ve Hata Durumları */}
           <div style={{minHeight: '24px'}}>
               {isLoadingNfts && <p style={{visibility: isLoadingNfts ? 'visible' : 'hidden'}}><small>Paketler yükleniyor... ⏳</small></p>}
           </div>
           <div className={`message-area error ${error ? 'visible' : ''}`}>
               {error && <small>{error}</small>}
           </div>


          {!isLoadingNfts && !error && ownedWrapperNfts.length === 0 && (
            <p><small>Henüz oluşturulmuş bir paketiniz bulunmuyor.</small></p>
          )}

          {!isLoadingNfts && !error && ownedWrapperNfts.length > 0 && (
            <div style={nftGridStyle}>
              {ownedWrapperNfts.map((nft) => {
                const externalLink = `${BLOCK_EXPLORER_URL}/nft/${NFT_CONTRACT_ADDRESS}/${nft.tokenId}`;
                const isThisUnwrapping = unwrappingTokenId === nft.tokenId;

                return (
                    <div key={nft.tokenId} style={nftCardStyle}>
                         <div> {/* Üst kısım */}
                             {/* !!! DEĞİŞİKLİK BURADA: style={nftImageStyle} kullanılıyor !!! */}
                             <img
                                src={nft.image?.cachedUrl ?? nft.image?.thumbnailUrl ?? '/placeholder-nft.png'}
                                alt={nft.name ?? `Wrapper #${nft.tokenId}`}
                                style={nftImageStyle} // aspect-ratio içeren stil objesi
                                onError={(e) => (e.currentTarget.src = '/placeholder-nft.png')}
                             />
                             <h4 style={{ fontSize: '1.1em', marginBottom: 'var(--spacing-xs)' }}>
                               {nft.name ?? `Paket #${nft.tokenId}`}
                             </h4>
                             <p style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                                ID: {nft.tokenId}
                             </p>
                             <a href={externalLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8em' }}>
                                Explorer'da Görüntüle
                             </a>
                         </div>

                         <div style={{ marginTop: 'var(--spacing-md)'}}>
                              <button
                                className="nft-card-unwrap-button"
                                onClick={() => handleUnwrap(nft.tokenId)}
                                disabled={!!unwrappingTokenId}
                              >
                                {isThisUnwrapping ? 'Açılıyor...⏳' : 'Paketi Aç'}
                              </button>
                         </div>
                    </div>
                );
                })}
            </div>
          )}
        </>
      )}

      {/* --- Paket Oluşturma Modalı --- */}
       <Modal isOpen={isWrapModalOpen} onRequestClose={closeWrapModal} style={customModalStyles} contentLabel="Yeni Paket Oluştur" shouldCloseOnOverlayClick={true}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <h3 style={{ margin: 0 }}>Yeni Varlık Paketi Oluştur</h3>
              <button onClick={closeWrapModal} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
         </div>
         <WrapForm />
       </Modal>

    </div>
  );
}

export default ProfilePage;