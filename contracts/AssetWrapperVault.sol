// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IAssetWrapperVault.sol";

contract AssetWrapperVault is Ownable, ReentrancyGuard, IAssetWrapperVault, IERC721Receiver {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error UnauthorizedCaller();
    error ZeroWrapperNftAddress();
    error ZeroUserAddress();
    error ZeroAssetContractAddress();
    error NftAlreadyLocked();
    error NonPositiveAmount();
    error ZeroRecipientAddress();
    error NftNotLocked();
    error InsufficientLockedBalance();
    error UnexpectedTokenReceipt(); // Used if no lock was pending
    error InvalidTokenReceiptData(); // Used if nonce data format is wrong
    // error WrongWrapperForTokenReceipt(); // Replaced by WrongNonceForTokenReceipt
    error CannotRescueLockedNFT();
    error InsufficientRescueBalance();
    error AssetNotERC721();
    error AssetNotERC20();
    error TokenNotHeldByVault(address token, uint256 tokenId);
    error ReceivedLessThanSpecified();
    error ReceivedMoreThanSpecified();
    error WrongNonceForTokenReceipt(); // Added for new nonce mechanism

    // --- State Variables ---
    address public wrapperNftContractAddress;
    // Mapping: wrapperId -> assetContract -> tokenId -> isLocked?
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isNFTLocked;
    // Mapping: wrapperId -> assetContract -> lockedBalance
    // AUDIT FINDING (ERC20 Balance Tracking - Medium Risk): Handles fee-on-transfer but not value changes of rebasing tokens.
    mapping(uint256 => mapping(address => uint256)) internal _lockedERC20Balance;
    // Mapping: assetContract -> tokenId -> isLockedAnywhereInThisVault?
    mapping(address => mapping(uint256 => bool)) public isTokenLockedAnywhere;
    // Mapping: assetContract -> totalLockedBalance (used for rescue calculation)
    mapping(address => uint256) public totalLockedERC20;

    // --- AUDIT FIX (Vault Marker Vulnerability - High Risk) ---
    // Replaced _expectedTokenIdMarker with a nonce-based mechanism.
    // Each pending NFT lock attempt gets a unique nonce.
    struct PendingNftLock {
        bytes32 nonce;       // Unique identifier for the lock attempt
        uint256 wrapperId;   // The target wrapper ID for this lock
    }
    // Mapping: assetContract -> tokenId -> PendingLock details
    mapping(address => mapping(uint256 => PendingNftLock)) private _pendingNftLocks;
    // Counter to ensure nonce uniqueness even in the same block/timestamp
    uint256 private _nftLockCounter;
    // --- FIX END ---

    // --- Events ---
    event WrapperNftAddressSet(address indexed newWrapperNftAddress);
    event AssetLocked(uint256 indexed wrapperId, address indexed user, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event AssetUnlocked(uint256 indexed wrapperId, address indexed recipient, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event TokensRescued(address indexed token, address indexed to, uint256 idOrAmount, bool isNFT);

    // --- Constructor ---
    constructor(address initialOwner) Ownable(initialOwner) {}

    // --- Modifiers ---
    modifier onlyWrapperNFT() {
        if (msg.sender != wrapperNftContractAddress) revert UnauthorizedCaller();
        _;
    }

    // --- Admin Functions ---
    function setWrapperNftAddress(address newWrapperNftAddress) external onlyOwner {
        if (newWrapperNftAddress == address(0)) revert ZeroWrapperNftAddress();
        wrapperNftContractAddress = newWrapperNftAddress;
        emit WrapperNftAddressSet(newWrapperNftAddress);
    }

    // --- Core Logic ---

    /**
     * @inheritdoc IAssetWrapperVault
     * @dev Locks an asset sent from the user, authorized by the WrapperNFT contract.
     * Uses nonReentrant guard. Handles ERC721 using a unique nonce mechanism and ERC20 via balance delta.
     * For NFTs, this function generates/stores a nonce and pulls the token via safeTransferFrom.
     */
    function lockAsset(
        address user,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    )
        external
        override
        onlyWrapperNFT
        nonReentrant
        returns (bool success, uint256 actualIdOrAmount)
    {
        if (user == address(0)) revert ZeroUserAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            // Check interface support first
            if (!IERC165(assetContract).supportsInterface(type(IERC721).interfaceId)) {
                 revert AssetNotERC721();
            }
            // Prevent double-locking same NFT
            if (isTokenLockedAnywhere[assetContract][tokenId]) {
                // Also implicitly covers isNFTLocked[wrapperId][assetContract][tokenId] check
                // because if it's locked anywhere, it cannot be locked again here.
                revert NftAlreadyLocked();
            }
            // Check if there's already a pending lock for this specific token (shouldn't happen if isTokenLockedAnywhere is checked)
            if (_pendingNftLocks[assetContract][tokenId].nonce != bytes32(0)) {
                 revert NftAlreadyLocked(); // Or a different error like PendingLockExists
            }


            // --- Effects (Before Interaction - Generate and store nonce) ---
            _nftLockCounter++; // Increment counter for uniqueness
            bytes32 expectedNonce = keccak256(
                abi.encodePacked(wrapperId, assetContract, tokenId, user, block.timestamp, _nftLockCounter)
            );
            _pendingNftLocks[assetContract][tokenId] = PendingNftLock({
                nonce: expectedNonce,
                wrapperId: wrapperId
            });

            // --- Interaction ---
            // Vault pulls the NFT from the user using the allowance previously set by the user.
            // The nonce is passed in the data field to be verified by onERC721Received.
            bytes memory transferData = abi.encode(expectedNonce);
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId, transferData);

            // State updates (isNFTLocked, isTokenLockedAnywhere) are now done in onERC721Received
            // after successful nonce validation.

            // Emit event indicating the asset lock process was initiated
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);

            // Return true optimistically; confirmation happens via onERC721Received.
            // Return the expected tokenId.
            return (true, tokenId);

        } else { // ERC20 (Logic remains the same as before)
            uint256 amountSpecified = idOrAmount;
             // Check interface support first
            if (!IERC165(assetContract).supportsInterface(type(IERC20).interfaceId)) {
                 revert AssetNotERC20();
            }
            if (amountSpecified == 0) revert NonPositiveAmount(); // Cannot lock zero amount

            IERC20 token = IERC20(assetContract);
            // Balance delta method for fee-on-transfer compatibility
            uint256 balanceBefore = token.balanceOf(address(this));

            // --- Interaction ---
            // Vault pulls ERC20 tokens from user using allowance.
            token.safeTransferFrom(user, address(this), amountSpecified);

            // --- Effects (After Interaction) ---
            uint256 balanceAfter = token.balanceOf(address(this));
            // Ensure balance actually increased
            if (balanceAfter <= balanceBefore) revert ReceivedLessThanSpecified();

            uint256 actualReceived = balanceAfter - balanceBefore;

             // Check against potential inflation/rebasing issues
            if (actualReceived > amountSpecified) revert ReceivedMoreThanSpecified();

            // Update balances
            _lockedERC20Balance[wrapperId][assetContract] += actualReceived;
            totalLockedERC20[assetContract] += actualReceived;

            emit AssetLocked(wrapperId, user, assetContract, actualReceived, false);
            return (true, actualReceived);
        }
    }

   /**
     * @inheritdoc IAssetWrapperVault
     * @dev Unlocks an asset and sends it to the recipient, authorized by the WrapperNFT contract.
     * Uses nonReentrant guard. Follows Checks-Effects-Interactions pattern.
     */
    function unlockAsset(
        address recipient,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    )
        external
        override
        onlyWrapperNFT
        nonReentrant
        returns (bool success)
    {
        // (Unlock logic remains the same as the previous corrected version)
        if (recipient == address(0)) revert ZeroRecipientAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            // Check if it's actually locked by this wrapper
            if (!isNFTLocked[wrapperId][assetContract][tokenId]) revert NftNotLocked();

            // --- Effects (before interaction) ---
            isNFTLocked[wrapperId][assetContract][tokenId] = false;
            isTokenLockedAnywhere[assetContract][tokenId] = false; // Mark as unlocked globally within vault

            // --- Interaction ---
            IERC721(assetContract).safeTransferFrom(address(this), recipient, tokenId);

            emit AssetUnlocked(wrapperId, recipient, assetContract, tokenId, true);

        } else { // ERC20
            uint256 amountToUnlock = idOrAmount;
            if (amountToUnlock == 0) revert NonPositiveAmount(); // Cannot unlock zero

            uint256 currentLocked = _lockedERC20Balance[wrapperId][assetContract];
            if (currentLocked < amountToUnlock) revert InsufficientLockedBalance();

            // --- Effects (before interaction) ---
            _lockedERC20Balance[wrapperId][assetContract] = currentLocked - amountToUnlock;
            totalLockedERC20[assetContract] -= amountToUnlock;

            // --- Interaction ---
            IERC20(assetContract).safeTransfer(recipient, amountToUnlock);

            emit AssetUnlocked(wrapperId, recipient, assetContract, amountToUnlock, false);
        }
        return true;
    }

   /**
     * @inheritdoc IERC721Receiver
     * @dev Handles incoming ERC721 transfers initiated by lockAsset, validating the unique nonce.
     * Finalizes the lock state upon successful nonce verification.
     */
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        address assetContract = msg.sender; // The ERC721 contract calling this hook

        // Decode the nonce from the data payload
        bytes32 receivedNonce;
        if (data.length == 32) {
             receivedNonce = abi.decode(data, (bytes32));
        } else {
             // If data is not 32 bytes, it cannot be our expected nonce
             revert InvalidTokenReceiptData();
        }

        // Retrieve the pending lock details for this token
        PendingNftLock memory pending = _pendingNftLocks[assetContract][tokenId];

        // Check if we were expecting a lock for this specific token
        if (pending.nonce == bytes32(0)) {
            // No nonce was stored, so this transfer was unexpected
            revert UnexpectedTokenReceipt();
        }

        // Validate the received nonce against the stored nonce
        if (pending.nonce != receivedNonce) {
            // Nonce mismatch, reject the transfer
            revert WrongNonceForTokenReceipt();
        }

        // --- Nonce Validated: Finalize Lock State ---
        uint256 lockedWrapperId = pending.wrapperId; // Get the correct wrapperId associated with this nonce

        // Mark the NFT as locked for the specific wrapper and globally
        // Important: Check again if somehow locked in the meantime (belt and suspenders)
        if(isTokenLockedAnywhere[assetContract][tokenId]) {
             // This should theoretically not happen if lockAsset checks work,
             // but guards against unforeseen race conditions or reentrancy issues missed elsewhere.
             revert NftAlreadyLocked();
        }
        isNFTLocked[lockedWrapperId][assetContract][tokenId] = true;
        isTokenLockedAnywhere[assetContract][tokenId] = true;

        // Clear the pending lock state now that it's confirmed
        delete _pendingNftLocks[assetContract][tokenId];

        // Return the standard receiver selector
        return IERC721Receiver.onERC721Received.selector;
    }

    // --- Rescue Functions ---
    /**
     * @notice Allows the owner to rescue ERC20 tokens sent to the vault accidentally or remaining after unlocks.
     * @dev Only rescues tokens that are NOT accounted for in `totalLockedERC20`.
     */
    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner nonReentrant {
        // (Rescue logic remains the same as the previous corrected version)
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (amount == 0) revert NonPositiveAmount();

        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        uint256 currentlyLockedTotal = totalLockedERC20[tokenAddress];

        uint256 available = 0;
         if (balance > currentlyLockedTotal) {
             available = balance - currentlyLockedTotal;
         }
        // Cannot rescue more than the available (unlocked) balance
        if (amount > available) revert InsufficientRescueBalance();

        token.safeTransfer(owner(), amount);
        emit TokensRescued(tokenAddress, owner(), amount, false);
    }

   /**
     * @notice Allows the owner to rescue an ERC721 token sent to the vault accidentally.
     * @dev Prevents rescuing NFTs that are currently marked as locked anywhere in the vault.
     */
    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner nonReentrant {
        // (Rescue logic remains the same as the previous corrected version)
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        // Cannot rescue if the token is currently locked in any wrapper
        if (isTokenLockedAnywhere[tokenAddress][tokenId]) revert CannotRescueLockedNFT();

        // Check if the vault actually owns the token before attempting transfer
        try IERC721(tokenAddress).ownerOf(tokenId) returns (address currentOwner) {
             if (currentOwner != address(this)) {
                 revert TokenNotHeldByVault(tokenAddress, tokenId);
             }
        } catch {
             revert TokenNotHeldByVault(tokenAddress, tokenId);
        }

        // Perform the rescue transfer
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
        emit TokensRescued(tokenAddress, owner(), tokenId, true);
    }

    // --- View Functions ---
    /**
     * @inheritdoc IAssetWrapperVault
     */
    function lockedERC20Balance(uint256 wrapperId, address assetContract) external view override returns (uint256) {
         return _lockedERC20Balance[wrapperId][assetContract];
    }
}