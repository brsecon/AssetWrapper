// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Import necessary OpenZeppelin contracts (Global imports kept as requested)
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAssetWrapperVault.sol"; // Bu dosyanın projenizde doğru yerde olduğundan emin olun

/**
 * @title AssetWrapperNFT - ERC721 Token representing ownership of wrapped assets.
 * @dev Manages the lifecycle of wrapped assets and interacts with a Vault contract. Uses Custom Errors. Includes gas optimizations.
 * @notice Updated to automatically set a fixed Token URI upon minting.
 */
contract AssetWrapperNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    // --- Custom Errors ---
    error ZeroVaultAddress();
    error IncorrectFee();
    error EmptyWrapper();
    error VaultAddressNotSet();
    error ZeroAssetAddress();
    error AssetLockFailed();
    error NotOwnerOrApproved();
    error WrapperIsEmptyOrNotFound();
    error AssetUnlockFailed();
    error NoFeesToWithdraw();
    error FeeWithdrawalFailed();
    error MaxAssetsExceeded();

    // --- Constants ---
    uint256 public constant WRAPPER_FEE = 0.0005 ether;
    uint256 public constant MAX_ASSETS_PER_TX = 50; // Tek işlemde maksimum varlık sayısı

    // Simple counter for unique wrapper IDs
    uint256 private _wrapperIdCounter;

    // --- State Variables ---
    address public wrapperVaultAddress;

    // <<< YENİ: Tüm NFT'ler için kullanılacak sabit metadata URI'si >>>
    // !!! DEPLOY ETmeden ÖNCE BURAYI KENDİ METADATA URI'NİZLE GÜNCELLEYİN !!!
    string private constant FIXED_TOKEN_URI = "ipfs://bafkreif6cgi7ijkg47vbp7kmcybejyvvsdt3rtoky4tkifurvtwolyzrjm"; // Örn: "ipfs://QmSharedMetadata..."

    struct Asset {
        address contractAddress;
        uint256 idOrAmount; // tokenId for ERC721, amount for ERC20
        bool isNFT;
    }

    mapping(uint256 => Asset[]) public wrapperContents;

    // --- Events ---
    event AssetsWrapped(uint256 indexed wrapperId, address indexed owner, Asset[] assets);
    event AssetsUnwrapped(uint256 indexed wrapperId, address indexed owner);
    event WrapperVaultAddressSet(address indexed newWrapperVaultAddress);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) {
            revert ZeroVaultAddress();
        }
        if (bytes(FIXED_TOKEN_URI).length == 0) {
             // Opsiyonel: Deploy sırasında URI'nin boş olmadığını kontrol edebilirsiniz.
             // revert FixedURINotSet(); // Yeni bir error tanımlamanız gerekir
        }
        wrapperVaultAddress = _wrapperVaultAddress;
        emit WrapperVaultAddressSet(_wrapperVaultAddress);
    }

    // --- Core Functions ---

    function wrapAssets(Asset[] memory assetsToWrap) external payable nonReentrant returns (uint256) {
        // --- Kontroller ---
        if (msg.value != WRAPPER_FEE) revert IncorrectFee();
        uint256 numAssets = assetsToWrap.length;
        if (numAssets == 0) revert EmptyWrapper();
        if (numAssets > MAX_ASSETS_PER_TX) revert MaxAssetsExceeded();

        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        // --- State Güncellemeleri ---
        _wrapperIdCounter++;
        uint256 newWrapperId = _wrapperIdCounter;

        // Wrapper içeriğini kaydet (Bu kısım değişmedi)
        for (uint256 i = 0; i < numAssets; i++) {
            wrapperContents[newWrapperId].push(assetsToWrap[i]);
        }

        // --- Etkileşim (Vault ile - Bu kısım değişmedi) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToWrap[i];
            if (asset.contractAddress == address(0)) revert ZeroAssetAddress();

            bool success = vault.lockAsset(msg.sender, newWrapperId, asset.contractAddress, asset.idOrAmount, asset.isNFT);
            if (!success) revert AssetLockFailed();
        }

        // --- Son İşlemler ---
        _safeMint(msg.sender, newWrapperId);

        // <<< YENİ EKLENEN SATIR: Mint sonrası otomatik olarak sabit URI'yi ayarla >>>
        _setTokenURI(newWrapperId, FIXED_TOKEN_URI);

        emit AssetsWrapped(newWrapperId, msg.sender, assetsToWrap);
        return newWrapperId;
    }

    function unwrapAssets(uint256 wrapperId) external nonReentrant {
        // --- Yetkilendirme ve Kontroller ---
        address tokenOwner = ownerOf(wrapperId);
        if (tokenOwner != msg.sender && !isApprovedForAll(tokenOwner, msg.sender) && getApproved(wrapperId) != msg.sender) {
            revert NotOwnerOrApproved();
        }
        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        Asset[] memory assetsToUnlock = wrapperContents[wrapperId];
        uint256 numAssets = assetsToUnlock.length;
        if (numAssets == 0) revert WrapperIsEmptyOrNotFound();

        // --- Effects (State Değişiklikleri) ---
        delete wrapperContents[wrapperId];
        // <<< ÖNEMLİ: _burn çağırmadan önce URI'yi de silmek iyi bir pratiktir (isteğe bağlı) >>>
        // _deleteTokenURI(wrapperId); // ERC721URIStorage'dan gelen internal fonksiyon
        _burn(wrapperId);


        // --- Interaction (Vault ile - Bu kısım değişmedi) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i];
            bool success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, asset.isNFT);
            if (!success) revert AssetUnlockFailed();
        }

        emit AssetsUnwrapped(wrapperId, msg.sender);
    }

    // --- View Functions ---

    function getWrapperContents(uint256 wrapperId) external view returns (Asset[] memory) {
        return wrapperContents[wrapperId];
    }

    // --- Admin Functions ---

    function setWrapperVaultAddress(address newWrapperVaultAddress) external onlyOwner {
        if (newWrapperVaultAddress == address(0)) {
            revert ZeroVaultAddress();
        }
        wrapperVaultAddress = newWrapperVaultAddress;
        emit WrapperVaultAddressSet(newWrapperVaultAddress);
    }

    // <<< DEĞİŞİKLİK: Bu fonksiyon artık gerekli değil ama istersen bırakabilirsin. >>>
    // <<< Eğer bırakırsan, sahibi mint sonrası bile URI'yi değiştirebilir. >>>
    // <<< İstersen bu fonksiyonu silebilir veya yorum satırı yapabilirsin. >>>
    /*
    function setTokenURI(uint256 tokenId, string memory newTokenURI) external onlyOwner {
         _requireOwned(tokenId); // Bu fonksiyon ERC721'de private, yerine ownerOf kullanın
         require(ownerOf(tokenId) != address(0), "ERC721: invalid token ID"); // Token var mı kontrolü
         _setTokenURI(tokenId, newTokenURI);
    }
    */


    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) {
             revert NoFeesToWithdraw();
        }

        (bool success, ) = owner().call{value: balance}("");
        if (!success) {
            revert FeeWithdrawalFailed();
        }

        emit FeesWithdrawn(owner(), balance);
    }

    // --- Override Functions ---

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // tokenURI fonksiyonu ERC721URIStorage'dan miras alındığı için genellikle override etmeye gerek kalmaz.
    // Ancak burada zaten override edilmiş ve sadece super çağrılıyor, bu haliyle kalabilir.
    function tokenURI(uint256 tokenId) public view virtual override(ERC721, ERC721URIStorage) returns (string memory) {
        // _requireOwned(tokenId); // Bu fonksiyon private, bunun yerine aşağıdaki kontrol daha iyi
        require(ownerOf(tokenId) != address(0), "ERC721URIStorage: URI query for nonexistent token"); // Token var mı kontrolü
        string memory _tokenURI = super.tokenURI(tokenId);
         // Opsiyonel: Eğer URI hiç set edilmemişse (örn. eski setTokenURI silinirse ve sabit URI de boşsa) hata vermek için
         // require(bytes(_tokenURI).length > 0, "ERC721URIStorage: URI not set");
        return _tokenURI;
    }
}