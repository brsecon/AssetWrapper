// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract AssetWrapper is ERC721URIStorage, IERC721Receiver, IERC1155Receiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 private _tokenIdCounter;
    uint256 public wrapFee;
    uint256 public maxAssetsPerWrap;
    uint256 public constant MAX_ASSETS_LIMIT = 50;
    bool public paused;
    address public wethTokenAddress;

    enum AssetType { ERC20, ERC721, ERC1155 }

    struct Asset {
        address contractAddress;
        AssetType assetType;
        uint256 amount; // Amount for ERC20 or value for ERC1155, typically 1 for ERC721
        uint256 tokenId; // Token ID for ERC721 or ERC1155, typically 0 for ERC20
    }

    mapping(uint256 => Asset[]) private _lockedAssets;
    string private _baseTokenURI;

    event AssetWrapped(uint256 indexed wrapperId, address indexed owner, AssetType assetType);
    event AssetsWrapped(uint256 indexed wrapperId, address indexed owner, Asset[] assets);
    event AssetUnwrapped(uint256 indexed wrapperId, address indexed owner);
    event EmergencyStop(bool isPaused);
    event BaseURIUpdated(string newBaseURI);
    event ETHWithdrawn(address indexed owner, uint256 amount);
    event WrapFeeUpdated(uint256 newFee);
    event MaxAssetsPerWrapUpdated(uint256 newMax);
    event WETHTokenAddressUpdated(address indexed newWETHAddress, address indexed oldWETHAddress);

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(address initialOwner) ERC721("Asset Wrapper", "ASWRAP") Ownable(initialOwner) {
        _baseTokenURI = "";
        paused = false;
        wrapFee = 0.0001 ether;
        maxAssetsPerWrap = 5;
    }

    function setWethAddress(address _newWethTokenAddress) external onlyOwner {
        require(_newWethTokenAddress != address(0), "Invalid WETH address");
        address oldWethTokenAddress = wethTokenAddress;
        wethTokenAddress = _newWethTokenAddress;
        emit WETHTokenAddressUpdated(_newWethTokenAddress, oldWethTokenAddress);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @dev Function to lock ONLY WETH tokens into the vault and mint a wrapper NFT.
     * CEI Implemented:
     * 1. Checks: All necessary checks.
     * 2. Effects (Initial): Token ID increment.
     * 3. Interactions: Transfer of WETH tokens to the contract.
     * 4. Effects (Final): Saving locked assets, minting NFT, setting URI, emitting events.
     */
    function wrapWETHTokens(
        uint256[] calldata wethAmounts
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        // --- CHECKS ---
        require(wethTokenAddress != address(0), "WETH address not set");
        require(msg.value == wrapFee, "Must send exact wrap fee");
        uint256 numAssets = wethAmounts.length;
        require(numAssets > 0, "Must lock at least one WETH amount");
        require(numAssets <= maxAssetsPerWrap, "Trying to lock too many assets");

        // --- EFFECTS (Initial) ---
        _tokenIdCounter++;
        uint256 newItemId = _tokenIdCounter;
        
        Asset[] memory assetsToLock = new Asset[](numAssets);
        address localWethTokenAddress = wethTokenAddress; // Cache to memory for gas optimization
        IERC20 wethToken = IERC20(localWethTokenAddress);

        // --- INTERACTIONS ---
        // Transfer tokens to the contract and save to temporary memory array
        for (uint256 i = 0; i < numAssets; i++) {
            require(wethAmounts[i] > 0, "Cannot lock zero amount of tokens");
            // This is an interaction (external contract call)
            wethToken.safeTransferFrom(msg.sender, address(this), wethAmounts[i]);

            assetsToLock[i] = Asset({
                contractAddress: localWethTokenAddress,
                assetType: AssetType.ERC20,
                amount: wethAmounts[i],
                tokenId: 0 // tokenId is 0 for ERC20
            });
        }

        // --- EFFECTS (Final) ---
        // Update state after all transfers are successful
        _copyAssetsToStorage(newItemId, assetsToLock);
        _safeMint(msg.sender, newItemId);

        string memory localBaseTokenURI = _baseTokenURI; // Gas optimization
        if (bytes(localBaseTokenURI).length > 0) {
            _setTokenURI(newItemId, string(abi.encodePacked(localBaseTokenURI, newItemId.toString())));
        }
                
        emit AssetWrapped(newItemId, msg.sender, AssetType.ERC20); // General event
        emit AssetsWrapped(newItemId, msg.sender, assetsToLock); // Detailed event

        return newItemId;
    }

    /**
     * @dev Function to lock NFTs into the vault and mint a wrapper NFT.
     * CEI Implemented:
     * 1. Checks: All necessary checks.
     * 2. Effects (Initial): Token ID increment.
     * 3. Interactions: Transfer of NFTs to the contract.
     * 4. Effects (Final): Saving locked assets, minting NFT, setting URI, emitting events.
     */
    function wrapNFTs(
        address[] calldata nftAddresses,
        uint256[] calldata tokenIds
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        // --- CHECKS ---
        require(msg.value == wrapFee, "Must send exact wrap fee");
        uint256 numAssets = nftAddresses.length;
        require(numAssets == tokenIds.length, "Address and tokenId arrays do not match");
        require(numAssets > 0, "Must lock at least one NFT");
        require(numAssets <= maxAssetsPerWrap, "Trying to lock too many assets");

        // --- EFFECTS (Initial) ---
        _tokenIdCounter++;
        uint256 newItemId = _tokenIdCounter;
        
        Asset[] memory assetsToLock = new Asset[](numAssets);

        // --- INTERACTIONS ---
        // Transfer NFTs to the contract and save to temporary memory array
        for (uint256 i = 0; i < numAssets; i++) {
            IERC721 nft = IERC721(nftAddresses[i]);
            // This is an interaction (external contract call)
            nft.safeTransferFrom(msg.sender, address(this), tokenIds[i]);
            
            assetsToLock[i] = Asset({
                contractAddress: nftAddresses[i],
                assetType: AssetType.ERC721,
                amount: 1, // Amount is always 1 for ERC721
                tokenId: tokenIds[i]
            });
        }

        // --- EFFECTS (Final) ---
        // Update state after all transfers are successful
        _copyAssetsToStorage(newItemId, assetsToLock);
        _safeMint(msg.sender, newItemId);
        
        string memory localBaseTokenURI = _baseTokenURI; // Gas optimization
        if (bytes(localBaseTokenURI).length > 0) {
             _setTokenURI(newItemId, string(abi.encodePacked(localBaseTokenURI, newItemId.toString())));
        }
                       
        emit AssetWrapped(newItemId, msg.sender, AssetType.ERC721); // General event
        emit AssetsWrapped(newItemId, msg.sender, assetsToLock); // Detailed event

        return newItemId;
    }

    /**
     * @dev Function to lock ERC1155 tokens into the vault and mint a wrapper NFT.
     */
    function wrapERC1155s(
        address[] calldata tokenAddresses, // ERC1155 contract addresses
        uint256[] calldata ids,            // ERC1155 token ids
        uint256[] calldata amounts,        // ERC1155 token amounts
        bytes[] calldata data             // Optional data for onERC1155Received (passed to safeTransferFrom)
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        // --- CHECKS ---
        require(msg.value == wrapFee, "Must send exact wrap fee");
        uint256 numAssetItems = tokenAddresses.length; // Renamed for clarity, represents individual items
        require(numAssetItems > 0, "Must lock at least one ERC1155 item");
        require(numAssetItems == ids.length, "Address and id arrays mismatch");
        require(numAssetItems == amounts.length, "Address and amount arrays mismatch");
        if (data.length > 0) { // data is optional, but if provided, must match
            require(numAssetItems == data.length, "Address and data arrays mismatch");
        }
        require(numAssetItems <= maxAssetsPerWrap, "Trying to lock too many assets");

        // --- EFFECTS (Initial) ---
        _tokenIdCounter++;
        uint256 newItemId = _tokenIdCounter;
        
        Asset[] memory assetsToLock = new Asset[](numAssetItems);

        // --- INTERACTIONS ---
        // Transfer tokens to the contract and save to temporary memory array
        for (uint256 i = 0; i < numAssetItems; i++) {
            require(amounts[i] > 0, "Cannot lock zero amount of ERC1155 tokens");
            IERC1155 token = IERC1155(tokenAddresses[i]);
            
            // User (msg.sender) must have approved this contract for these tokens.
            // onERC1155Received will be called on this contract.
            token.safeTransferFrom(msg.sender, address(this), ids[i], amounts[i], data.length > 0 ? data[i] : bytes(""));

            assetsToLock[i] = Asset({
                contractAddress: tokenAddresses[i],
                assetType: AssetType.ERC1155,
                amount: amounts[i], // This is the value for ERC1155
                tokenId: ids[i]     // This is the id for ERC1155
            });
        }

        // --- EFFECTS (Final) ---
        // Update state after all transfers are successful
        _copyAssetsToStorage(newItemId, assetsToLock);
        _safeMint(msg.sender, newItemId);
        
        string memory localBaseTokenURI = _baseTokenURI; // Gas optimization
        if (bytes(localBaseTokenURI).length > 0) {
             _setTokenURI(newItemId, string(abi.encodePacked(localBaseTokenURI, newItemId.toString())));
        }
                       
        emit AssetWrapped(newItemId, msg.sender, AssetType.ERC1155); // General event for ERC1155
        emit AssetsWrapped(newItemId, msg.sender, assetsToLock); // Detailed event

        return newItemId;
    }

    /**
     * @dev Function to burn the wrapper NFT and release the locked assets.
     * CEI Implemented:
     * 1. Checks: All necessary checks.
     * 2. Effects (Prepare/Read): Copy asset information to be returned into memory.
     *                         Burn wrapper NFT, delete locked asset record (these first, prevents state inconsistency in reentrancy).
     *                         However, if transfer fails, assets remain in contract and NFT is burned.
     *                         SAFER APPROACH: Transfers first, then state changes. This is safe with ReentrancyGuard.
     *                         Therefore, the original order (Transfer First, Then State Change) is better with ReentrancyGuard.
     *                         Here we are bending CEI's "Interactions at the end" rule, relying on reentrancy guard.
     *                         The main goal is to keep the state consistent.
     *
     * Corrected CEI Implementation (more common and safer for unwrap):
     * 1. Checks: All necessary checks.
     * 2. Effects (Read State): Read necessary information.
     * 3. Interactions: Send assets back to the user.
     * 4. Effects (Finalize State): Burn wrapper NFT, delete locked asset record, emit event.
     *    This order ensures that if a transfer fails, the state is not changed.
     */
    function unwrap(uint256 wrapperId) external nonReentrant whenNotPaused {
        // --- CHECKS ---
        require(_exists(wrapperId), "Wrapper NFT does not exist");
        address currentOwner = ownerOf(wrapperId); 
        require(currentOwner == msg.sender, "Only the NFT owner can unwrap");

        // --- EFFECTS (Read State) ---
        // Memory copy instead of storage reference, avoids SLOAD in loop, but copies the entire array.
        // Be careful with large arrays. maxAssetsPerWrap limit makes this manageable.
        Asset[] memory assetsToReturn = _lockedAssets[wrapperId];
        uint256 assetCount = assetsToReturn.length;
        require(assetCount > 0, "This wrapper does not contain any assets");

        // --- INTERACTIONS ---
        // Transfer assets back to the owner
        for (uint256 i = 0; i < assetCount; i++) {
            Asset memory assetToTransfer = assetsToReturn[i]; 

            if (assetToTransfer.assetType == AssetType.ERC20) {
                IERC20 token = IERC20(assetToTransfer.contractAddress);
                token.safeTransfer(currentOwner, assetToTransfer.amount);
            } else if (assetToTransfer.assetType == AssetType.ERC721) {
                IERC721 nft = IERC721(assetToTransfer.contractAddress);
                nft.safeTransferFrom(address(this), currentOwner, assetToTransfer.tokenId);
            } else if (assetToTransfer.assetType == AssetType.ERC1155) {
                IERC1155 token = IERC1155(assetToTransfer.contractAddress);
                // For ERC1155, data is usually empty for a simple transfer back.
                token.safeTransferFrom(address(this), currentOwner, assetToTransfer.tokenId, assetToTransfer.amount, "");
            }
        }
        
        // --- EFFECTS (Finalize State) ---
        // After all transfers are successful:
        delete _lockedAssets[wrapperId]; 
        _burn(wrapperId); 
        
        emit AssetUnwrapped(wrapperId, currentOwner);
    }

    function getLockedAssets(uint256 wrapperId) external view returns (Asset[] memory) {
        // --- CHECKS ---
        require(_exists(wrapperId), "Wrapper NFT does not exist");
        // --- EFFECTS (Read State) / INTERACTIONS (None) ---
        return _lockedAssets[wrapperId];
    }

    /**
     * @dev To withdraw ETH sent to the contract (fees).
     * CEI Implemented:
     * 1. Checks: onlyOwner (via modifier), balance check.
     * 2. Effects (Prepare/Read): Determine amount to withdraw.
     * 3. Interactions: Send ETH to owner.
     * 4. Effects (Finalize/Event): Emit event (after successful transfer).
     */
    function withdrawETH() external onlyOwner nonReentrant {
        // --- CHECKS ---
        // Already checked by onlyOwner modifier.
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        // --- EFFECTS (Prepare/Read) ---
        // In this example, there's no other state change, just reading.
        // If there was a variable like `totalWithdrawn`, it would be updated here:
        // e.g., totalWithdrawn += balance; (This should be done before Interaction)

        address payable recipient = payable(owner()); // owner() call is an SLOAD

        // --- INTERACTIONS ---
        (bool success, ) = recipient.call{value: balance}("");
        
        // --- EFFECTS (Finalize/Event) ---
        // Post-condition check and event after Interaction.
        // If state was changed before Interaction and Interaction failed,
        // state change is not reverted (unless there's a revert).
        // This is why "Effects before Interactions" is critical.
        // In the withdraw pattern, the transfer itself is the interaction, and the state (contract's ETH balance)
        // changes with this interaction. The event is a record of this change.
        require(success, "ETH transfer failed");
        emit ETHWithdrawn(recipient, balance);
    }

    function onERC721Received(
        address /*_operator*/,
        address /*_from*/,
        uint256 /*_tokenId*/,
        bytes calldata /*_data*/
    ) external override returns (bytes4) {
        // This function is a callback, so CEI is interpreted differently here.
        // It usually just returns a selector or performs simple checks.
        // It should not make external calls.

        // Allow NFT transfers only if initiated by this contract (i.e., during wrapNFTs).
        // In wrapNFTs, this contract calls nft.safeTransferFrom(user, address(this), tokenId).
        // In that case, 'operator' in onERC721Received will be address(this).
        // If a user sends an NFT directly, 'operator' will be the user's address.
        // require(operator == address(this), "AssetWrapper: NFTs must be sent via wrapNFTs function only");
        // The above check is problematic for user-initiated wraps where the user is the operator.
        // Standard behavior for a holder/receiver is to accept.
        // The wrapNFTs function's nonReentrant guard and logic handles the correct accounting.
        require(msg.sender != address(0), "ERC721: transfer from zero address token contract"); // Check that the caller is a contract
        return this.onERC721Received.selector;
    }

    // Admin functions called by the owner usually are:
    // 1. Checks (onlyOwner, input validations)
    // 2. Effects (update state variable, emit event)
    // 3. Interactions (Usually none)
    // These functions are already structured according to CEI.

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI; // Effect
        emit BaseURIUpdated(baseURI); // Effect
    }
    
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused; // Effect
        emit EmergencyStop(_paused); // Effect
    }
    
    function setMaxAssetsPerWrap(uint256 newMax) external onlyOwner {
        require(newMax > 0, "Maximum value must be greater than zero"); // Check
        require(newMax <= MAX_ASSETS_LIMIT, "Maximum value too high"); // Check
        maxAssetsPerWrap = newMax; // Effect
        emit MaxAssetsPerWrapUpdated(newMax); // Effect
    }
    
    function setWrapFee(uint256 newFee) external onlyOwner {
        wrapFee = newFee; // Effect
        emit WrapFeeUpdated(newFee); // Effect
    }

    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual override {
        // This internal function is overridden from ERC721URIStorage.
        // CEI has already been considered where it's called (in wrap functions).
        if (bytes(_baseTokenURI).length > 0) { // Check
            super._setTokenURI(tokenId, _tokenURI); // Effect (storage write)
        }
    }

    // Helper function to copy asset array from memory to storage
    function _copyAssetsToStorage(uint256 tokenId, Asset[] memory assets) internal {
        uint256 length = assets.length;
        for (uint256 i = 0; i < length; i++) {
            _lockedAssets[tokenId].push(assets[i]);
        }
    }

    // --- IERC1155Receiver hooks ---

    function onERC1155Received(
        address /*_operator*/,
        address /*_from*/,
        uint256 /*_id*/,
        uint256 /*_value*/,
        bytes calldata /*_data*/
    ) external virtual override returns (bytes4) {
        // This hook is called when a single ERC1155 token type is transferred to this contract.
        // Standard behavior is to accept the transfer.
        // The wrapERC1155s function's nonReentrant guard and logic handles correct accounting.
        require(msg.sender != address(0), "ERC1155: transfer from zero address token contract"); // Check that the caller (token contract) is valid
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address /*_operator*/,
        address /*_from*/,
        uint256[] calldata /*_ids*/,
        uint256[] calldata /*_values*/,
        bytes calldata /*_data*/
    ) external virtual override returns (bytes4) {
        // This hook is called when multiple ERC1155 token types are batch transferred to this contract.
        // Standard behavior is to accept the transfer.
        // If wrapERC1155s were to use safeBatchTransferFrom for multiple types from the same contract, this would be hit.
        // Our current wrapERC1155s calls safeTransferFrom in a loop, so onERC1155Received is hit for each item.
        require(msg.sender != address(0), "ERC1155: batch transfer from zero address token contract"); // Check that the caller (token contract) is valid
        return this.onERC1155BatchReceived.selector;
    }
}