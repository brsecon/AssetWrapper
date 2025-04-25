// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// OpenZeppelin imports (Global imports kept as requested)
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// Local imports
import "./interfaces/IAssetWrapperVault.sol";

/**
 * @title AssetWrapperVault
 * @dev Secure escrow for assets wrapped via AssetWrapperNFT. Uses Custom Errors.
 */
contract AssetWrapperVault is Ownable, ReentrancyGuard, IAssetWrapperVault, IERC721Receiver {
    using SafeERC20 for IERC20;

    // --- Custom Errors ---
    error UnauthorizedCaller();
    error ZeroWrapperNftAddress();
    error ZeroUserAddress();
    error ZeroAssetContractAddress();
    error NftAlreadyLocked();
    error NonPositiveAmount();
    error ZeroRecipientAddress();
    error NftNotLocked();
    error InsufficientLockedBalance();

    // --- State Variables ---
    address public wrapperNftContractAddress;
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isNFTLocked;
    mapping(uint256 => mapping(address => uint256)) public lockedERC20Balance;

    // --- Events ---
    event WrapperNftAddressSet(address indexed newWrapperNftAddress);
    event AssetLocked(uint256 indexed wrapperId, address indexed user, address indexed assetContract, uint256 idOrAmount, bool isNFT);
    event AssetUnlocked(uint256 indexed wrapperId, address indexed recipient, address indexed assetContract, uint256 idOrAmount, bool isNFT);

    // --- Modifiers ---
    modifier onlyWrapperNFT() {
        if (msg.sender != wrapperNftContractAddress) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // --- Constructor ---
    constructor(address initialOwner) Ownable(initialOwner) {}

    // --- Admin Functions ---
    function setWrapperNftAddress(address newWrapperNftAddress) external onlyOwner {
        if (newWrapperNftAddress == address(0)) {
            revert ZeroWrapperNftAddress();
        }
        wrapperNftContractAddress = newWrapperNftAddress;
        emit WrapperNftAddressSet(newWrapperNftAddress);
    }

    // --- Core Functions (IAssetWrapperVault Implementation) ---

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
        returns (bool success)
    {
        if (user == address(0)) revert ZeroUserAddress();
        if (assetContract == address(0)) revert ZeroAssetContractAddress();

        if (isNFT) { // Lock ERC721
            uint256 tokenId = idOrAmount;
            if (isNFTLocked[wrapperId][assetContract][tokenId]) {
                 revert NftAlreadyLocked();
            }
            isNFTLocked[wrapperId][assetContract][tokenId] = true; // State update BEFORE external call
            IERC721(assetContract).safeTransferFrom(user, address(this), tokenId);
            emit AssetLocked(wrapperId, user, assetContract, tokenId, true);
        } else { // Lock ERC20
            uint256 amount = idOrAmount;
            if (amount == 0) { // Check for 0 instead of > 0
                revert NonPositiveAmount();
            }
            uint256 previousBalance = lockedERC20Balance[wrapperId][assetContract];
            lockedERC20Balance[wrapperId][assetContract] = previousBalance + amount; // State update BEFORE external call
            IERC20 token = IERC20(assetContract);
            token.safeTransferFrom(user, address(this), amount);
            emit AssetLocked(wrapperId, user, assetContract, amount, false);
        }
        return true;
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
        if (assetContract == address(0)) revert ZeroAssetContractAddress(); // Reusing error

        if (isNFT) { // Unlock ERC721
            uint256 tokenId = idOrAmount;
            if (!isNFTLocked[wrapperId][assetContract][tokenId]) {
                revert NftNotLocked();
            }
            isNFTLocked[wrapperId][assetContract][tokenId] = false; // Update state BEFORE external call
            IERC721(assetContract).safeTransferFrom(address(this), recipient, tokenId);
            emit AssetUnlocked(wrapperId, recipient, assetContract, tokenId, true);
        } else { // Unlock ERC20
            uint256 amount = idOrAmount;
             if (amount == 0) { // Check for 0 instead of > 0
                revert NonPositiveAmount();
            }
            uint256 currentLockedBalance = lockedERC20Balance[wrapperId][assetContract];
            if (currentLockedBalance < amount) {
                 revert InsufficientLockedBalance();
            }
            lockedERC20Balance[wrapperId][assetContract] = currentLockedBalance - amount; // Update state BEFORE external call
            IERC20 token = IERC20(assetContract);
            token.safeTransfer(recipient, amount);
            emit AssetUnlocked(wrapperId, recipient, assetContract, amount, false);
        }
        return true;
    }

    // --- ERC721 Receiver Hook ---
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}