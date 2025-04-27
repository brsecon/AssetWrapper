// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @dev Basic ERC20 token with a public mint function restricted to the owner.
 */
contract MockERC20 is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_
    ) ERC20(name_, symbol_) Ownable(initialOwner_) {}

    /**
     * @notice Mints tokens to a specified address.
     * @param to The address to mint tokens to.
     * @param amount The amount of tokens to mint (in smallest unit, e.g., wei).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}