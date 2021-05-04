// SPDX-License-Identifier: MIT

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestNFT is ERC721("TEST", "TEST") {

    function mint(address account, uint256 tokenId) public {
        _mint(account, tokenId);
    }

    receive() external payable {}

}
