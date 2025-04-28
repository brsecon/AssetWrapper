// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAssetWrapperVault.sol"; // Bu dosyanın projenizde doğru yerde olduğundan emin olun

/**
 * @title AssetWrapperNFT - ERC721 Token representing ownership of wrapped assets.
 * @dev Manages the lifecycle of wrapped assets and interacts with a Vault contract.
 * Allows the owner to set a dynamic wrapping fee.
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
    error ZeroFeeNotAllowed(); // <<< YENİ: Opsiyonel olarak 0 ücreti engellemek için

    // --- Constants ---
    // uint256 public constant WRAPPER_FEE = 0.0005 ether; // <<< KALDIRILDI: Sabit ücret kaldırıldı
    uint256 public constant MAX_ASSETS_PER_TX = 50; // Tek işlemde maksimum varlık sayısı
    string private constant FIXED_TOKEN_URI = "ipfs://bafkreif6cgi7ijkg47vbp7kmcybejyvvsdt3rtoky4tkifurvtwolyzrjm"; // <<< SABİT URI KORUNDU

    // --- State Variables ---
    uint256 private _wrapperIdCounter;
    address public wrapperVaultAddress;
    uint256 public wrapperFee; // <<< YENİ: Dinamik ücret için state değişkeni

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
    event WrapperFeeUpdated(uint256 oldFee, uint256 newFee); // <<< YENİ: Ücret güncelleme eventi

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress,
        uint256 initialWrapperFee // <<< YENİ: Başlangıç ücreti parametresi
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        // Opsiyonel: Başlangıç ücretinin 0 olmasını engelleyebilirsiniz
        // if (initialWrapperFee == 0) revert ZeroFeeNotAllowed();
        wrapperVaultAddress = _wrapperVaultAddress;
        wrapperFee = initialWrapperFee; // <<< YENİ: Başlangıç ücreti atanıyor
        emit WrapperVaultAddressSet(_wrapperVaultAddress);
        // <<< YENİ: Başlangıç ücreti için de event yayınlanabilir (isteğe bağlı)
        // emit WrapperFeeUpdated(0, initialWrapperFee);
    }

    // --- Core Functions ---

    /**
     * @notice Wraps multiple assets into a new NFT. Requires payment of the current wrapperFee.
     * @dev Calls lockAsset on the associated Vault contract for each asset.
     * @param assetsToWrap Array of assets to be wrapped.
     * @return newWrapperId The ID of the newly minted NFT.
     */
    function wrapAssets(Asset[] memory assetsToWrap) external payable nonReentrant returns (uint256) {
        // --- Kontroller ---
        // <<< DEĞİŞİKLİK: Sabit ücret yerine state değişkeni kontrol ediliyor >>>
        if (msg.value != wrapperFee) revert IncorrectFee();
        uint256 numAssets = assetsToWrap.length;
        if (numAssets == 0) revert EmptyWrapper();
        if (numAssets > MAX_ASSETS_PER_TX) revert MaxAssetsExceeded();

        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        // --- State Güncellemeleri ---
        _wrapperIdCounter++;
        uint256 newWrapperId = _wrapperIdCounter;

        // Wrapper içeriğini kaydet
        for (uint256 i = 0; i < numAssets; i++) {
            wrapperContents[newWrapperId].push(assetsToWrap[i]);
        }

        // --- Etkileşim (Vault ile) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToWrap[i];
            if (asset.contractAddress == address(0)) revert ZeroAssetAddress();

            bool success = vault.lockAsset(msg.sender, newWrapperId, asset.contractAddress, asset.idOrAmount, asset.isNFT);
            if (!success) revert AssetLockFailed();
        }

        // --- Son İşlemler ---
        _safeMint(msg.sender, newWrapperId);
        _setTokenURI(newWrapperId, FIXED_TOKEN_URI); // Sabit URI atanıyor

        emit AssetsWrapped(newWrapperId, msg.sender, assetsToWrap);
        return newWrapperId;
    }

    /**
     * @notice Unwraps all assets associated with a given wrapperId NFT and burns the NFT.
     * @dev Calls unlockAsset on the associated Vault contract for each asset.
     * @param wrapperId The ID of the NFT to unwrap.
     */
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
        _burn(wrapperId);

        // --- Interaction (Vault ile) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i];
            // ERC20 için Vault'tan güncel bakiyeyi alıp unlock etme mantığı korundu
            if (asset.isNFT) {
                bool success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, true);
                if (!success) revert AssetUnlockFailed();
            } else {
                // vault.lockedERC20Balance çağrısı IAssetWrapperVault arayüzünde tanımlı olmalı
                uint256 currentBalance = vault.lockedERC20Balance(wrapperId, asset.contractAddress);
                // Eğer unlock edilecek bir bakiye yoksa (örn. 0 ise) boşuna çağırmamak için kontrol eklenebilir
                if (currentBalance > 0) {
                    bool success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, currentBalance, false);
                    if (!success) revert AssetUnlockFailed();
                }
            }
        }

        emit AssetsUnwrapped(wrapperId, msg.sender);
    }

    // --- View Functions ---

    /**
     * @notice Returns the list of assets associated with a specific wrapper NFT.
     * @param wrapperId The ID of the NFT.
     * @return An array of Asset structs.
     */
    function getWrapperContents(uint256 wrapperId) external view returns (Asset[] memory) {
        return wrapperContents[wrapperId];
    }

    // --- Admin Functions ---

    /**
     * @notice Sets the address of the associated AssetWrapperVault contract.
     * @dev Can only be called by the owner.
     * @param newWrapperVaultAddress The address of the new vault contract.
     */
    function setWrapperVaultAddress(address newWrapperVaultAddress) external onlyOwner {
        if (newWrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        wrapperVaultAddress = newWrapperVaultAddress;
        emit WrapperVaultAddressSet(newWrapperVaultAddress);
    }

    /**
     * @notice Updates the fee required for the wrapAssets function.
     * @dev Can only be called by the owner. Fee is set in Wei.
     * @param _newFee The new fee amount in Wei.
     */
    function setWrapperFee(uint256 _newFee) external onlyOwner {
        // Opsiyonel: Yeni ücretin 0 olmasını engelleyebilirsiniz
        // if (_newFee == 0) revert ZeroFeeNotAllowed();
        uint256 oldFee = wrapperFee;
        wrapperFee = _newFee;
        emit WrapperFeeUpdated(oldFee, _newFee);
    }

    /**
     * @notice Withdraws accumulated fees from the contract to the owner's address.
     * @dev Can only be called by the owner.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFeesToWithdraw();

        (bool success, ) = owner().call{value: balance}("");
        if (!success) revert FeeWithdrawalFailed();

        emit FeesWithdrawn(owner(), balance);
    }

    // --- Override Functions ---

    // ERC721 ve ERC721URIStorage'dan gelen fonksiyonlar (değişiklik yok)
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId) public view virtual override(ERC721, ERC721URIStorage) returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721URIStorage: URI query for nonexistent token");
        // ERC721URIStorage'daki _tokenURIs mapping'inden veya _setTokenURI ile atanan değeri döndürür.
        // Biz hep FIXED_TOKEN_URI atadığımız için onu döndürmesini bekleriz.
        // super.tokenURI() zaten doğru implementasyonu sağlar.
        return super.tokenURI(tokenId);
    }
}