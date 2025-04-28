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
    error ZeroFeeNotAllowed(); // Opsiyonel olarak 0 ücreti engellemek için

    // --- Constants ---
    uint256 public constant MAX_ASSETS_PER_TX = 50; // Tek işlemde maksimum varlık sayısı
    string private constant FIXED_TOKEN_URI = "ipfs://bafkreif6cgi7ijkg47vbp7kmcybejyvvsdt3rtoky4tkifurvtwolyzrjm";

    // --- State Variables ---
    uint256 private _wrapperIdCounter;
    address public wrapperVaultAddress;
    uint256 public wrapperFee;

    struct Asset {
        address contractAddress;
        uint256 idOrAmount; // tokenId for ERC721, ACTUAL locked amount for ERC20
        bool isNFT;
    }

    mapping(uint256 => Asset[]) public wrapperContents; // Stores details with ACTUAL locked amounts for ERC20s

    // --- Events ---
    event AssetsWrapped(uint256 indexed wrapperId, address indexed owner, Asset[] assets); // Event uses the stored Asset struct
    event AssetsUnwrapped(uint256 indexed wrapperId, address indexed owner);
    event WrapperVaultAddressSet(address indexed newWrapperVaultAddress);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event WrapperFeeUpdated(uint256 oldFee, uint256 newFee);

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress,
        uint256 initialWrapperFee
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        // if (initialWrapperFee == 0) revert ZeroFeeNotAllowed(); // İsteğe bağlı kontrol
        wrapperVaultAddress = _wrapperVaultAddress;
        wrapperFee = initialWrapperFee;
        emit WrapperVaultAddressSet(_wrapperVaultAddress);
        // İsteğe bağlı olarak başlangıç ücreti için de event yayınlanabilir:
        // emit WrapperFeeUpdated(0, initialWrapperFee);
    }

    // --- Core Functions ---

    /**
     * @notice Wraps multiple assets into a new NFT. Requires payment of the current wrapperFee.
     * @dev Calls lockAsset on the associated Vault contract for each asset.
     * Stores the *actual* locked amount for ERC20s returned by the vault.
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
        // Temporary array to store accurately recorded assets for the event
        Asset[] memory storedAssets = new Asset[](numAssets);

        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory inputAsset = assetsToWrap[i]; // Get user input asset details
            if (inputAsset.contractAddress == address(0)) revert ZeroAssetAddress();

            // Call the vault to lock the asset and get the actual result
            (bool success, uint256 actualIdOrAmount) = vault.lockAsset(
                msg.sender,
                newWrapperId,
                inputAsset.contractAddress,
                inputAsset.idOrAmount, // Pass user-specified amount/ID to vault
                inputAsset.isNFT
            );

            if (!success) revert AssetLockFailed(); // Revert if locking failed in vault

            // Create the asset struct with the *actual* amount/ID returned by the vault
            Asset memory storedAsset = Asset({
                contractAddress: inputAsset.contractAddress,
                idOrAmount: actualIdOrAmount, // <<< DEĞİŞİKLİK: Vault'tan dönen gerçek değer kullanılıyor
                isNFT: inputAsset.isNFT
            });

            // Store the accurate asset data in the mapping
            wrapperContents[newWrapperId].push(storedAsset);
            // Also save to temporary array for the event
            storedAssets[i] = storedAsset;
        }

        // --- Final Effects ---
        _safeMint(msg.sender, newWrapperId);
        _setTokenURI(newWrapperId, FIXED_TOKEN_URI); // Set fixed URI

        // Emit event with accurately recorded asset details
        emit AssetsWrapped(newWrapperId, msg.sender, storedAssets); // <<< DEĞİŞİKLİK: storedAssets kullanılıyor
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

        Asset[] memory assetsToUnlock = wrapperContents[wrapperId]; // Get stored asset details
        uint256 numAssets = assetsToUnlock.length;
        if (numAssets == 0) revert WrapperIsEmptyOrNotFound(); // Check if wrapper exists/is empty

        // --- Effects (State changes before interaction) ---
        delete wrapperContents[wrapperId]; // Clear storage for this wrapper
        _burn(wrapperId);                  // Burn the NFT

        // --- Interaction (Vault) ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i]; // Use stored asset data

            bool success;
            if (asset.isNFT) {
                // For NFTs, unlock using the stored tokenId
                success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, true);
            } else {
                // For ERC20s, get the *current* locked balance from the vault to unlock
                uint256 currentBalance = vault.lockedERC20Balance(wrapperId, asset.contractAddress);
                // Only attempt unlock if there's a balance > 0
                if (currentBalance > 0) {
                    // Unlock the actual current balance
                    success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, currentBalance, false);
                } else {
                    // If balance is 0, consider it successful for this asset (nothing to unlock)
                    success = true;
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
        // if (_newFee == 0) revert ZeroFeeNotAllowed(); // İsteğe bağlı kontrol
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

    // The following functions are overrides required by Solidity.

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        // require(_exists(tokenId), "ERC721URIStorage: URI query for nonexistent token"); // ownerOf already checks existence
        require(ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token");

        // Since we always set the same URI in wrapAssets, we can just return it.
        // The super call handles retrieving it from storage if it was set individually,
        // but our logic always sets the fixed one.
        // return FIXED_TOKEN_URI; // This would save a little gas vs super call
        return super.tokenURI(tokenId); // Use super for standard behavior compatibility
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}