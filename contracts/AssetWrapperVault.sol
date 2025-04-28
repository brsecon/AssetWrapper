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

    function lockAsset(
        address user,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    ) external override onlyWrapperNFT nonReentrant returns (bool) {
        if (user == address(0)) revert ZeroUserAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) {
            uint256 tokenId = idOrAmount;
            if (isNFTLocked[wrapperId][assetContract][tokenId] || isTokenLockedAnywhere[assetContract][tokenId]) {
                revert NftAlreadyLocked();
            }
            _expectedTokenIdMarker[assetContract][tokenId] = wrapperId + 1;
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId);
            isNFTLocked[wrapperId][assetContract][tokenId] = true;
            isTokenLockedAnywhere[assetContract][tokenId] = true;
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);
        } else {
            uint256 amount = idOrAmount;
            if (amount == 0) revert NonPositiveAmount();
            IERC20 token = IERC20(assetContract);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(user, address(this), amount);
            uint256 actualReceived = token.balanceOf(address(this)) - balanceBefore;
            if (actualReceived == 0) revert NonPositiveAmount();
            lockedERC20Balance[wrapperId][assetContract] += actualReceived;
            totalLockedERC20[assetContract] += actualReceived;
            emit AssetLocked(wrapperId, user, assetContract, actualReceived, false);
        }
        return true;
    }

    function unlockAsset(
        address recipient,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    ) external override onlyWrapperNFT nonReentrant returns (bool) {
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
            uint256 amount = idOrAmount;
            if (amount == 0) revert NonPositiveAmount();
            uint256 currentLocked = lockedERC20Balance[wrapperId][assetContract];
            if (currentLocked < amount) revert InsufficientLockedBalance();
            lockedERC20Balance[wrapperId][assetContract] = currentLocked - amount;
            totalLockedERC20[assetContract] -= amount;
            IERC20(assetContract).safeTransfer(recipient, amount);
            emit AssetUnlocked(wrapperId, recipient, assetContract, amount, false);
        }
        return true;
    }

    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256 tokenId,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        address assetContract = msg.sender;
        if (_expectedTokenIdMarker[assetContract][tokenId] == 0) revert UnexpectedTokenReceipt();
        delete _expectedTokenIdMarker[assetContract][tokenId];
        return IERC721Receiver.onERC721Received.selector;
    }

    function rescueERC20(address tokenAddress, uint256 amount) external onlyOwner {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (amount == 0) revert NonPositiveAmount();
        IERC20 token = IERC20(tokenAddress);
        uint256 available = token.balanceOf(address(this)) - totalLockedERC20[tokenAddress];
        if (amount > available) revert InsufficientRescueBalance();
        token.safeTransfer(owner(), amount);
        emit TokensRescued(tokenAddress, owner(), amount, false);
    }

    function rescueERC721(address tokenAddress, uint256 tokenId) external onlyOwner {
        if (tokenAddress == address(0)) revert ZeroAssetContractAddress();
        if (isTokenLockedAnywhere[tokenAddress][tokenId]) revert CannotRescueLockedNFT();
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
        emit TokensRescued(tokenAddress, owner(), tokenId, true);
    }

    function _isLockedNFT(address assetContract, uint256 tokenId) internal view returns (bool) {
        return isTokenLockedAnywhere[assetContract][tokenId];
    }
}