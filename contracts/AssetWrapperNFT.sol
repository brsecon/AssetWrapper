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
 * Allows the owner to set a dynamic wrapping fee.
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

    // --- Constants ---
    // AUDIT FINDING 5 NOTE: MAX_ASSETS_PER_TX determines the max assets in a wrapper.
    // Ensure unwrapping this many assets does not exceed gas limits on the target network.
    uint256 public constant MAX_ASSETS_PER_TX = 50;

    // --- State Variables ---
    uint256 private _wrapperIdCounter;
    address public wrapperVaultAddress;
    uint256 public wrapperFee;
    string public baseTokenURI;

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

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address _wrapperVaultAddress,
        uint256 initialWrapperFee,
        string memory initialBaseTokenURI // SLITHER FIX: Parameter name updated (was _initialBaseTokenURI)
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        if (_wrapperVaultAddress == address(0)) revert ZeroVaultAddress();
        if (bytes(initialBaseTokenURI).length == 0) revert ZeroBaseURI();

        wrapperVaultAddress = _wrapperVaultAddress;
        wrapperFee = initialWrapperFee;
        baseTokenURI = initialBaseTokenURI;

        emit WrapperVaultAddressSet(_wrapperVaultAddress);
        emit BaseTokenURISet("", initialBaseTokenURI);
    }

    // --- Core Functions ---

    /**
     * @notice Wraps multiple assets into a new NFT. Requires payment of the current wrapperFee.
     * @dev Calls lockAsset on the associated Vault contract for each asset inside a loop.
     * SLITHER NOTE (calls-loop): External calls in loop are necessary for batch functionality. Monitor gas usage.
     * SLITHER NOTE (reentrancy-*): Pattern `Interaction -> State Write` exists (vault.lockAsset -> wrapperContents.push).
     * Mitigated by `nonReentrant` guard on this function.
     * AUDIT FINDING 4 NOTE: Fee is checked at execution time. Consider timelocks for fee changes if needed.
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
                idOrAmount: actualIdOrAmount,
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
     * SLITHER NOTE (calls-loop): External calls in loop are necessary for batch functionality. Monitor gas usage.
     * @param wrapperId The ID of the NFT to unwrap.
     */
    function unwrapAssets(uint256 wrapperId) external nonReentrant {
        address tokenOwner = ownerOf(wrapperId);
        if (tokenOwner != msg.sender && !isApprovedForAll(tokenOwner, msg.sender) && getApproved(wrapperId) != msg.sender) {
            revert NotOwnerOrApproved();
        }
        address _vaultAddress = wrapperVaultAddress;
        if (_vaultAddress == address(0)) revert VaultAddressNotSet();

        Asset[] memory assetsToUnlock = wrapperContents[wrapperId];
        uint256 numAssets = assetsToUnlock.length;
        if (numAssets == 0) revert WrapperIsEmptyOrNotFound();

        delete wrapperContents[wrapperId];
        _burn(wrapperId);

        IAssetWrapperVault vault = IAssetWrapperVault(_vaultAddress);
        for (uint256 i = 0; i < numAssets; i++) {
            Asset memory asset = assetsToUnlock[i];
            bool success;
            if (asset.isNFT) {
                // External call inside loop
                success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, asset.idOrAmount, true);
            } else {
                // External call inside loop
                uint256 currentBalance = vault.lockedERC20Balance(wrapperId, asset.contractAddress);
                if (currentBalance > 0) {
                    // External call inside loop
                    success = vault.unlockAsset(msg.sender, wrapperId, asset.contractAddress, currentBalance, false);
                } else {
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
     * @notice Updates the fee required for the wrapAssets function.
     * @dev Can only be called by the owner. Fee is set in Wei.
     * Consider adding a timelock for production to mitigate front-running (Audit Finding 4).
     * @param newFee The new fee amount in Wei. SLITHER FIX: Parameter name updated (was _newFee).
     */
    function setWrapperFee(uint256 newFee) external onlyOwner { // SLITHER FIX: Parameter name updated
        uint256 oldFee = wrapperFee;
        wrapperFee = newFee; // SLITHER FIX: Use updated parameter name
        emit WrapperFeeUpdated(oldFee, newFee); // SLITHER FIX: Use updated parameter name
    }

    /**
     * @notice Sets the base URI for generating token URIs.
     * @dev Can only be called by the owner. Base URI should likely end with '/'.
     * Example: "https://myapi.com/metadata/"
     * @param newBaseURI The new base URI string. SLITHER FIX: Parameter name updated (was _newBaseURI).
     */
    function setBaseTokenURI(string memory newBaseURI) external onlyOwner { // SLITHER FIX: Parameter name updated
        if (bytes(newBaseURI).length == 0) revert ZeroBaseURI(); // SLITHER FIX: Use updated parameter name
        string memory oldBaseURI = baseTokenURI;
        baseTokenURI = newBaseURI; // SLITHER FIX: Use updated parameter name
        emit BaseTokenURISet(oldBaseURI, newBaseURI); // SLITHER FIX: Use updated parameter name
    }

    /**
     * @notice Withdraws accumulated fees from the contract to the owner's address.
     * @dev Uses low-level call, which is standard for ETH transfer.
     * SLITHER NOTE (dangerous-strict-equality): `balance == 0` check is intentional and safe here.
     * SLITHER NOTE (low-level-calls): `call` is the standard method for sending Ether.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        // Intentionally check for exact zero
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
        _requireOwned(tokenId);
        string memory base = baseTokenURI;
        if (bytes(base).length == 0) {
            return "";
        }
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