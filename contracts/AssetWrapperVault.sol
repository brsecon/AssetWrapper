// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol"; // ERC165 kontrolü için eklendi
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
    error UnexpectedTokenReceipt(); // Keep this for basic check
    error InvalidTokenReceiptData(); // Added for Finding 3
    error WrongWrapperForTokenReceipt(); // Added for Finding 3
    error CannotRescueLockedNFT();
    error InsufficientRescueBalance();
    error AssetNotERC721(); // Added for Finding 7
    error AssetNotERC20(); // Added for Finding 7

    // --- State Variables ---
    address public wrapperNftContractAddress;

    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isNFTLocked; // wrapperId -> asset -> tokenId -> locked?
    // AUDIT FINDING 8 NOTE: Naming convention _internalVariable / publicGetter() is standard.
    // Maps wrapperId -> assetContract -> locked balance for that specific wrapper
    mapping(uint256 => mapping(address => uint256)) internal _lockedERC20Balance;
    mapping(address => mapping(uint256 => bool)) public isTokenLockedAnywhere; // asset -> tokenId -> locked anywhere? (For NFTs)
    mapping(address => uint256) public totalLockedERC20; // asset -> total amount locked across all wrappers
    // AUDIT FINDING 3 FIX: Marker now stores expected wrapperId+1 to link received NFT to specific lock operation
    mapping(address => mapping(uint256 => uint256)) private _expectedTokenIdMarker; // asset -> tokenId -> expected wrapperId + 1

    // --- Events ---
    event WrapperNftAddressSet(address indexed newWrapperNftAddress);
    event AssetLocked(uint256 indexed wrapperId, address indexed user, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event AssetUnlocked(uint256 indexed wrapperId, address indexed recipient, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event TokensRescued(address indexed token, address indexed to, uint256 idOrAmount, bool isNFT); // This event existed

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
     * @dev Includes ERC165 checks (Audit Finding 7).
     * For NFTs, uses safeTransferFrom with encoded wrapperId data (Audit Finding 3 fix).
     * For ERC20s, calculates actual received amount (Audit Finding 1 addressed via comment).
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
        // --- Input Validation ---
        if (user == address(0)) revert ZeroUserAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            // --- ERC721 Locking ---
            uint256 tokenId = idOrAmount;
            // AUDIT FINDING 7 FIX: Check if asset contract supports ERC721
            if (!IERC165(assetContract).supportsInterface(type(IERC721).interfaceId)) {
                 revert AssetNotERC721();
            }
            // Check if already locked
            if (isNFTLocked[wrapperId][assetContract][tokenId] || isTokenLockedAnywhere[assetContract][tokenId]) {
                revert NftAlreadyLocked();
            }

            // --- Effects (Before Interaction - Marker) ---
            // AUDIT FINDING 3 FIX: Store expected wrapperId+1 in marker
            _expectedTokenIdMarker[assetContract][tokenId] = wrapperId + 1;

            // --- Interaction ---
            // AUDIT FINDING 3 FIX: Send wrapperId in data field
            bytes memory transferData = abi.encode(wrapperId);
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId, transferData);

            // --- Effects (After Interaction) ---
            // Marker is cleared in onERC721Received upon successful validation
            isNFTLocked[wrapperId][assetContract][tokenId] = true;
            isTokenLockedAnywhere[assetContract][tokenId] = true;
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);
            return (true, tokenId);

        } else {
            // --- ERC20 Locking ---
            uint256 amountSpecified = idOrAmount;
            // AUDIT FINDING 7 FIX: Check if asset contract supports ERC20
             if (!IERC165(assetContract).supportsInterface(type(IERC20).interfaceId)) {
                 revert AssetNotERC20();
            }
            if (amountSpecified == 0) revert NonPositiveAmount();

            IERC20 token = IERC20(assetContract);
            // AUDIT FINDING 1 NOTE: Calculating received amount via balance delta is standard
            // practice for fee-on-transfer compatibility, despite theoretical edge cases.
            uint256 balanceBefore = token.balanceOf(address(this));

            // --- Interaction ---
            token.safeTransferFrom(user, address(this), amountSpecified);

            // --- Effects (After Interaction) ---
            uint256 balanceAfter = token.balanceOf(address(this));
            uint256 actualReceived = balanceAfter - balanceBefore;

            // Revert if zero received (e.g., 100% fee token or issue)
            if (actualReceived == 0) revert NonPositiveAmount();

            _lockedERC20Balance[wrapperId][assetContract] += actualReceived;
            totalLockedERC20[assetContract] += actualReceived;
            emit AssetLocked(wrapperId, user, assetContract, actualReceived, false);
            return (true, actualReceived);
        }
    }

    /**
     * @inheritdoc IAssetWrapperVault
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
        // --- Input Validation ---
        if (recipient == address(0)) revert ZeroRecipientAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            // --- ERC721 Unlocking ---
            uint256 tokenId = idOrAmount;
            // Check if locked specifically for this wrapper
            if (!isNFTLocked[wrapperId][assetContract][tokenId]) revert NftNotLocked();

            // --- Effects ---
            isNFTLocked[wrapperId][assetContract][tokenId] = false;
            isTokenLockedAnywhere[assetContract][tokenId] = false; // Mark as globally unlocked

            // --- Interaction ---
            IERC721(assetContract).safeTransferFrom(address(this), recipient, tokenId);
            emit AssetUnlocked(wrapperId, recipient, assetContract, tokenId, true);

        } else {
            // --- ERC20 Unlocking ---
            uint256 amountToUnlock = idOrAmount;
            if (amountToUnlock == 0) revert NonPositiveAmount();

            uint256 currentLocked = _lockedERC20Balance[wrapperId][assetContract];
            if (currentLocked < amountToUnlock) revert InsufficientLockedBalance();

            // --- Effects ---
            _lockedERC20Balance[wrapperId][assetContract] = currentLocked - amountToUnlock;
            // Ensure total locked doesn't underflow (shouldn't happen if logic is correct)
            if (totalLockedERC20[assetContract] >= amountToUnlock) {
                 totalLockedERC20[assetContract] -= amountToUnlock;
            } else {
                 // This case indicates an internal state inconsistency
                 totalLockedERC20[assetContract] = 0; // Reset to prevent underflow, but signals an issue
            }


            // --- Interaction ---
            IERC20(assetContract).safeTransfer(recipient, amountToUnlock);
            emit AssetUnlocked(wrapperId, recipient, assetContract, amountToUnlock, false);
        }
        return true;
    }

    /**
     * @inheritdoc IERC721Receiver
     * @dev AUDIT FINDING 3 FIX: Validates received token against expected marker (including wrapperId).
     */
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256 tokenId,
        bytes calldata data /* data */
    ) external override returns (bytes4) {
        address assetContract = msg.sender; // The token contract calling this hook

        // Retrieve expected marker (wrapperId + 1)
        uint256 expectedMarker = _expectedTokenIdMarker[assetContract][tokenId];

        // Basic check: Was this token expected at all?
        if (expectedMarker == 0) revert UnexpectedTokenReceipt();

        // AUDIT FINDING 3 FIX: Decode wrapperId from data and validate
        uint256 receivedWrapperId;
        if (data.length == 32) { // Simple check for single uint256 encoding
             receivedWrapperId = abi.decode(data, (uint256));
        } else {
             revert InvalidTokenReceiptData(); // Revert if data is not as expected
        }


        // Check if the received wrapperId matches the one stored in the marker
        // expectedMarker = actual_wrapperId + 1
        if (expectedMarker != receivedWrapperId + 1) {
            revert WrongWrapperForTokenReceipt();
        }

        // --- Effects ---
        // Clear the marker after successful reception and validation
        delete _expectedTokenIdMarker[assetContract][tokenId];

        return IERC721Receiver.onERC721Received.selector;
    }

    // --- Rescue Functions ---
    // Consider adding timelocks to these functions in production

    /**
     * @notice Allows the owner to rescue non-locked ERC20 tokens accidentally sent to the vault.
     */
    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner nonReentrant {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (amount == 0) revert NonPositiveAmount();

        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        uint256 currentlyLockedTotal = totalLockedERC20[tokenAddress];

        // Calculate available balance (not part of any wrapper)
        uint256 available = balance - currentlyLockedTotal; // Potential underflow if state inconsistent
         if (balance < currentlyLockedTotal) { // Check for state inconsistency
            available = 0;
         }

        if (amount > available) revert InsufficientRescueBalance();

        token.safeTransfer(owner(), amount);
        emit TokensRescued(tokenAddress, owner(), amount, false); // Event existed
    }

    /**
     * @notice Allows the owner to rescue non-locked ERC721 tokens accidentally sent to the vault.
     */
    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner nonReentrant {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();

        // Check if the token is locked in *any* wrapper
        if (isTokenLockedAnywhere[tokenAddress][tokenId]) revert CannotRescueLockedNFT();

        // Check if token is actually here (ownerOf throws if not)
        // This also prevents rescuing tokens that were expected but failed validation in onReceived
        require(IERC721(tokenAddress).ownerOf(tokenId) == address(this), "Vault: Token not held");


        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
        emit TokensRescued(tokenAddress, owner(), tokenId, true); // Event existed
    }

    // --- View Functions ---

     /**
      * @inheritdoc IAssetWrapperVault
      */
    function lockedERC20Balance(uint256 wrapperId, address assetContract) external view override returns (uint256) {
         // Returns the balance locked specifically for this wrapperId and assetContract
         return _lockedERC20Balance[wrapperId][assetContract];
    }

    // --- Internal Helpers ---
    function _isLockedNFT(address assetContract, uint256 tokenId) internal view returns (bool) {
        return isTokenLockedAnywhere[assetContract][tokenId];
    }
}