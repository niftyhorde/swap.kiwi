// SPDX-License-Identifier: MIT

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract TestERC721 is ERC721("TEST", "TEST") {

    function mint(address account, uint256 tokenId) public {
        _mint(account, tokenId);
    }

    receive() external payable {}

}

contract TestERC1155 is ERC1155("TEST") {
    function mint(address account, uint256 tokenId, uint256 tokenAmount) public {
        _mint(account, tokenId, tokenAmount, "");
    }
}
