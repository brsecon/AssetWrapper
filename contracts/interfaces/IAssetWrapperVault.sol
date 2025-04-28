// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IAssetWrapperVault Interface
 * @dev Defines functions the AssetWrapperNFT expects the vault contract to implement.
 */
interface IAssetWrapperVault {
    /**
     * @notice Locks an asset in the vault for a specific wrapper.
     * @param user The original owner transferring the asset.
     * @param wrapperId The ID of the wrapper NFT representing the locked assets.
     * @param assetContract The address of the asset's contract (ERC721 or ERC20).
     * @param idOrAmount For ERC721, the tokenId. For ERC20, the amount specified by the user.
     * @param isNFT True if the asset is an ERC721 token, false if ERC20.
     * @return success Boolean indicating if the lock operation was successful.
     * @return actualIdOrAmount For ERC721, the tokenId locked. For ERC20, the actual amount received and locked.
     */
    function lockAsset(
        address user,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    ) external returns (bool success, uint256 actualIdOrAmount); // <<< DEĞİŞİKLİK: Dönüş değeri eklendi

    /**
     * @notice Unlocks an asset from the vault and sends it to the recipient.
     * @param recipient The address to receive the unlocked asset.
     * @param wrapperId The ID of the wrapper NFT being unwrapped.
     * @param assetContract The address of the asset's contract.
     * @param idOrAmount For ERC721, the tokenId. For ERC20, the amount to unlock.
     * @param isNFT True if the asset is an ERC721 token, false if ERC20.
     * @return success Boolean indicating if the unlock operation was successful.
     */
    function unlockAsset(
        address recipient,
        uint256 wrapperId,
        address assetContract,
        uint256 idOrAmount,
        bool isNFT
    ) external returns (bool success);

    /**
     * @notice Returns the locked ERC20 balance for a specific wrapper and asset.
     * @param wrapperId The ID of the wrapper.
     * @param assetContract The address of the ERC20 asset contract.
     * @return The amount of the specified ERC20 token locked for the given wrapperId.
     */
    function lockedERC20Balance(
        uint256 wrapperId,
        address assetContract
    ) external view returns (uint256);
}