// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol"; // Kaldırıldı, URI dinamik olacak
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol"; // Dinamik URI için eklendi
import "./interfaces/IAssetWrapperVault.sol";

/**
 * @title AssetWrapperNFT - ERC721 Token representing ownership of wrapped assets.
 * @dev Manages the lifecycle of wrapped assets and interacts with a Vault contract.
 * Allows the owner to set a dynamic wrapping fee.
 * Metadata URI is generated dynamically based on base URI and token ID.
 */
// ERC721URIStorage kaldırıldı
contract AssetWrapperNFT is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256; // Dinamik URI için eklendi

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
    // ZeroFeeNotAllowed kaldırıldı (sıfır ücrete izin veriliyor)
    error ZeroBaseURI(); // Dinamik URI için eklendi

    // --- Constants ---
    // AUDIT FINDING 5 NOTE: MAX_ASSETS_PER_TX determines the max assets in a wrapper.
    // Ensure unwrapping this many assets does not exceed gas limits on the target network.
    uint256 public constant MAX_ASSETS_PER_TX = 50; // Tek işlemde maksimum varlık sayısı

    // --- State Variables ---
    uint256 private _wrapperIdCounter;
    address public wrapperVaultAddress;
    uint256 public wrapperFee;
    string public baseTokenURI; // Dinamik URI için eklendi (FIXED_TOKEN_URI kaldırıldı)

    struct Asset {
        address contractAddress;
        uint256 idOrAmount; // tokenId for ERC721, ACTUAL locked amount for ERC20
        bool isNFT;
    }

    mapping(uint256 => Asset[]) public wrapperContents; // Stores details with ACTUAL locked amounts for ERC20s

    // --- Events ---
    event AssetsWrapped(uint256 indexed wrapperId, address indexed owner, Asset[] assets);
    event AssetsUnwrapped(uint256 indexed wrapperId, address indexed owner);
    event WrapperVaultAddressSet(address indexed newWrapperVaultAddress);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event WrapperFeeUpdated(uint256 oldFee, uint256 newFee);
    event BaseTokenURISet(string oldBaseURI, string newBaseURI); // Dinamik URI için eklendi

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress,
        uint256 initialWrapperFee,
        string memory _initialBaseTokenURI // Dinamik URI için eklendi
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        // ZeroFeeNotAllowed kontrolü kaldırıldı
        if (bytes(_initialBaseTokenURI).length == 0) revert ZeroBaseURI(); // Dinamik URI için eklendi

        wrapperVaultAddress = _wrapperVaultAddress;
        wrapperFee = initialWrapperFee;
        baseTokenURI = _initialBaseTokenURI; // Dinamik URI için eklendi

        emit WrapperVaultAddressSet(_wrapperVaultAddress);
        emit BaseTokenURISet("", _initialBaseTokenURI); // Dinamik URI için eklendi
        // İsteğe bağlı olarak başlangıç ücreti için de event yayınlanabilir:
        // emit WrapperFeeUpdated(0, initialWrapperFee);
    }

    // --- Core Functions ---

    /**
     * @notice Wraps multiple assets into a new NFT. Requires payment of the current wrapperFee.
     * @dev Calls lockAsset on the associated Vault contract for each asset.
     * Stores the *actual* locked amount for ERC20s returned by the vault.
     * AUDIT FINDING 4 NOTE: Fee is checked at execution time. Fee changes while tx is pending
     * can cause issues. Consider timelocks for fee changes if this is a major concern.
     * @param assetsToWrap Array of assets to be wrapped (idOrAmount is user-specified for ERC20s here).
     * @return newWrapperId The ID of the newly minted NFT.
     */
    function wrapAssets(Asset[] memory assetsToWrap) external payable nonReentrant returns (uint256) {
        // --- Checks ---
        if (msg.value != wrapperFee) revert IncorrectFee();
        uint256 numAssets = assetsToWrap.length;
        if (numAssets == 0) revert EmptyWrapper();
        if (numAssets > MAX_ASSETS_PER_TX) revert MaxAssetsExceeded();

        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet(); // Sanity check

        // --- Effects (Initial state update) ---
        _wrapperIdCounter++;
        uint256 newWrapperId = _wrapperIdCounter;

        // --- Interaction & Storing Accurate Data (Loop) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        Asset[] memory storedAssets = new Asset[](numAssets); // Temporary array for event

        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory inputAsset = assetsToWrap[i];
            if (inputAsset.contractAddress == address(0)) revert ZeroAssetAddress();

            // Call the vault to lock the asset and get the actual result
            (bool success, uint256 actualIdOrAmount) = vault.lockAsset(
                msg.sender,
                newWrapperId,
                inputAsset.contractAddress,
                inputAsset.idOrAmount,
                inputAsset.isNFT
            );

            if (!success) revert AssetLockFailed(); // Revert if locking failed in vault

            // Create the asset struct with the *actual* amount/ID returned by the vault
            Asset memory storedAsset = Asset({
                contractAddress: inputAsset.contractAddress,
                idOrAmount: actualIdOrAmount, // Use actual value returned from vault
                isNFT: inputAsset.isNFT
            });

            wrapperContents[newWrapperId].push(storedAsset);
            storedAssets[i] = storedAsset; // Save for event
        }

        // --- Final Effects ---
        _safeMint(msg.sender, newWrapperId);
        // _setTokenURI removed - URI is generated dynamically in tokenURI()

        emit AssetsWrapped(newWrapperId, msg.sender, storedAssets); // Emit with accurate asset details
        return newWrapperId;
    }

    /**
     * @notice Unwraps all assets associated with a given wrapperId NFT and burns the NFT.
     * @dev Calls unlockAsset on the associated Vault contract for each asset.
     * For ERC20s, it determines the amount to unlock by calling `lockedERC20Balance` on the vault.
     * @param wrapperId The ID of the NFT to unwrap.
     */
    function unwrapAssets(uint256 wrapperId) external nonReentrant {
        // --- Authorization & Checks ---
        address tokenOwner = ownerOf(wrapperId);
        if (tokenOwner != msg.sender && !isApprovedForAll(tokenOwner, msg.sender) && getApproved(wrapperId) != msg.sender) {
            revert NotOwnerOrApproved();
        }
        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet(); // Sanity check

        Asset[] memory assetsToUnlock = wrapperContents[wrapperId];
        uint256 numAssets = assetsToUnlock.length;
        if (numAssets == 0) revert WrapperIsEmptyOrNotFound(); // Check if wrapper exists/is empty

        // --- Effects (State changes before interaction) ---
        delete wrapperContents[wrapperId]; // Clear storage for this wrapper
        _burn(wrapperId);                  // Burn the NFT

        // --- Interaction (Vault) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i];

            bool success;
            if (asset.isNFT) {
                // For NFTs, unlock using the stored tokenId
                success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, true);
            } else {
                // For ERC20s, get the *current* locked balance from the vault to unlock
                uint256 currentBalance = vault.lockedERC20Balance(wrapperId, asset.contractAddress);
                if (currentBalance > 0) {
                    // Unlock the actual current balance
                    success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, currentBalance, false);
                } else {
                    success = true; // Nothing to unlock
                }
            }

            if (!success) revert AssetUnlockFailed(); // Revert if unlocking failed in vault
        }

        emit AssetsUnwrapped(wrapperId, msg.sender);
    }

    // --- View Functions ---

    /**
     * @notice Returns the list of assets associated with a specific wrapper NFT.
     * Contains the actual locked amount for ERC20s.
     * @param wrapperId The ID of the NFT.
     * @return An array of Asset structs.
     */
    function getWrapperContents(uint256 wrapperId) external view returns (Asset[] memory) {
        return wrapperContents[wrapperId];
    }

    // --- Admin Functions ---

    /**
     * @notice Sets the address of the associated AssetWrapperVault contract.
     * @dev Can only be called by the owner. Consider adding a timelock for production.
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
     * Consider adding a timelock for production to mitigate front-running (Audit Finding 4).
     * @param _newFee The new fee amount in Wei.
     */
    function setWrapperFee(uint256 _newFee) external onlyOwner {
        // ZeroFeeNotAllowed kontrolü kaldırıldı
        uint256 oldFee = wrapperFee;
        wrapperFee = _newFee;
        emit WrapperFeeUpdated(oldFee, _newFee);
    }

    /**
     * @notice Sets the base URI for generating token URIs.
     * @dev Can only be called by the owner. Base URI should likely end with '/'.
     * Example: "https://myapi.com/metadata/"
     * @param _newBaseURI The new base URI string.
     */
    function setBaseTokenURI(string memory _newBaseURI) external onlyOwner {
        if (bytes(_newBaseURI).length == 0) revert ZeroBaseURI();
        string memory oldBaseURI = baseTokenURI;
        baseTokenURI = _newBaseURI;
        emit BaseTokenURISet(oldBaseURI, _newBaseURI);
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

    /**
     * @notice Returns the URI for a given token ID.
     * @dev Generates URI dynamically based on baseTokenURI and tokenId.
     * Requires the token to exist.
     */
    // ERC721URIStorage override'ı kaldırıldı/değiştirildi
    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override // Sadece ERC721'i override eder
        returns (string memory)
    {
        // _requireOwned replaces the need for _exists check or ownerOf check here
        _requireOwned(tokenId); // OpenZeppelin 5.x helper
        // require(ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token"); // Alternatif kontrol

        string memory base = baseTokenURI;
        // If base is empty, return empty string (or revert)
        if (bytes(base).length == 0) {
            return "";
            // revert("ERC721: Base URI not set"); // Alternatif
        }
        // Concatenate base URI and token ID
        return string(abi.encodePacked(base, tokenId.toString()));
    }

    // supportsInterface override remains the same as it comes from ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, Ownable) // Ownable'ı da eklemek gerekebilir OZ 5.x ile
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}