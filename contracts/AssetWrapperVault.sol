// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./interfaces/IAssetWrapperVault.sol";

contract AssetWrapperVault is Ownable, ReentrancyGuard, IAssetWrapperVault, IERC721Receiver {
    using SafeERC20 for IERC20;

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
    error CannotRescueLockedNFT();
    error InsufficientRescueBalance();

    address public wrapperNftContractAddress;

    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isNFTLocked;
    mapping(uint256 => mapping(address => uint256)) public lockedERC20Balance;
    mapping(address => mapping(uint256 => bool)) public isTokenLockedAnywhere;
    mapping(address => uint256) public totalLockedERC20;
    mapping(address => mapping(uint256 => uint256)) private _expectedTokenIdMarker;

    event WrapperNftAddressSet(address indexed newWrapperNftAddress);
    event AssetLocked(uint256 indexed wrapperId, address indexed user, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event AssetUnlocked(uint256 indexed wrapperId, address indexed recipient, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event TokensRescued(address indexed token, address indexed to, uint256 idOrAmount, bool isNFT);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyWrapperNFT() {
        if (msg.sender != wrapperNftContractAddress) revert UnauthorizedCaller();
        _;
    }

    function setWrapperNftAddress(address newWrapperNftAddress) external onlyOwner {
        if (newWrapperNftAddress == address(0)) revert ZeroWrapperNftAddress();
        wrapperNftContractAddress = newWrapperNftAddress;
        emit WrapperNftAddressSet(newWrapperNftAddress);
    }

    /**
     * @inheritdoc IAssetWrapperVault
     */
    function lockAsset(
        address user,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount, // User specified amount for ERC20
        bool isNFT
    )
        external
        override // <<< DEĞİŞİKLİK: override eklendi (arayüz değiştiği için)
        onlyWrapperNFT
        nonReentrant
        returns (bool success, uint256 actualIdOrAmount) // <<< DEĞİŞİKLİK: Dönüş değeri imzası değişti
    {
        if (user == address(0)) revert ZeroUserAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            if (isNFTLocked[wrapperId][assetContract][tokenId] || isTokenLockedAnywhere[assetContract][tokenId]) {
                revert NftAlreadyLocked();
            }
            _expectedTokenIdMarker[assetContract][tokenId] = wrapperId + 1; // Use non-zero value
            // --- Interaction ---
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId);
            // --- Effects (after successful transfer) ---
            isNFTLocked[wrapperId][assetContract][tokenId] = true;
            isTokenLockedAnywhere[assetContract][tokenId] = true;
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);
            return (true, tokenId); // <<< DEĞİŞİKLİK: Başarı ve tokenId döndürülüyor
        } else {
            uint256 amountSpecified = idOrAmount; // User specified amount
            if (amountSpecified == 0) revert NonPositiveAmount(); // Check specified amount first
            IERC20 token = IERC20(assetContract);
            uint256 balanceBefore = token.balanceOf(address(this));
            // --- Interaction ---
            token.safeTransferFrom(user, address(this), amountSpecified);
             // --- Effects (after successful transfer) ---
            uint256 balanceAfter = token.balanceOf(address(this));
            // Calculate actual received amount, robust against fee-on-transfer tokens
            uint256 actualReceived = balanceAfter - balanceBefore;
            // Even if the transfer succeeds, if the actual received amount is zero (e.g., 100% fee), treat as failure
            if (actualReceived == 0) revert NonPositiveAmount();

            lockedERC20Balance[wrapperId][assetContract] += actualReceived;
            totalLockedERC20[assetContract] += actualReceived;
            emit AssetLocked(wrapperId, user, assetContract, actualReceived, false);
            return (true, actualReceived); // <<< DEĞİŞİKLİK: Başarı ve GERÇEKTE ALINAN miktar döndürülüyor
        }
        // Not reachable due to return statements inside if/else, but needed for compiler if structure was different
        // return (false, 0);
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
        override // <<< DEĞİŞİKLİK: override eklendi (arayüz değiştiği için)
        onlyWrapperNFT
        nonReentrant
        returns (bool success) // Dönüş değeri aynı kaldı
    {
        if (recipient == address(0)) revert ZeroRecipientAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            if (!isNFTLocked[wrapperId][assetContract][tokenId]) revert NftNotLocked();
            // --- Effects ---
            isNFTLocked[wrapperId][assetContract][tokenId] = false;
            isTokenLockedAnywhere[assetContract][tokenId] = false; // Mark as globally unlocked
             // --- Interaction ---
            IERC721(assetContract).safeTransferFrom(address(this), recipient, tokenId);
            emit AssetUnlocked(wrapperId, recipient, assetContract, tokenId, true);
        } else {
            uint256 amountToUnlock = idOrAmount;
            if (amountToUnlock == 0) revert NonPositiveAmount();
            uint256 currentLocked = lockedERC20Balance[wrapperId][assetContract];
            if (currentLocked < amountToUnlock) revert InsufficientLockedBalance();
            // --- Effects ---
            lockedERC20Balance[wrapperId][assetContract] = currentLocked - amountToUnlock;
            totalLockedERC20[assetContract] -= amountToUnlock; // Update total locked as well
             // --- Interaction ---
            IERC20(assetContract).safeTransfer(recipient, amountToUnlock);
            emit AssetUnlocked(wrapperId, recipient, assetContract, amountToUnlock, false);
        }
        return true; // Başarı durumu döndürülüyor
    }

    /**
     * @inheritdoc IERC721Receiver
     */
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256 tokenId,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        address assetContract = msg.sender;
        // Check if this token ID was expected from this contract for any wrapper
        if (_expectedTokenIdMarker[assetContract][tokenId] == 0) revert UnexpectedTokenReceipt();
        // Clear the marker after successful reception
        delete _expectedTokenIdMarker[assetContract][tokenId];
        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @notice Allows the owner to rescue non-locked ERC20 tokens accidentally sent to the vault.
     * @param tokenAddress The address of the ERC20 token contract.
     * @param amount The amount of tokens to rescue.
     */
    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (amount == 0) revert NonPositiveAmount();
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        uint256 currentlyLockedTotal = totalLockedERC20[tokenAddress];
        // Calculate available balance (not part of any wrapper)
        uint256 available = balance - currentlyLockedTotal;
        if (amount > available) revert InsufficientRescueBalance();
        token.safeTransfer(owner(), amount);
        emit TokensRescued(tokenAddress, owner(), amount, false);
    }

    /**
     * @notice Allows the owner to rescue non-locked ERC721 tokens accidentally sent to the vault.
     * @param tokenAddress The address of the ERC721 token contract.
     * @param tokenId The ID of the token to rescue.
     */
    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        // Check if the token is locked in *any* wrapper
        if (isTokenLockedAnywhere[tokenAddress][tokenId]) revert CannotRescueLockedNFT();
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
        emit TokensRescued(tokenAddress, owner(), tokenId, true);
    }

     /**
      * @inheritdoc IAssetWrapperVault
      */
    function lockedERC20Balance(uint256 wrapperId, address assetContract) external view override returns (uint256) {
         return lockedERC20Balance[wrapperId][assetContract];
    }

    // Internal helper - not strictly needed if only used once, but can clarify intent
    function _isLockedNFT(address assetContract, uint256 tokenId) internal view returns (bool) {
        return isTokenLockedAnywhere[assetContract][tokenId];
    }
}