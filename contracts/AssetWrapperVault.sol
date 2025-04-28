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
    error UnexpectedTokenReceipt();
    error InvalidTokenReceiptData();
    error WrongWrapperForTokenReceipt();
    error CannotRescueLockedNFT();
    error InsufficientRescueBalance();
    error AssetNotERC721();
    error AssetNotERC20();

    // --- State Variables ---
    address public wrapperNftContractAddress;
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isNFTLocked;
    // AUDIT FINDING 8 NOTE: Naming convention _internalVariable / publicGetter() is standard.
    mapping(uint256 => mapping(address => uint256)) internal _lockedERC20Balance;
    mapping(address => mapping(uint256 => bool)) public isTokenLockedAnywhere;
    mapping(address => uint256) public totalLockedERC20;
    // AUDIT FINDING 3 FIX: Marker now stores expected wrapperId+1
    mapping(address => mapping(uint256 => uint256)) private _expectedTokenIdMarker;

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
     * @dev SLITHER NOTE (reentrancy-*): Pattern `Interaction -> State Write` exists for NFTs
     * (safeTransferFrom -> isNFTLocked=true). Mitigated by `nonReentrant` guard on this function.
     * SLITHER NOTE (dangerous-strict-equality): `actualReceived == 0` check is intentional
     * and necessary for handling fee-on-transfer or failed transfers correctly.
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
            if (!IERC165(assetContract).supportsInterface(type(IERC721).interfaceId)) {
                 revert AssetNotERC721();
            }
            // AUDIT 3.1 NOTE: This check was flagged as High Risk, needing review for multi-wrapper scenarios.
            // The logic checks if locked by *this* wrapper OR locked *anywhere*. Seems intended.
            if (isNFTLocked[wrapperId][assetContract][tokenId] || isTokenLockedAnywhere[assetContract][tokenId]) {
                revert NftAlreadyLocked();
            }

            // --- Effects (Before Interaction - Marker) ---
            _expectedTokenIdMarker[assetContract][tokenId] = wrapperId + 1;

            // --- Interaction ---
            bytes memory transferData = abi.encode(wrapperId);
            // External Call
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId, transferData);

            // --- Effects (After Interaction - Mitigated by nonReentrant) ---
            isNFTLocked[wrapperId][assetContract][tokenId] = true;
            isTokenLockedAnywhere[assetContract][tokenId] = true;
            // Marker cleared in onERC721Received
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);
            return (true, tokenId);

        } else {
            uint256 amountSpecified = idOrAmount;
            if (!IERC165(assetContract).supportsInterface(type(IERC20).interfaceId)) {
                 revert AssetNotERC20();
            }
            if (amountSpecified == 0) revert NonPositiveAmount();

            IERC20 token = IERC20(assetContract);
            // AUDIT FINDING 1 NOTE: Balance delta method used for fee-on-transfer compatibility.
            uint256 balanceBefore = token.balanceOf(address(this));

            // --- Interaction ---
            token.safeTransferFrom(user, address(this), amountSpecified);

            // --- Effects (After Interaction) ---
            uint256 balanceAfter = token.balanceOf(address(this));
            uint256 actualReceived = balanceAfter - balanceBefore;

            // Intentionally check for exact zero
            if (actualReceived == 0) revert NonPositiveAmount();

            _lockedERC20Balance[wrapperId][assetContract] += actualReceived;
            totalLockedERC20[assetContract] += actualReceived;
            emit AssetLocked(wrapperId, user, assetContract, actualReceived, false);
            return (true, actualReceived);
        }
    }

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
        if (recipient == address(0)) revert ZeroRecipientAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            if (!isNFTLocked[wrapperId][assetContract][tokenId]) revert NftNotLocked();
            isNFTLocked[wrapperId][assetContract][tokenId] = false;
            isTokenLockedAnywhere[assetContract][tokenId] = false;
            IERC721(assetContract).safeTransferFrom(address(this), recipient, tokenId);
            emit AssetUnlocked(wrapperId, recipient, assetContract, tokenId, true);
        } else {
            uint256 amountToUnlock = idOrAmount;
            if (amountToUnlock == 0) revert NonPositiveAmount();
            uint256 currentLocked = _lockedERC20Balance[wrapperId][assetContract];
            if (currentLocked < amountToUnlock) revert InsufficientLockedBalance();

            _lockedERC20Balance[wrapperId][assetContract] = currentLocked - amountToUnlock;

            // --- AUDIT 2.1 FIX ---
            // Replace the original if/else block with direct subtraction
            totalLockedERC20[assetContract] -= amountToUnlock;
            // --- FIX END ---

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
        address assetContract = msg.sender;
        uint256 expectedMarker = _expectedTokenIdMarker[assetContract][tokenId];
        if (expectedMarker == 0) revert UnexpectedTokenReceipt();

        // SLITHER FIX (uninitialized-local): Initialize local variable
        uint256 receivedWrapperId = 0;
        if (data.length == 32) {
             receivedWrapperId = abi.decode(data, (uint256));
        } else {
             revert InvalidTokenReceiptData();
        }

        // expectedMarker = actual_wrapperId + 1
        if (expectedMarker != receivedWrapperId + 1) {
            revert WrongWrapperForTokenReceipt();
        }

        // Clear the marker after successful validation
        delete _expectedTokenIdMarker[assetContract][tokenId];
        return IERC721Receiver.onERC721Received.selector;
    }

    // --- Rescue Functions ---
    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner nonReentrant {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (amount == 0) revert NonPositiveAmount();
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        uint256 currentlyLockedTotal = totalLockedERC20[tokenAddress];
        uint256 available = 0;
         if (balance >= currentlyLockedTotal) {
            available = balance - currentlyLockedTotal;
         }
        if (amount > available) revert InsufficientRescueBalance();
        token.safeTransfer(owner(), amount);
        emit TokensRescued(tokenAddress, owner(), amount, false);
    }

    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner nonReentrant {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (isTokenLockedAnywhere[tokenAddress][tokenId]) revert CannotRescueLockedNFT();
        require(IERC721(tokenAddress).ownerOf(tokenId) == address(this), "Vault: Token not held");
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
        emit TokensRescued(tokenAddress, owner(), tokenId, true);
    }

    // --- View Functions ---
    function lockedERC20Balance(uint256 wrapperId, address assetContract) external view override returns (uint256) {
         return _lockedERC20Balance[wrapperId][assetContract];
    }

    // --- Internal Helpers ---
    // SLITHER FIX (dead-code): Removed unused internal function _isLockedNFT
    // function _isLockedNFT(address assetContract, uint256 tokenId) internal view returns (bool) {
    //     return isTokenLockedAnywhere[assetContract][tokenId];
    // }
}