// src/components/WrapForm.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    ethers, parseUnits, formatUnits, Contract, Signer, parseEther,
    toBigInt, isAddress, ContractTransactionResponse, TransactionReceipt,
    MaxUint256
} from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSignerAsync } from '../hooks/useEthersSignerAsync';
import { AssetWrapperNFTAbi } from '../abi/AssetWrapperNFTAbi';
// import { AssetWrapperVaultAbi } from '../abi/AssetWrapperVaultAbi'; // Gerekli değilse kaldırılabilir
import { erc20Abi } from '../abi/erc20Abi';
import { erc721Abi } from '../abi/erc721Abi';
import {
  NFT_CONTRACT_ADDRESS,
  VAULT_CONTRACT_ADDRESS,
  ALCHEMY_NETWORK_NAME,
  BLOCK_EXPLORER_URL,
  SelectableAsset
} from '../config';
import { Alchemy, Network, TokenBalancesResponse, NftHolding, GetNftsForOwnerOptions } from 'alchemy-sdk';

// --- Sabitler ve Kurulumlar ---
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!alchemyApiKey) { console.warn("VITE_ALCHEMY_API_KEY .env dosyasında tanımlanmamış!"); }
const REFRESH_COOLDOWN = 30000;
const WRAPPER_FEE_DISPLAY = "0.0005";
let WRAPPER_FEE_WEI = 0n;
try { WRAPPER_FEE_WEI = parseEther(WRAPPER_FEE_DISPLAY); } catch (e) { console.error("Paketleme ücreti ayrıştırılamadı!", e); }
// --- Sabitler ve Kurulumlar Sonu ---


// --- Tipler ---
interface AssetToWrapInternal extends SelectableAsset { idOrAmount: string; isNFT: boolean; }
interface FormattedAsset { contractAddress: string; idOrAmount: bigint; isNFT: boolean; }
const formatDisplayNumber = (value: string | number | null | undefined, decimals: number = 4): string => { /* ... Öncekiyle aynı ... */ if (value === null || value === undefined) return '-'; try { const s = String(value).replace(',', '.'); const n = parseFloat(s); if (isNaN(n)) return String(value); if (Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n!==0)) return n.toExponential(decimals>0?decimals-1:0); return parseFloat(n.toFixed(decimals)).toString(); } catch { return String(value); }};
// --- Tipler Sonu ---

function WrapForm() {
  const { address, isConnected } = useAccount();
  const signer = useEthersSignerAsync();

  // --- State'ler ---
  const [availableAssets, setAvailableAssets] = useState<SelectableAsset[]>([]);
  const [allOwnedNfts, setAllOwnedNfts] = useState<NftHolding[]>([]);
  const [selectedAssetAddress, setSelectedAssetAddress] = useState<string>("");
  const [nftsInSelectedCollection, setNftsInSelectedCollection] = useState<NftHolding[]>([]);
  const [selectedNftTokenId, setSelectedNftTokenId] = useState<string>("");
  const [erc20Amount, setErc20Amount] = useState('');
  const [assetsToWrap, setAssetsToWrap] = useState<AssetToWrapInternal[]>([]);
  const [message, setMessage] = useState<{text: string | React.ReactNode, type: 'info' | 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [erc20Balance, setErc20Balance] = useState<string | null>(null);
  const [nftWrapperContract, setNftWrapperContract] = useState<Contract | null>(null);
  const [isRefreshAssetsDisabled, setIsRefreshAssetsDisabled] = useState(false);
  const refreshAssetsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // --- State Tanımları Sonu ---


  const alchemy = useMemo(() => { /* ... Öncekiyle aynı ... */ if (!alchemyApiKey) { console.warn("WrapForm: VITE_ALCHEMY_API_KEY not set!"); return null; } try { return new Alchemy({ apiKey: alchemyApiKey, network: ALCHEMY_NETWORK_NAME }); } catch (e) { console.error("Alchemy SDK oluşturulurken hata:", e); return null; } }, []);
  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((text: string | React.ReactNode, type: 'info' | 'success' | 'error' = 'info') => { /* ... Öncekiyle aynı ... */ if (typeof text !== 'string') { setMessage({ text: '', type }); setTimeout(() => setMessage({ text: text as any, type }), 0); } else { setMessage({ text, type }); } }, []);
  const formatError = useCallback((error: any): string => { /* ... Öncekiyle aynı ... */ console.error("Formatlanacak Hata:", error); if (error?.code === 'ACTION_REJECTED') return "İşlem cüzdan tarafından reddedildi."; if (error?.reason) return `Kontrat hatası: ${error.reason}`; if (error?.code === 'CALL_EXCEPTION') return `Kontrat çağrısı başarısız oldu (${error.action || 'bilinmeyen eylem'}). Revert sebebi belirtilmemiş olabilir. Detaylar konsolda.`; if (error?.message) return `Bir hata oluştu: ${error.message}`; return "Bilinmeyen bir hata oluştu."; }, []);
  const selectedAssetInfo: SelectableAsset | undefined = useMemo(() => availableAssets.find(asset => asset.address === selectedAssetAddress), [selectedAssetAddress, availableAssets]);

  // --- Efektler ---
  useEffect(() => {
      // ... (Kontrat oluşturma useEffect - önceki haliyle aynı) ...
       console.log('Kontrat useEffect ÇALIŞIYOR. Signer:', !!signer, 'isConnected:', isConnected);
      if (signer && NFT_CONTRACT_ADDRESS && VAULT_CONTRACT_ADDRESS) {
        try {
            console.log('NFT Wrapper Kontratı oluşturuluyor...');
            const nftWrapper = new Contract(NFT_CONTRACT_ADDRESS, AssetWrapperNFTAbi, signer);
            setNftWrapperContract(nftWrapper);
            console.log(`Kontratlar yüklendi: NFT: ${NFT_CONTRACT_ADDRESS}`);
        } catch (error) {
             console.error("Kontratlar oluşturulurken useEffect içinde hata:", error);
             setNftWrapperContract(null);
             showMessage("Kontratlar yüklenemedi.", "error");
        }
      } else {
        console.log('Kontratlar için signer veya adresler hazır değil, state temizleniyor.');
        setNftWrapperContract(null);
        if (isConnected && (!NFT_CONTRACT_ADDRESS || !VAULT_CONTRACT_ADDRESS)) {
          showMessage("Gerekli kontrat adresleri (NFT veya Vault) yapılandırmada eksik.", "error");
        }
      }
  }, [signer, isConnected, showMessage]);

  const fetchWalletAssets = useCallback(async (triggeredByUser: boolean = false) => {
      // ... (Önceki fetchWalletAssets kodu - Client-Side filtreleme ile) ...
       console.log("fetchWalletAssets tetiklendi. Adres:", address, "Alchemy Hazır:", !!alchemy);
      if (!address || !alchemy) { return; }
      if (triggeredByUser && isRefreshAssetsDisabled) { return; }

      setIsFetchingAssets(true);
      if (!message || message.type === 'info') { showMessage("Cüzdan varlıkları yükleniyor...", "info"); }
      setAvailableAssets([]); setAllOwnedNfts([]); setSelectedAssetAddress(""); setNftsInSelectedCollection([]); setSelectedNftTokenId(""); setErc20Amount("");
      console.log("State'ler sıfırlandı, fetch başlıyor...");
      if (triggeredByUser) { setIsRefreshAssetsDisabled(true); if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } refreshAssetsTimeoutRef.current = setTimeout(() => { setIsRefreshAssetsDisabled(false); }, REFRESH_COOLDOWN); }

      let fetchSuccess = false; let finalAvailableAssets: SelectableAsset[] = [];
      try {
          // Adım 1: ERC20 token bakiyeleri (Değişiklik yok)
          console.log("Adım 1: ERC20 token bakiyeleri çekiliyor...");
          const tokenBalancesResponse: TokenBalancesResponse = await alchemy.core.getTokenBalances(address);
          console.log("ERC20 Bakiye Yanıtı Alındı");
          const nonZeroBalances = tokenBalancesResponse.tokenBalances.filter(token => !token.error && toBigInt(token.tokenBalance ?? '0') > 0n);
          console.log(`Sıfır olmayan ${nonZeroBalances.length} ERC20 bakiyesi bulundu.`);
          const tokenPromises = nonZeroBalances.map(async (token): Promise<SelectableAsset | null> => { try { const metadata = await alchemy.core.getTokenMetadata(token.contractAddress); const decimals = metadata.decimals ?? 18; const balance = formatUnits(token.tokenBalance!, decimals); return { name: metadata.name ?? 'Bilinmeyen Token', address: token.contractAddress, symbol: metadata.symbol ?? '???', type: 'ERC20', decimals: decimals, logo: metadata.logo ?? null, balance: balance, }; } catch (metaError) { console.warn(`Metadata alınamadı: ${token.contractAddress}`, metaError); try { const balance = token.tokenBalance ? formatUnits(token.tokenBalance, 18) : "0"; return { name: 'Bilinmeyen Token', address: token.contractAddress, symbol: '???', type: 'ERC20', decimals: 18, logo: null, balance: balance }; } catch (fallbackError) { console.error(`Fallback metadata oluşturulamadı: ${token.contractAddress}`, fallbackError); return null; } } });
          const resolvedTokens = (await Promise.all(tokenPromises)).filter(t => t !== null) as SelectableAsset[];
          console.log(`${resolvedTokens.length} ERC20 token metadata başarıyla işlendi.`);

          // Adım 2: Sahip olunan NFT'ler (Filtresiz çek, sonra filtrele)
          console.log("Adım 2: Sahip olunan TÜM NFT'ler çekiliyor (filtresiz)...");
          const nftResponse = await alchemy.nft.getNftsForOwner(address);
          console.log("NFT Yanıtı Alındı (getNftsForOwner - filtresiz)");
          const allNftsFromAlchemy = nftResponse.ownedNfts;
          console.log(`Toplam ${allNftsFromAlchemy.length} NFT bulundu (filtrelenmemiş).`);

          let filteredOwnedNfts: NftHolding[] = [];
          if (NFT_CONTRACT_ADDRESS) {
              const wrapperAddressLower = NFT_CONTRACT_ADDRESS.toLowerCase();
              filteredOwnedNfts = allNftsFromAlchemy.filter(nft => nft.contract.address.toLowerCase() !== wrapperAddressLower);
              console.log(`Wrapper NFT'ler (${wrapperAddressLower}) filtrelendi, kalan: ${filteredOwnedNfts.length}`);
          } else {
              console.warn("NFT_CONTRACT_ADDRESS tanımlı değil, NFT filtrelemesi yapılamadı!");
              filteredOwnedNfts = allNftsFromAlchemy;
          }
          setAllOwnedNfts(filteredOwnedNfts);

          const uniqueNftCollections = new Map<string, SelectableAsset>();
          for (const nft of filteredOwnedNfts) {
              const collectionAddress = nft.contract.address;
               if (!uniqueNftCollections.has(collectionAddress)) {
                   const nftAsset : SelectableAsset = {
                       name: nft.contract.name ?? nft.contract.openSea?.collectionName ?? 'Bilinmeyen Koleksiyon',
                       address: collectionAddress,
                       symbol: nft.contract.symbol ?? nft.contract.openSea?.collectionName ?? 'NFT',
                       type: 'ERC721',
                       logo: nft.contract.openSea?.imageUrl ?? null,
                   };
                   uniqueNftCollections.set(collectionAddress, nftAsset);
               }
          }
          console.log(`${uniqueNftCollections.size} benzersiz (filtrelenmiş) NFT koleksiyonu bulundu.`);

          finalAvailableAssets = [...resolvedTokens, ...Array.from(uniqueNftCollections.values())];
          setAvailableAssets(finalAvailableAssets);
          console.log("Son 'availableAssets' state'i ayarlandı:", finalAvailableAssets);
          fetchSuccess = true;

      } catch (error) {
          console.error("fetchWalletAssets içinde HATA oluştu:", error);
          showMessage(`Varlıklar alınırken hata: ${formatError(error)}`, "error");
          setAvailableAssets([]); setAllOwnedNfts([]);
          fetchSuccess = false;
      } finally {
          setIsFetchingAssets(false);
          if (fetchSuccess && message && typeof message.text === 'string' && message.text.includes("yükleniyor")) {
              const totalAssetsFound = finalAvailableAssets.length;
              showMessage(totalAssetsFound > 0 ? `${totalAssetsFound} varlık türü bulundu.` : "Bu adreste paketlenecek varlık bulunamadı.", "info");
          }
          console.log("fetchWalletAssets tamamlandı.");
      }
  }, [ address, alchemy, showMessage, clearMessage, isRefreshAssetsDisabled, isConnected, formatError ]);

  useEffect(() => { return () => { if (refreshAssetsTimeoutRef.current) { clearTimeout(refreshAssetsTimeoutRef.current); } }; }, []);
  useEffect(() => { if (isConnected && address) { fetchWalletAssets(); } else { setAvailableAssets([]); setAllOwnedNfts([]); } }, [isConnected, address]);

  useEffect(() => {
      // ... (NFT Filtreleme useEffect - önceki haliyle aynı) ...
      console.log("SelectedAssetInfo veya AllOwnedNfts değişti. SelectedAssetInfo:", selectedAssetInfo);
      console.log("Mevcut allOwnedNfts sayısı:", allOwnedNfts.length);
      if (selectedAssetInfo) {
        if (selectedAssetInfo.type === 'ERC721') {
          console.log(`Filtreleme başlıyor: Koleksiyon Adresi = ${selectedAssetInfo.address}`);
          setErc20Balance(null); setErc20Amount("");
          const filteredNfts = allOwnedNfts.filter(nft => {
              const nftContractAddrLower = nft.contract.address?.toLowerCase();
              const selectedAddrLower = selectedAssetInfo.address?.toLowerCase();
              return nftContractAddrLower === selectedAddrLower;
          });
          console.log("Filtreleme sonucu (filteredNfts):", filteredNfts);
          setNftsInSelectedCollection(filteredNfts);
          setSelectedNftTokenId("");
          console.log("nftsInSelectedCollection state'i güncellendi.");
        } else { // ERC20
           console.log("ERC20 seçildi...");
           setErc20Balance(selectedAssetInfo.balance ?? null);
           setNftsInSelectedCollection([]);
           setSelectedNftTokenId("");
        }
      } else {
          console.log("Seçili varlık yok...");
          setErc20Balance(null);
          setNftsInSelectedCollection([]);
          setSelectedNftTokenId("");
          setErc20Amount("");
      }
  }, [selectedAssetInfo, allOwnedNfts]);


  // --- Olay Yöneticileri ---
  const addAssetToList = () => {
      // ... (önceki addAssetToList kodu - değişiklik yok) ...
       console.log("addAssetToList çağrıldı.");
      clearMessage();
      console.log("Seçili Varlık Bilgisi:", selectedAssetInfo);
      if (!selectedAssetInfo) { console.log("Varlık seçilmedi."); showMessage("Lütfen bir varlık seçin.", "error"); return; }
      let idOrAmountToAdd: string; let isNftAsset: boolean;
      if (selectedAssetInfo.type === 'ERC721') {
          console.log("Seçili varlık tipi: ERC721. Seçilen NFT ID:", selectedNftTokenId);
          if (!selectedNftTokenId) { console.log("NFT ID seçilmedi."); showMessage("Lütfen koleksiyondan bir NFT seçin.", "error"); return; }
          const alreadyAdded = assetsToWrap.some(a => a.isNFT && a.address.toLowerCase() === selectedAssetInfo.address.toLowerCase() && a.idOrAmount === selectedNftTokenId);
          if(alreadyAdded) { showMessage("Bu NFT zaten listede.", "info"); return; }
          idOrAmountToAdd = selectedNftTokenId; isNftAsset = true;
          console.log("NFT eklenecek:", idOrAmountToAdd);
      } else { // ERC20
          console.log("Seçili varlık tipi: ERC20. Girilen Miktar:", erc20Amount);
          if (!erc20Amount) { console.log("Miktar girilmedi."); showMessage("Lütfen geçerli bir miktar girin.", "error"); return; }
          let amountValue: number; let amountBigInt: bigint; const decimals = selectedAssetInfo.decimals ?? 18;
          try { const cleanedAmount = erc20Amount.replace(',', '.'); amountValue = parseFloat(cleanedAmount); if (isNaN(amountValue) || amountValue <= 0) { console.log("Geçersiz miktar."); showMessage("Geçerli pozitif bir Miktar girin.", "error"); return; } amountBigInt = parseUnits(cleanedAmount, decimals); }
          catch (e) { console.log("Miktar parse hatası:", e); showMessage("Geçersiz miktar formatı.", "error"); return; }
          if (erc20Balance !== null) { try { const cleanedBalance = erc20Balance.replace(',', '.'); const balanceBigInt = parseUnits(cleanedBalance, decimals); console.log("Bakiye kontrolü: İstenen:", amountBigInt.toString(), "Mevcut:", balanceBigInt.toString()); if (amountBigInt > balanceBigInt) { console.log("Yetersiz bakiye."); showMessage(`Yetersiz ${selectedAssetInfo.symbol ?? 'token'} bakiyesi!`, "error"); return; } }
              catch (e) { console.error("Bakiye karşılaştırma hatası:", e); } } else { console.warn("Bakiye kontrolü için bakiye bilgisi bulunamadı."); }
          idOrAmountToAdd = erc20Amount; isNftAsset = false;
          console.log("ERC20 eklenecek Miktar:", idOrAmountToAdd);
      }
      const newAsset: AssetToWrapInternal = { ...selectedAssetInfo, idOrAmount: idOrAmountToAdd, isNFT: isNftAsset, };
      console.log("Oluşturulan yeni varlık objesi:", newAsset);
      setAssetsToWrap(currentAssets => { const updatedAssets = [...currentAssets, newAsset]; console.log("AssetsToWrap state'i güncelleniyor. Yeni liste:", updatedAssets); return updatedAssets; });
      console.log("Giriş alanları sıfırlanıyor.");
      setErc20Amount(''); setSelectedNftTokenId('');
  };

  const removeAssetFromList = (indexToRemove: number) => {
     // ... (Öncekiyle aynı) ...
      setAssetsToWrap(currentAssets => currentAssets.filter((_, index) => index !== indexToRemove));
      clearMessage();
  };

  // *** handleWrap DÜZELTİLDİ (ERC721 Onay Kontrolü) ***
  const handleWrap = async () => {
      console.log("handleWrap tetiklendi!");
      clearMessage();

      // Başlangıç kontrolleri (signer, adres, kontratlar, varlık listesi)
      if (!signer || !address) { showMessage("Lütfen cüzdanınızı bağlayın.", "error"); console.error("handleWrap: Signer veya adres bulunamadı."); return; }
      if (!nftWrapperContract) { showMessage("NFT Wrapper kontratı yüklenemedi.", "error"); console.error("handleWrap: nftWrapperContract bulunamadı."); return; }
       if (!VAULT_CONTRACT_ADDRESS || !isAddress(VAULT_CONTRACT_ADDRESS)) { showMessage("Vault kontrat adresi geçersiz veya yapılandırılmamış.", "error"); console.error("handleWrap: VAULT_CONTRACT_ADDRESS geçersiz."); return; }
      if (assetsToWrap.length === 0) { showMessage("Lütfen paketlemek için en az bir varlık ekleyin.", "error"); console.error("handleWrap: assetsToWrap boş."); return; }
      if (isLoading) { console.warn("handleWrap: Zaten devam eden bir işlem var."); return; }

      setIsLoading(true);
      showMessage("Paketleme işlemi başlatılıyor...", "info");

      try {
          // 1. Adım: Varlıkları formatla
          console.log("Varlıklar formatlanıyor...");
          const formattedAssets: FormattedAsset[] = [];
          for (const asset of assetsToWrap) {
              let idOrAmountBigInt: bigint;
              if (asset.isNFT) { try { idOrAmountBigInt = toBigInt(asset.idOrAmount); } catch (e) { throw new Error(`NFT ID '${asset.idOrAmount}' (${asset.name}) dönüştürülemedi.`); } }
              else { const decimals = asset.decimals ?? 18; try { idOrAmountBigInt = parseUnits(asset.idOrAmount.replace(',', '.'), decimals); } catch (e) { throw new Error(`Miktar '${asset.idOrAmount}' (${asset.name}) dönüştürülemedi.`); } }
              formattedAssets.push({ contractAddress: asset.address, idOrAmount: idOrAmountBigInt, isNFT: asset.isNFT });
          }
          console.log("Formatlanmış varlıklar:", formattedAssets);

          // 2. Adım: Onaylar
          console.log("Onaylar kontrol ediliyor/alınıyor...");
          showMessage("Token onayları kontrol ediliyor...", "info");
          const spender = VAULT_CONTRACT_ADDRESS; // Onay verilecek adres (Vault)

          for (let i = 0; i < formattedAssets.length; i++) {
              const asset = formattedAssets[i];
              const originalAssetInfo = assetsToWrap[i];

              if (asset.isNFT) { // --- ERC721 Onay Mantığı Başlangıcı ---
                  console.log(`ERC721 Onayı Kontrol: ${originalAssetInfo.name} ID: ${asset.idOrAmount}`);
                  const nftContract = new Contract(asset.contractAddress, erc721Abi, signer);
                  let needsApprovalTransaction = false; // Onay işlemi göndermemiz gerekiyor mu?
                  let alreadyApprovedForAll = false; // Zaten hepsi için onay verilmiş mi?

                  // Adım 2a: isApprovedForAll kontrolü (Genellikle daha güvenilir)
                  try {
                      alreadyApprovedForAll = await nftContract.isApprovedForAll(address, spender);
                      console.log(`  -> isApprovedForAll (${spender}): ${alreadyApprovedForAll}`);
                  } catch (isApprovedForAllError: any) {
                      console.warn(`isApprovedForAll çağrısı başarısız oldu (${originalAssetInfo.name}): ${isApprovedForAllError.message}. Diğer kontroller denenecek.`);
                      alreadyApprovedForAll = false; // Emin olamadığımız için false kabul edelim
                  }

                  // Adım 2b: Eğer hepsi için onay yoksa, tekil onayı (getApproved) dene
                  if (!alreadyApprovedForAll) {
                      try {
                          const approvedAddress = await nftContract.getApproved(asset.idOrAmount);
                          console.log(`  -> getApproved: ${approvedAddress}`);
                          if (approvedAddress?.toLowerCase() !== spender.toLowerCase()) {
                              // Tekil onay da yok veya yanlış adrese verilmiş
                              needsApprovalTransaction = true;
                          } else {
                              console.log(`  -> Tekil onay (${spender}) zaten mevcut.`);
                          }
                      } catch (getApprovedError: any) {
                          // *** BURASI ÖNCEKİ HATANIN OLDUĞU YER ***
                          console.warn(`getApproved çağrısı başarısız oldu (${originalAssetInfo.name} ID: ${asset.idOrAmount}): ${getApprovedError.message}.`);
                          console.warn(`  -> Bu kontrat getApproved'u desteklemiyor veya revert oluyor olabilir. setApprovalForAll denenecek.`);
                          // getApproved başarısız olursa, tekil onayın olmadığını varsaymak yerine
                          // doğrudan setApprovalForAll denememiz gerekir.
                          needsApprovalTransaction = true;
                      }
                  }

                  // Adım 2c: Eğer onay işlemi gerekiyorsa (ve zaten hepsi için onay yoksa)
                  if (needsApprovalTransaction && !alreadyApprovedForAll) {
                      console.log(`  -> ${originalAssetInfo.name} için setApprovalForAll (${spender}) deneniyor.`);
                      showMessage(`${originalAssetInfo.name} NFT için onay bekleniyor...`, "info");
                      try {
                          const approvalTx = await nftContract.setApprovalForAll(spender, true);
                          showMessage(`${originalAssetInfo.name} NFT onayı gönderildi (${approvalTx.hash})...`, "info");
                          const approvalReceipt = await approvalTx.wait();
                          if (!approvalReceipt || approvalReceipt.status !== 1) {
                              // İşlem revert olduysa veya başarısızsa hata fırlat
                              throw new Error(`${originalAssetInfo.name} NFT için setApprovalForAll işlemi başarısız oldu.`);
                          }
                          console.log(`  -> ${originalAssetInfo.name} NFT onayı (setApprovalForAll) başarılı.`);
                          // Onay başarılı olduğu için artık tekrar kontrol etmeye gerek yok
                      } catch (approvalError: any) {
                           // setApprovalForAll işlemi sırasında hata olursa (revert vs.)
                           console.error(`setApprovalForAll işlemi hatası (${originalAssetInfo.name}):`, approvalError);
                           throw new Error(`${originalAssetInfo.name} NFT onayı alınamadı: ${approvalError.message || 'İşlem başarısız'}`);
                      }
                  } else if (!needsApprovalTransaction) {
                       console.log(`  -> ${originalAssetInfo.name} NFT için onay mevcut.`);
                  }
                 // --- ERC721 Onay Mantığı Sonu ---

              } else { // --- ERC20 Onay Mantığı Başlangıcı ---
                  console.log(`ERC20 Onayı Kontrol: ${originalAssetInfo.name} Miktar: ${formatUnits(asset.idOrAmount, originalAssetInfo.decimals ?? 18)}`);
                  const erc20Contract = new Contract(asset.contractAddress, erc20Abi, signer);
                  try {
                      const currentAllowance = await erc20Contract.allowance(address, spender);
                      console.log(`  -> Mevcut allowance: ${currentAllowance.toString()}, Gereken: ${asset.idOrAmount.toString()}`);
                      if (currentAllowance < asset.idOrAmount) {
                          console.log(`  -> ${originalAssetInfo.name} için Onay Gerekiyor.`);
                          showMessage(`${originalAssetInfo.name} onayı bekleniyor...`, "info");
                          const approvalTx = await erc20Contract.approve(spender, MaxUint256);
                          showMessage(`${originalAssetInfo.name} onayı gönderildi (${approvalTx.hash})...`, "info");
                          const approvalReceipt = await approvalTx.wait();
                          if (!approvalReceipt || approvalReceipt.status !== 1) throw new Error(`${originalAssetInfo.name} onayı başarısız.`);
                          console.log(`  -> ${originalAssetInfo.name} onayı başarılı.`);
                      } else { console.log(`  -> ${originalAssetInfo.name} için onay mevcut.`); }
                  } catch (err: any) { console.error(`ERC20 onay hatası (${originalAssetInfo.name}):`, err); throw new Error(`${originalAssetInfo.name} onayı alınamadı: ${err.message || 'İşlem başarısız'}`); }
                 // --- ERC20 Onay Mantığı Sonu ---
              }
          } // Onay döngüsü sonu
          console.log("Tüm onaylar tamamlandı veya denendi.");

          // 3. Adım: wrapAssets Çağrısı
          console.log("wrapAssets fonksiyonu çağrılıyor...");
          showMessage("Varlıklar paketleniyor... Cüzdanınızı kontrol edin.", "info");
          const txOptions = { value: WRAPPER_FEE_WEI };
          const wrapTx = await nftWrapperContract.wrapAssets(formattedAssets, txOptions);
          showMessage(`Paketleme işlemi gönderildi (${wrapTx.hash})...`, "info");
          const receipt = await wrapTx.wait();

          if (receipt && receipt.status === 1) {
              console.log("Paketleme başarılı!", receipt);
              const txLink = `${BLOCK_EXPLORER_URL}/tx/${receipt.hash}`;
              setAssetsToWrap([]);
              showMessage(<span> Başarıyla paketlendi! <a href={txLink} target="_blank" rel="noopener noreferrer">İşlemi Görüntüle</a></span>, "success");
          } else {
              console.error("Paketleme işlemi başarısız oldu:", receipt);
              throw new Error(`Paketleme işlemi başarısız oldu. Tx: ${wrapTx.hash ?? 'N/A'}`);
          }
      } catch (error: any) {
          console.error("handleWrap içinde HATA:", error);
          // formatError içinde zaten console.error var, tekrar loglamaya gerek yok
          showMessage(formatError(error), "error");
      } finally {
          console.log("handleWrap tamamlandı, isLoading false yapılıyor.");
          setIsLoading(false);
      }
  };
  // --- Olay Yöneticileri Sonu ---


  // --- JSX (Render) ---
  return (
    <div className="wrap-form-section">
      <h3 className="section-title">Varlıkları Paketle (Base Mainnet)</h3>
      {!isConnected ? (
           <div className={`message-area info visible`}><small>Varlıkları görmek ve işlem yapmak için lütfen cüzdanınızı bağlayın.</small></div>
      ) : (
         <>
              {/* ... JSX'in geri kalanı öncekiyle aynı ... */}
               {/* 1. Adım: Varlık Türü Seçimi */}
              <div className="form-group">
                   <label htmlFor="asset-select">Varlık Seç (ERC20 veya NFT Koleksiyonu):</label>
                   <div className="input-group">
                        <select id="asset-select" value={selectedAssetAddress} onChange={(e) => { setSelectedAssetAddress(e.target.value); clearMessage(); }} disabled={isLoading || isFetchingAssets || !isConnected}>
                            <option value="" disabled> {isFetchingAssets ? "Yükleniyor..." : (availableAssets.length === 0 && !message?.text.toString().toLowerCase().includes("hata") ? "Varlık bulunamadı" : (message?.text.toString().toLowerCase().includes("hata")? "Varlıklar yüklenemedi": "-- Bir varlık seçin --"))} </option>
                            {availableAssets.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((asset) => (<option key={asset.address} value={asset.address}>{asset.name ?? 'İsimsiz Varlık'} ({asset.symbol ?? '??'}) - {asset.type}</option>))}
                        </select>
                        <button className="refresh-button" onClick={() => fetchWalletAssets(true)} disabled={isLoading || isFetchingAssets || !isConnected || isRefreshAssetsDisabled} title={isRefreshAssetsDisabled ? "Bekleyin..." : "Listeyi Yenile"}>
                             {isFetchingAssets ? '⏳' : (isRefreshAssetsDisabled ? 'Bekle' : 'Yenile')}
                        </button>
                   </div>
                   <div style={{minHeight: '20px'}}>
                       {isFetchingAssets && <span className="loading-spinner" style={{visibility: isFetchingAssets ? 'visible' : 'hidden'}}><small>Liste yenileniyor...</small></span>}
                   </div>
               </div>

               {/* 2. Adım: Detay Seçimi */}
               {selectedAssetInfo && (
                    <div className="form-group">
                        {selectedAssetInfo.type === 'ERC20' && ( <> <label htmlFor="erc20-amount">Miktar:</label> <div className="input-with-button"> <input id="erc20-amount" type="text" inputMode="decimal"
                           placeholder="Miktar girin" value={erc20Amount} onChange={(e) => setErc20Amount(e.target.value)} disabled={isLoading || isFetchingAssets} /> </div> {erc20Balance !== null && (<span className="balance-info">(Bakiye: {formatDisplayNumber(erc20Balance, 4)})</span>)} </> )}
                        {selectedAssetInfo.type === 'ERC721' && ( <> <label htmlFor="nft-select">Paketlenecek NFT'yi Seç:</label> <div className="input-with-button"> <select id="nft-select" value={selectedNftTokenId} onChange={(e) => { setSelectedNftTokenId(e.target.value); }} disabled={isLoading || isFetchingAssets || nftsInSelectedCollection.length === 0}> <option value="" disabled>{nftsInSelectedCollection.length === 0 ? "Bu koleksiyonda NFT yok" : "-- NFT Seçin --"}</option> {/* NftHolding tipindeki nft.name doğrudan kullanılamaz, gerekirse fetch edilmeli */} {nftsInSelectedCollection.map(nft => (<option key={nft.tokenId} value={nft.tokenId}>ID: {nft.tokenId} {/* nft.name burada olmayabilir */}</option>))} </select> </div> </> )}
                         <button onClick={addAssetToList} disabled={isLoading || isFetchingAssets || !selectedAssetInfo || (selectedAssetInfo.type === 'ERC20' && !erc20Amount) || (selectedAssetInfo.type === 'ERC721' && !selectedNftTokenId) } style={{marginTop: 'var(--spacing-md)'}}>Listeye Ekle</button>
                    </div>
               )}

               <h4 className="section-title" style={{ marginTop: 'var(--spacing-lg)' }}>Paketlenecek Varlıklar:</h4>
               {assetsToWrap.length === 0 ? ( <p><small>Henüz varlık eklenmedi.</small></p> ) : ( <ul className="asset-list"> {assetsToWrap.map((asset, index) => { const assetLink = `${BLOCK_EXPLORER_URL}/${asset.isNFT ? 'nft' : 'token'}/${asset.address}${asset.isNFT ? '?a='+asset.idOrAmount : ''}`; return ( <li key={`${asset.address}-${asset.idOrAmount}-${index}`}> {asset.logo && <img src={asset.logo} alt={asset.symbol ?? ''} className="asset-logo" onError={(e) => e.currentTarget.style.display = 'none'}/>} {!asset.logo && <div className="asset-logo" style={{backgroundColor: '#333'}} />} <div className="asset-info"> <a href={assetLink} target="_blank" rel="noopener noreferrer" title={asset.address} className="asset-name">{asset.name ?? asset.address.substring(0,6)+'...'} ({asset.symbol ?? '??'})</a> <span className="asset-details">{asset.isNFT ? `ID: ${asset.idOrAmount}` : ` Miktar: ${formatDisplayNumber(asset.idOrAmount, 4)}`}</span> </div> <div className="asset-actions"><button onClick={() => removeAssetFromList(index)} disabled={isLoading || isFetchingAssets} title="Listeden Kaldır">X</button></div> </li> ); })} </ul> )}
               <div className="action-button-group">
                    {assetsToWrap.length > 0 && (<p style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-sm)' }}>Paketleme Ücreti: {WRAPPER_FEE_DISPLAY} ETH (+ Gas)</p>)}
                    <button onClick={handleWrap} disabled={isLoading || isFetchingAssets || !signer || assetsToWrap.length === 0} >{isLoading ? 'İşlem Sürüyor... ⏳' : `Paketle (${assetsToWrap.length} Varlık)`}</button>
               </div>
         </>
      )}
      {/* Mesaj Alanı (Visibility ile) */}
      <div className={`message-area ${message?.type ?? ''} ${message ? 'visible' : ''}`}>
          {message && <small>{typeof message.text === 'string' ? message.text : message.text}</small>}
      </div>
    </div>
  );
}

export default WrapForm;