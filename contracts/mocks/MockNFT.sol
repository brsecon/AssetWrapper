// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockNFT
 * @dev Basic ERC721 token with a public safeMint function restricted to the owner.
 * Uses a simple uint256 counter for token IDs instead of Counters.sol.
 */
contract MockNFT is ERC721, Ownable {
    // Counters.sol yerine basit bir sayaç kullanıyoruz
    uint256 private _nextTokenId;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_
    ) ERC721(name_, symbol_) Ownable(initialOwner_) {
        // İlk Token ID'si 0 veya 1 olabilir, 1'den başlatmak yaygındır.
        // Eğer 0'dan başlasın istersen bu satırı kaldırabilirsin.
        _nextTokenId = 1;
    }

    /**
     * @notice Safely mints a new NFT to a specified address.
     * @param to The address to mint the NFT to.
     * @return The ID of the newly minted token.
     */
    function safeMint(address to) public onlyOwner returns (uint256) {
        // Mevcut sayaç değerini token ID olarak ata
        uint256 tokenId = _nextTokenId;
        // Bir sonraki mint işlemi için sayacı artır
        _nextTokenId++;
        // NFT'yi mint et
        _safeMint(to, tokenId);
        return tokenId;
    }

    /**
     * @notice Returns the next token ID that will be minted.
     */
    function getNextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }
}