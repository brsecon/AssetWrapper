// src/abi/erc20Abi.ts
export const erc20Abi = [
    // Kullanılan Fonksiyonlar
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    // Kullanılan Olay (İsteğe bağlı ama logları dinlemek için yararlı olabilir)
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ];