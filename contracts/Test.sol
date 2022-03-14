// SPDX-License-Identifier: MIT

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface ISwapKiwi {
    function proposeSwap(
        address secondUser,
        address[] memory nftAddresses,
        uint256[] memory nftIds,
        uint128[] memory nftAmounts
    ) external payable;

    function initiateSwap(
        uint64 swapId,
        address[] memory nftAddresses,
        uint256[] memory nftIds,
        uint128[] memory nftAmounts
    ) external payable;

    function cancelSwap(uint64 swapId) external;
    function cancelSwapByInitiator(uint64 swapId) external;
    function cancelSwapBySecondUser(uint64 swapId) external;
}

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

contract SwapParticipant {
    address public swapContract;
    uint public counter;

    event Received(address indexed sender, uint amount);

    function proposeSwap(
        address secondUser,
        address[] memory nftAddresses,
        uint256[] memory nftIds,
        uint128[] memory nftAmounts
    ) external payable {
        for (uint256 i = 0; i < nftAddresses.length; i++) {
            IERC1155(nftAddresses[i]).setApprovalForAll(swapContract, true);
        }
        ISwapKiwi(swapContract).proposeSwap{ value: msg.value }(secondUser, nftAddresses, nftIds, nftAmounts);
    }

    function initiateSwap(
        uint64 swapId,
        address[] memory nftAddresses,
        uint256[] memory nftIds,
        uint128[] memory nftAmounts
    ) external payable {
        for (uint256 i = 0; i < nftAddresses.length; i++) {
            IERC1155(nftAddresses[i]).setApprovalForAll(swapContract, true);
        }
        ISwapKiwi(swapContract).initiateSwap{ value: msg.value }(swapId, nftAddresses, nftIds, nftAmounts);
    }

    function cancelSwap(uint64 swapId) external {
        ISwapKiwi(swapContract).cancelSwap(swapId);
    }

    function cancelSwapByInitiator(uint64 swapId) external {
        uint balanceBefore = address(this).balance;
        ISwapKiwi(swapContract).cancelSwapByInitiator(swapId);
        uint balanceAfter = address(this).balance;
        if (balanceAfter > balanceBefore) {
            (bool success,) = payable(msg.sender).call{value: balanceAfter - balanceBefore}("");
            require(success, "Failed to send Ether to the initiator user");
        }
    }

    function cancelSwapBySecondUser(uint64 swapId) external {
        uint balanceBefore = address(this).balance;
        ISwapKiwi(swapContract).cancelSwapBySecondUser(swapId);
        uint balanceAfter = address(this).balance;
        if (balanceAfter > balanceBefore) {
            (bool success,) = payable(msg.sender).call{value: balanceAfter - balanceBefore}("");
            require(success, "Failed to send Ether to the initiator user");
        }
    }

    function setCounter(uint _counter) external {
        counter = _counter;
    }

    function setSwap(address _swapAddress) external {
        swapContract = _swapAddress;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public returns (bytes4) {
        if (counter != 0) {
            revert("The malicious onERC1155Received contract");
        }
        return this.onERC1155Received.selector;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
