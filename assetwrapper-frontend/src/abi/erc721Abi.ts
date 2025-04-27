// src/abi/erc721Abi.ts
export const erc721Abi = [
    // Kullanılan Fonksiyonlar
    "function getApproved(uint256 tokenId) view returns (address)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function approve(address to, uint256 tokenId)",
    // Kullanılan Olaylar (İsteğe bağlı)
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)"
  ];