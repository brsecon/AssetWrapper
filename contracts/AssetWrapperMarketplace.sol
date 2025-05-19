// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";

interface IERC20Minimal {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract AssetWrapperMarketplace is Ownable, ReentrancyGuard {
    IERC721 public immutable assetWrapperContract;
    IERC20Minimal public immutable wethTokenContract; // WETH token adresi
    uint256 private _listingCounter;
    uint256 private _wethOfferCounter;
    uint256 private _nftSwapOfferCounter; // Eklendi

    struct Listing {
        uint256 listingId;
        address seller;
        uint256 tokenId;
        uint256 price; // ETH cinsinden fiyat
        bool active;
    }

    struct WETHOffer {
        uint256 offerId;
        address offerer; // Teklifi yapan (alıcı)
        uint256 targetTokenId; // Almak istediği AssetWrapper NFT'nin ID'si
        uint256 wethAmount; // Teklif edilen WETH miktarı
        bool active;
        // uint256 expirationTimestamp; // Opsiyonel: Teklifin son geçerlilik tarihi
    }

    // Eklendi: NFT-NFT Takas Teklifi Yapısı
    struct NFTSwapOffer {
        uint256 offerId;
        address offerer; // Teklifi yapan (kendi NFT'sini veren)
        address offeredNFTContractAddress; // Teklif edilen NFT'nin kontrat adresi
        uint256 offeredNFTTokenId; // Teklif edilen NFT'nin ID'si
        uint256 targetAssetWrapperTokenId; // Karşılığında istenen AssetWrapper NFT'nin ID'si
        bool active;
    }

    // Listing ID => Listing Detayları
    mapping(uint256 => Listing) public listings;
    // AssetWrapper Token ID => Aktif Listing ID (ETH ile satış için)
    mapping(uint256 => uint256) public activeListingIdByTokenId;

    // WETHOffer ID => WETHOffer Detayları
    mapping(uint256 => WETHOffer) public wethOffers;
    // AssetWrapper Token ID => Bu tokene yapılmış aktif WETH tekliflerinin ID listesi
    mapping(uint256 => uint256[]) public activeWETHOfferIdsByTargetTokenId;
    // AssetWrapper Token ID => Offerer Adresi => Aktif WETH Teklif ID'si (Mükerrer teklif kontrolü için)
    mapping(uint256 => mapping(address => uint256)) public activeWETHOfferIdByTokenIdAndOfferer;

    // NFTSwapOffer ID => NFTSwapOffer Detayları (Eklendi)
    mapping(uint256 => NFTSwapOffer) public nftSwapOffers;
    // AssetWrapper Token ID => Bu tokene yapılmış aktif NFT takas tekliflerinin ID listesi (Eklendi)
    mapping(uint256 => uint256[]) public activeNFTSwapOfferIdsByTargetTokenId;


    uint256 public marketplaceFeePercent; // Örneğin, %1 için 1, %2.5 için 25 (1000 üzerinden)
    uint16 public constant FEE_PRECISION = 1000; // Ücret hassasiyeti (Örn: %2.5 için 25 girilir, 25/1000)
    address payable public feeRecipient;

    event ItemListed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemSold(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 tokenId,
        uint256 price,
        uint256 marketplaceFee
    );

    event ListingCancelled(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId
    );

    // WETH Teklif Olayları
    event WETHOfferMade(
        uint256 indexed offerId,
        address indexed offerer,
        uint256 indexed targetTokenId,
        uint256 wethAmount
    );

    event WETHOfferAccepted(
        uint256 indexed offerId,
        address indexed offerer, // Alıcı
        address seller, // Satıcı (NFT'nin önceki sahibi) - Artık indexed değil
        uint256 indexed targetTokenId,
        uint256 wethAmount,
        uint256 marketplaceFee
    );

    event WETHOfferCancelled(
        uint256 indexed offerId,
        address indexed offerer,
        uint256 indexed targetTokenId
    );

    // NFT Takas Teklif Olayları (Eklendi)
    event NFTSwapOfferMade(
        uint256 indexed offerId,
        address indexed offerer,
        address offeredNFTContractAddress, // Tipi address olarak düzeltildi
        uint256 indexed offeredNFTTokenId,
        uint256 targetAssetWrapperTokenId
    );

    event NFTSwapOfferAccepted(
        uint256 indexed offerId,
        address indexed originalOfferer, // Takas teklifini yapan
        address indexed originalTargetOwner, // AssetWrapper NFT'nin önceki sahibi
        address offeredNFTContractAddress, // Tipi address olarak düzeltildi
        uint256 offeredNFTTokenId,
        uint256 targetAssetWrapperTokenId
    );

    event NFTSwapOfferCancelled(
        uint256 indexed offerId,
        address indexed offerer,
        uint256 targetAssetWrapperTokenId
    );


    event MarketplaceFeeUpdated(uint256 newFeePercent);
    event FeeRecipientUpdated(address newRecipient);

    modifier isListingActive(uint256 listingId) {
        require(listings[listingId].active, "Marketplace: Listing is not active");
        _;
    }

    modifier isWETHOfferActive(uint256 offerId) {
        require(wethOffers[offerId].active, "Marketplace: WETH Offer is not active");
        _;
    }

    modifier isNFTSwapOfferActive(uint256 offerId) {
        require(nftSwapOffers[offerId].active, "Marketplace: NFT Swap Offer is not active");
        _;
    }

    modifier onlyListingSeller(uint256 listingId) {
        require(listings[listingId].seller == _msgSender(), "Marketplace: Caller is not the seller of the listing");
        _;
    }

    modifier onlyWETHOfferer(uint256 offerId) {
        require(wethOffers[offerId].offerer == _msgSender(), "Marketplace: Caller is not the WETH offerer");
        _;
    }

    modifier onlyNFTSwapOfferer(uint256 offerId) {
        require(nftSwapOffers[offerId].offerer == _msgSender(), "Marketplace: Caller is not the NFT Swap offerer");
        _;
    }

    constructor(
        address _assetWrapperAddress,
        address _wethTokenAddress, // Eklendi
        address payable _initialFeeRecipient,
        uint256 _initialMarketplaceFeePercent // Örneğin %1 için 10, %2.5 için 25 (FEE_PRECISION=1000)
    ) Ownable(_msgSender()) {
        require(_assetWrapperAddress != address(0), "Marketplace: Invalid AssetWrapper address");
        require(_wethTokenAddress != address(0), "Marketplace: Invalid WETH token address"); // Eklendi
        require(_initialFeeRecipient != address(0), "Marketplace: Invalid fee recipient address");
        require(_initialMarketplaceFeePercent <= 100, "Marketplace: Fee cannot exceed 10%"); // FEE_PRECISION'a göre %10 = 100

        assetWrapperContract = IERC721(_assetWrapperAddress);
        wethTokenContract = IERC20Minimal(_wethTokenAddress); // Eklendi
        feeRecipient = _initialFeeRecipient;
        marketplaceFeePercent = _initialMarketplaceFeePercent;
        _listingCounter = 0;
        _wethOfferCounter = 0; // Eklendi
        _nftSwapOfferCounter = 0; // Eklendi
    }

    // --- Yönetici Fonksiyonları ---
    function setMarketplaceFeePercent(uint256 _newFeePercent) external onlyOwner {
        require(_newFeePercent <= 100, "Marketplace: Fee cannot exceed 10%"); // %10 sınırı
        marketplaceFeePercent = _newFeePercent;
        emit MarketplaceFeeUpdated(_newFeePercent);
    }

    function setFeeRecipient(address payable _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Marketplace: Invalid new fee recipient");
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(_newRecipient);
    }

    // Pazar yerinde biriken ETH'yi çekmek için (eğer direkt gönderilmiyorsa)
    // Şu anki tasarımda ücretler direkt feeRecipient'a gidiyor, bu yüzden bu fonksiyon gerekmeyebilir
    // Ancak ilerideki tasarımlar için veya yanlışlıkla kontrata ETH gönderilirse diye eklenebilir.
    // Bu fonksiyon sadece ETH için, WETH ücretleri doğrudan feeRecipient'a transfer edilecek.
    function withdrawETHFees() external onlyOwner { // withdrawFees -> withdrawETHFees olarak yeniden adlandırıldı
        uint256 balance = address(this).balance;
        require(balance > 0, "Marketplace: No ETH fees to withdraw");
        (bool success, ) = feeRecipient.call{value: balance}("");
        require(success, "Marketplace: ETH Fee withdrawal failed");
    }

    // --- Çekirdek Pazar Yeri Fonksiyonları (ETH ile Satış) ---
    function listNFT(uint256 _tokenId, uint256 _price) external nonReentrant {
        require(_price > 0, "Marketplace: Price must be greater than zero");
        require(assetWrapperContract.ownerOf(_tokenId) == _msgSender(), "Marketplace: You do not own this NFT");
        require(activeListingIdByTokenId[_tokenId] == 0, "Marketplace: Token already listed");

        // Pazar yerinin NFT'yi transfer edebilmesi için onay kontrolü
        // Ya bu kontrat için genel onay (isApprovedForAll) ya da spesifik token için onay (getApproved)
        bool approved =
            assetWrapperContract.isApprovedForAll(_msgSender(), address(this)) ||
            assetWrapperContract.getApproved(_tokenId) == address(this);
        require(approved, "Marketplace: Contract not approved to transfer this NFT");

        _listingCounter++;
        uint256 newListingId = _listingCounter;

        listings[newListingId] = Listing({
            listingId: newListingId,
            seller: _msgSender(),
            tokenId: _tokenId,
            price: _price,
            active: true
        });

        activeListingIdByTokenId[_tokenId] = newListingId;

        emit ItemListed(newListingId, _msgSender(), _tokenId, _price);
    }

    function cancelListing(uint256 _listingId) external nonReentrant onlyListingSeller(_listingId) isListingActive(_listingId) {
        Listing storage listingToCancel = listings[_listingId];
        uint256 tokenId = listingToCancel.tokenId;

        listingToCancel.active = false;
        delete activeListingIdByTokenId[tokenId]; // Veya activeListingIdByTokenId[tokenId] = 0;

        // Alternatif olarak, listelemeyi tamamen silebiliriz:
        // delete listings[_listingId];
        // Ancak `active = false` yapmak, geçmiş listelemelerin kaydını tutar.
        // Eğer tamamen silmek istenirse, `getListing` fonksiyonu hata verebilir.
        // Şimdilik `active = false` olarak bırakalım.

        emit ListingCancelled(_listingId, _msgSender(), tokenId);
    }

    function buyNFT(uint256 _listingId) external payable nonReentrant isListingActive(_listingId) {
        // --- CHECKS ---
        Listing storage listingToBuy = listings[_listingId];
        address seller = listingToBuy.seller;
        uint256 tokenId = listingToBuy.tokenId;
        uint256 price = listingToBuy.price;
        require(_msgSender() != seller, "Marketplace: Seller cannot buy their own NFT");
        require(msg.value == price, "Marketplace: Please send the exact price of the NFT");

        // --- EFFECTS ---
        listingToBuy.active = false;
        delete activeListingIdByTokenId[tokenId];

        // Potansiyel DoS nedeniyle otomatik teklif iptali kaldırıldı.
        // Teklif sahipleri (WETH veya NFT Takas) kendi tekliflerini manuel olarak iptal etmelidir.

        uint256 marketplaceFee = 0;
        if (marketplaceFeePercent > 0) {
            marketplaceFee = (price * marketplaceFeePercent) / FEE_PRECISION;
        }
        uint256 sellerProceeds = price - marketplaceFee;

        // --- INTERACTIONS ---
        assetWrapperContract.safeTransferFrom(seller, _msgSender(), tokenId);

        if (marketplaceFee > 0) {
            (bool successFee, ) = feeRecipient.call{value: marketplaceFee}("");
            require(successFee, "Marketplace: Fee transfer failed");
        }

        (bool successSeller, ) = payable(seller).call{value: sellerProceeds}("");
        require(successSeller, "Marketplace: Seller payment failed");

        emit ItemSold(_listingId, _msgSender(), seller, tokenId, price, marketplaceFee);
    }

    // --- WETH Teklif Fonksiyonları Eklenecek ---
    function makeWETHOffer(uint256 _targetTokenId, uint256 _wethAmount) external nonReentrant {
        require(_wethAmount > 0, "Marketplace: WETH amount must be greater than zero");
        address targetNFTOwner = assetWrapperContract.ownerOf(_targetTokenId);
        require(targetNFTOwner != address(0), "Marketplace: Target NFT does not exist or owner is zero address");
        require(targetNFTOwner != _msgSender(), "Marketplace: Cannot make an offer on your own NFT");

        // Kullanıcının bu kontrata yeterli WETH için approve verdiğini kontrol et
        uint256 allowance = wethTokenContract.allowance(_msgSender(), address(this));
        require(allowance >= _wethAmount, "Marketplace: WETH allowance too low. Approve WETH first.");

        // Bir kullanıcı aynı token için birden fazla aktif WETH teklifi yapamasın (O(1) kontrol)
        require(activeWETHOfferIdByTokenIdAndOfferer[_targetTokenId][_msgSender()] == 0, "Marketplace: You already have an active WETH offer for this token");

        _wethOfferCounter++;
        uint256 newOfferId = _wethOfferCounter;

        wethOffers[newOfferId] = WETHOffer({
            offerId: newOfferId,
            offerer: _msgSender(),
            targetTokenId: _targetTokenId,
            wethAmount: _wethAmount,
            active: true
        });

        activeWETHOfferIdsByTargetTokenId[_targetTokenId].push(newOfferId);
        activeWETHOfferIdByTokenIdAndOfferer[_targetTokenId][_msgSender()] = newOfferId;

        emit WETHOfferMade(newOfferId, _msgSender(), _targetTokenId, _wethAmount);
    }

    function cancelWETHOffer(uint256 _offerId) external nonReentrant onlyWETHOfferer(_offerId) isWETHOfferActive(_offerId) {
        WETHOffer storage offerToCancel = wethOffers[_offerId];
        uint256 targetTokenId = offerToCancel.targetTokenId;

        offerToCancel.active = false;
        delete activeWETHOfferIdByTokenIdAndOfferer[targetTokenId][offerToCancel.offerer];

        // activeWETHOfferIdsByTargetTokenId listesinden bu offerId'yi kaldır
        uint256[] storage offerIds = activeWETHOfferIdsByTargetTokenId[targetTokenId];
        for (uint i = 0; i < offerIds.length; i++) {
            if (offerIds[i] == _offerId) {
                offerIds[i] = offerIds[offerIds.length - 1];
                offerIds.pop();
                break;
            }
        }

        emit WETHOfferCancelled(_offerId, _msgSender(), targetTokenId);
    }

    function acceptWETHOffer(uint256 _offerId) external nonReentrant isWETHOfferActive(_offerId) {
        // --- CHECKS ---
        WETHOffer storage offerToAccept = wethOffers[_offerId];
        address offerer = offerToAccept.offerer;
        uint256 targetTokenId = offerToAccept.targetTokenId;
        uint256 wethAmount = offerToAccept.wethAmount;
        address targetNFTOwner = assetWrapperContract.ownerOf(targetTokenId);
        require(targetNFTOwner == _msgSender(), "Marketplace: Only the NFT owner can accept this WETH offer");
        require(offerer != _msgSender(), "Marketplace: Cannot accept your own WETH offer");

        // --- EFFECTS ---
        offerToAccept.active = false;
        delete activeWETHOfferIdByTokenIdAndOfferer[targetTokenId][offerer]; // Kabul edilen teklifin özel mapping'ini temizle

        // Potansiyel DoS nedeniyle otomatik teklif iptali kaldırıldı.
        // Diğer WETH veya NFT Takas teklifi sahipleri kendi tekliflerini manuel olarak iptal etmelidir.

        // Bu NFT için varsa aktif ETH listelemesini de pasif yap/sil
        uint256 activeEthListingId = activeListingIdByTokenId[targetTokenId];
        if (activeEthListingId != 0) {
            Listing storage ethListing = listings[activeEthListingId];
            if (ethListing.active) {
                ethListing.active = false;
                emit ListingCancelled(activeEthListingId, ethListing.seller, targetTokenId);
            }
            delete activeListingIdByTokenId[targetTokenId];
        }

        uint256 marketplaceFee = 0;
        if (marketplaceFeePercent > 0) {
            marketplaceFee = (wethAmount * marketplaceFeePercent) / FEE_PRECISION;
        }
        uint256 sellerProceeds = wethAmount - marketplaceFee;

        // --- INTERACTIONS ---
        if (marketplaceFee > 0) {
            require(wethTokenContract.transferFrom(offerer, feeRecipient, marketplaceFee), "Marketplace: WETH fee transfer failed");
        }
        require(wethTokenContract.transferFrom(offerer, targetNFTOwner, sellerProceeds), "Marketplace: WETH seller proceeds transfer failed");

        assetWrapperContract.safeTransferFrom(targetNFTOwner, offerer, targetTokenId);

        emit WETHOfferAccepted(_offerId, offerer, targetNFTOwner, targetTokenId, wethAmount, marketplaceFee);
    }

    // --- NFT Takas Teklif Fonksiyonları (Eklendi) ---
    function makeNFTSwapOffer(
        uint256 _targetAssetWrapperTokenId, 
        address _offeredNFTContractAddress, 
        uint256 _offeredNFTTokenId
    ) external nonReentrant {
        require(_offeredNFTContractAddress != address(0), "Marketplace: Offered NFT contract address cannot be zero");

        // Teklif edilen NFT'nin sahibi msg.sender mı kontrol et
        IERC721 offeredNFT = IERC721(_offeredNFTContractAddress);
        require(offeredNFT.ownerOf(_offeredNFTTokenId) == _msgSender(), "Marketplace: You do not own the offered NFT");

        // Hedef AssetWrapper NFT'nin sahibi msg.sender olmamalı
        address targetOwner = assetWrapperContract.ownerOf(_targetAssetWrapperTokenId);
        require(targetOwner != address(0), "Marketplace: Target AssetWrapper NFT does not exist");
        require(targetOwner != _msgSender(), "Marketplace: Cannot make a swap offer for your own AssetWrapper NFT");

        // Pazar yerinin teklif edilen NFT'yi transfer etme yetkisi olmalı
        bool approvedForOfferedNFT = offeredNFT.isApprovedForAll(_msgSender(), address(this)) || 
                                     offeredNFT.getApproved(_offeredNFTTokenId) == address(this);
        require(approvedForOfferedNFT, "Marketplace: Approve this contract to transfer your offered NFT first");

        _nftSwapOfferCounter++;
        uint256 newOfferId = _nftSwapOfferCounter;

        nftSwapOffers[newOfferId] = NFTSwapOffer({
            offerId: newOfferId,
            offerer: _msgSender(),
            offeredNFTContractAddress: _offeredNFTContractAddress,
            offeredNFTTokenId: _offeredNFTTokenId,
            targetAssetWrapperTokenId: _targetAssetWrapperTokenId,
            active: true
        });

        activeNFTSwapOfferIdsByTargetTokenId[_targetAssetWrapperTokenId].push(newOfferId);

        emit NFTSwapOfferMade(newOfferId, _msgSender(), _offeredNFTContractAddress, _offeredNFTTokenId, _targetAssetWrapperTokenId);
    }

    function cancelNFTSwapOffer(uint256 _offerId) 
        external 
        nonReentrant 
        onlyNFTSwapOfferer(_offerId) 
        isNFTSwapOfferActive(_offerId) 
    {
        NFTSwapOffer storage offerToCancel = nftSwapOffers[_offerId];
        uint256 targetTokenId = offerToCancel.targetAssetWrapperTokenId;

        offerToCancel.active = false;

        uint256[] storage offerIds = activeNFTSwapOfferIdsByTargetTokenId[targetTokenId];
        for (uint i = 0; i < offerIds.length; i++) {
            if (offerIds[i] == _offerId) {
                offerIds[i] = offerIds[offerIds.length - 1];
                offerIds.pop();
                break;
            }
        }

        emit NFTSwapOfferCancelled(_offerId, _msgSender(), targetTokenId);
    }

    function acceptNFTSwapOffer(uint256 _offerId) 
        external 
        nonReentrant 
        isNFTSwapOfferActive(_offerId) 
    {
        // --- CHECKS ---
        NFTSwapOffer storage offerToAccept = nftSwapOffers[_offerId];
        address originalOfferer = offerToAccept.offerer;
        address offeredNFTContract = offerToAccept.offeredNFTContractAddress;
        uint256 offeredNFTId = offerToAccept.offeredNFTTokenId;
        uint256 targetAssetWrapperId = offerToAccept.targetAssetWrapperTokenId;
        address targetAWOwner = assetWrapperContract.ownerOf(targetAssetWrapperId);
        require(targetAWOwner == _msgSender(), "Marketplace: Only the target AssetWrapper NFT owner can accept this swap offer");
        require(originalOfferer != _msgSender(), "Marketplace: Cannot accept your own swap offer");
        bool isApprovedForTargetAW = assetWrapperContract.isApprovedForAll(targetAWOwner, address(this)) ||
                                     assetWrapperContract.getApproved(targetAssetWrapperId) == address(this);
        require(isApprovedForTargetAW, "Marketplace: Approve this contract to transfer your AssetWrapper NFT");

        // --- EFFECTS ---
        offerToAccept.active = false;

        // Potansiyel DoS nedeniyle otomatik teklif iptali kaldırıldı.
        // Diğer NFT Takas veya WETH teklifi sahipleri kendi tekliflerini manuel olarak iptal etmelidir.

        // Bu AssetWrapper NFT için varsa aktif ETH listelemesini de pasif yap/sil
        uint256 activeEthListingId = activeListingIdByTokenId[targetAssetWrapperId];
        if (activeEthListingId != 0) {
            Listing storage ethListing = listings[activeEthListingId];
            if (ethListing.active) {
                ethListing.active = false;
                emit ListingCancelled(activeEthListingId, ethListing.seller, targetAssetWrapperId);
            }
            delete activeListingIdByTokenId[targetAssetWrapperId];
        }

        // --- INTERACTIONS ---
        IERC721(offeredNFTContract).safeTransferFrom(originalOfferer, targetAWOwner, offeredNFTId);
        assetWrapperContract.safeTransferFrom(targetAWOwner, originalOfferer, targetAssetWrapperId);

        emit NFTSwapOfferAccepted(_offerId, originalOfferer, targetAWOwner, offeredNFTContract, offeredNFTId, targetAssetWrapperId);
    }

    // --- Yardımcı Fonksiyonlar ---
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getActiveListingIdForToken(uint256 tokenId) external view returns (uint256) {
        return activeListingIdByTokenId[tokenId];
    }
} 