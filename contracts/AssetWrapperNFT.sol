// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IAssetWrapperVault.sol";

/**
 * @title AssetWrapperNFT - ERC721 Token representing ownership of wrapped assets.
 * @dev Manages the lifecycle of wrapped assets and interacts with a Vault contract.
 * Allows the owner to set a dynamic wrapping fee via a timelock mechanism.
 * Metadata URI is generated dynamically based on base URI and token ID.
 */
contract AssetWrapperNFT is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

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
    error ZeroBaseURI();
    error FeeChangeNotReady(); // Timelock error
    error NoFeeChangePending(); // Timelock error

    // --- Constants ---
    // AUDIT FINDING (Gas Limit Risks - Medium Risk): MAX_ASSETS_PER_TX determines the max assets in a wrapper.
    // Lowered from 50 to 25 as a safer default based on audit feedback.
    // Ensure unwrapping this many assets does not exceed gas limits on the target network through testing.
    // Consider implementing partial unwrapping for greater flexibility and gas management.
    uint256 public constant MAX_ASSETS_PER_TX = 25;
    uint256 public constant FEE_CHANGE_DELAY = 2 days; // Timelock delay for fee changes

    // --- State Variables ---
    uint256 private _wrapperIdCounter;
    address public wrapperVaultAddress;
    uint256 public wrapperFee;
    string public baseTokenURI;

    // Timelock state variables for fee changes
    uint256 public pendingWrapperFee;
    uint256 public feeChangeReadyTimestamp; // Timestamp when the new fee can be applied

    struct Asset {
        address contractAddress;
        uint256 idOrAmount; // tokenId for ERC721, ACTUAL locked amount for ERC20
        bool isNFT;
    }

    mapping(uint256 => Asset[]) public wrapperContents;

    // --- Events ---
    event AssetsWrapped(uint256 indexed wrapperId, address indexed owner, Asset[] assets);
    event AssetsUnwrapped(uint256 indexed wrapperId, address indexed owner);
    event WrapperVaultAddressSet(address indexed newWrapperVaultAddress);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event WrapperFeeUpdated(uint256 oldFee, uint256 newFee);
    event BaseTokenURISet(string oldBaseURI, string newBaseURI);
    event WrapperFeeChangeProposed(uint256 newFee, uint256 effectiveTimestamp); // Timelock event
    event WrapperFeeChangeApplied(uint256 oldFee, uint256 newFee); // Timelock event

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress,
        uint256 initialWrapperFee,
        string memory initialBaseTokenURI
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        if (bytes(initialBaseTokenURI).length == 0) revert ZeroBaseURI();

        wrapperVaultAddress = _wrapperVaultAddress;
        wrapperFee = initialWrapperFee; // Set initial fee directly
        baseTokenURI = initialBaseTokenURI;

        emit WrapperVaultAddressSet(_wrapperVaultAddress);
        // Emit initial fee as an update event for clarity
        emit WrapperFeeUpdated(0, initialWrapperFee);
        emit BaseTokenURISet("", initialBaseTokenURI);
    }

    // --- Core Functions ---

    /**
     * @notice Wraps multiple assets into a new NFT. Requires payment of the current wrapperFee.
     * @dev Calls lockAsset on the associated Vault contract for each asset inside a loop.
     * Potential gas cost scales with the number of assets (MAX_ASSETS_PER_TX limit applies).
     * Uses nonReentrant guard to prevent reentrancy during vault interactions.
     * @param assetsToWrap Array of assets to be wrapped.
     * @return newWrapperId The ID of the newly minted NFT.
     */
    function wrapAssets(Asset[] memory assetsToWrap) external payable nonReentrant returns (uint256) {
        if (msg.value != wrapperFee) revert IncorrectFee();
        uint256 numAssets = assetsToWrap.length;
        if (numAssets == 0) revert EmptyWrapper();
        if (numAssets > MAX_ASSETS_PER_TX) revert MaxAssetsExceeded();

        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        _wrapperIdCounter++;
        uint256 newWrapperId = _wrapperIdCounter;

        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        Asset[] memory storedAssets = new Asset[](numAssets);

        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory inputAsset = assetsToWrap[i];
            if (inputAsset.contractAddress == address(0)) revert ZeroAssetAddress();

            // External call inside loop
            (bool success, uint256 actualIdOrAmount) = vault.lockAsset(
                msg.sender,
                newWrapperId,
                inputAsset.contractAddress,
                inputAsset.idOrAmount,
                inputAsset.isNFT
            );
            if (!success) revert AssetLockFailed();

            Asset memory storedAsset = Asset({
                contractAddress: inputAsset.contractAddress,
                idOrAmount: actualIdOrAmount, // Store the actual amount locked (handles fee-on-transfer)
                isNFT: inputAsset.isNFT
            });

            // State write after external call (mitigated by nonReentrant)
            wrapperContents[newWrapperId].push(storedAsset);
            storedAssets[i] = storedAsset;
        }

        _safeMint(msg.sender, newWrapperId);
        emit AssetsWrapped(newWrapperId, msg.sender, storedAssets);
        return newWrapperId;
    }

    /**
     * @notice Unwraps all assets associated with a given wrapperId NFT and burns the NFT.
     * @dev Calls unlockAsset/lockedERC20Balance on the Vault contract inside a loop.
     * Potential gas cost scales with the number of assets (MAX_ASSETS_PER_TX limit applies).
     * Follows Checks-Effects-Interactions pattern: NFT state changed *before* external calls.
     * @param wrapperId The ID of the NFT to unwrap.
     */
    function unwrapAssets(uint256 wrapperId) external nonReentrant {
        address tokenOwner = ownerOf(wrapperId);
        // Check ownership or approval
        if (tokenOwner != msg.sender && !isApprovedForAll(tokenOwner, msg.sender) && getApproved(wrapperId) != msg.sender) {
            revert NotOwnerOrApproved();
        }
        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        Asset[] memory assetsToUnlock = wrapperContents[wrapperId];
        uint256 numAssets = assetsToUnlock.length;
        if (numAssets == 0) revert WrapperIsEmptyOrNotFound();

        // --- Effects (before interactions) ---
        delete wrapperContents[wrapperId];
        _burn(wrapperId);

        // --- Interactions ---
        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i];
            bool success;
            if (asset.isNFT) {
                // External call inside loop
                success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, true);
            } else {
                // External call inside loop (view call)
                uint256 currentBalance = vault.lockedERC20Balance(wrapperId, asset.contractAddress);
                if (currentBalance > 0) {
                    // External call inside loop (state changing call)
                    success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, currentBalance, false);
                } else {
                    // Nothing to unlock for this ERC20 (already 0 or previously handled)
                    success = true;
                }
            }
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
        if (newWrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        wrapperVaultAddress = newWrapperVaultAddress;
        emit WrapperVaultAddressSet(newWrapperVaultAddress);
    }

    /**
     * @notice Proposes a new fee for the wrapAssets function, subject to a timelock.
     * @dev Can only be called by the owner. The fee change can be applied after FEE_CHANGE_DELAY.
     * AUDIT FINDING (Fee Change Front-Running - Medium Risk): Implemented timelock mechanism.
     * @param newProposedFee The proposed new fee amount in Wei.
     */
    function proposeWrapperFee(uint256 newProposedFee) external onlyOwner {
        pendingWrapperFee = newProposedFee;
        feeChangeReadyTimestamp = block.timestamp + FEE_CHANGE_DELAY;
        emit WrapperFeeChangeProposed(newProposedFee, feeChangeReadyTimestamp);
    }

    /**
     * @notice Applies the pending wrapper fee change after the timelock delay has passed.
     * @dev Can be called by anyone after the delay.
     */
    function applyWrapperFee() external {
        if (feeChangeReadyTimestamp == 0) revert NoFeeChangePending();
        if (block.timestamp < feeChangeReadyTimestamp) revert FeeChangeNotReady();

        uint256 oldFee = wrapperFee;
        uint256 newFee = pendingWrapperFee;
        wrapperFee = newFee;
        // Reset timelock state
        pendingWrapperFee = 0;
        feeChangeReadyTimestamp = 0;

        emit WrapperFeeChangeApplied(oldFee, newFee);
        // Also emit standard update event for consistency
        emit WrapperFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Sets the base URI for generating token URIs.
     * @dev Can only be called by the owner. Base URI should likely end with '/'.
     * Example: "https://myapi.com/metadata/"
     * @param newBaseURI The new base URI string.
     */
    function setBaseTokenURI(string memory newBaseURI) external onlyOwner {
        if (bytes(newBaseURI).length == 0) revert ZeroBaseURI();
        string memory oldBaseURI = baseTokenURI;
        baseTokenURI = newBaseURI;
        emit BaseTokenURISet(oldBaseURI, newBaseURI);
    }

    /**
     * @notice Withdraws accumulated fees from the contract to the owner's address.
     * @dev Uses low-level call, standard for ETH transfer. Checks for call success.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFeesToWithdraw();

        // Standard method to send Ether
        (bool success, ) = owner().call{value: balance}("");
        if (!success) revert FeeWithdrawalFailed();

        emit FeesWithdrawn(owner(), balance);
    }

    // --- Override Functions ---
    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override // ERC721
        returns (string memory)
    {
        _requireOwned(tokenId); // Check if token exists and is valid
        string memory base = baseTokenURI;
        if (bytes(base).length == 0) {
            return ""; // Return empty string if no base URI is set
        }
        // Append tokenId to base URI
        return string(abi.encodePacked(base, tokenId.toString()));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721) // Only ERC721
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}