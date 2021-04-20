// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./RevertMsg.sol";

contract Escrow is Ownable, RevertMsg {

  uint256 public fee;
  mapping (address => uint256) private _balances;
  mapping (uint256 => Swap) private _swaps;

  struct Swap {
    address initiator;
    address initiatorNftAddress;
    uint256 initiatorNftId;
    address secondUser;
    address secondUserNftAddress;
    uint256 secondUserNftId;
  }

  event Transfer(address indexed from, address indexed to, uint256 value);

  function setAppFee(uint newFee) public onlyOwner {
    fee = newFee;
  }

  function depositNft(uint256 swapId, address secondUser, address nftAddress, uint256 nftId) public {
    safeTransferFrom(msg.sender, address(this), nftId);

    Swap storage swap = _swaps[swapId];
    if(swap.initiator == address(0)){
      swap.initiator = msg.sender;
      swap.initiatorNftAddress = nftAddress;
      swap.initiatorNftId = nftId;
      swap.secondUser = secondUser;
    } else {
      swap.secondUserNftAddress = nftAddress;
      swap.secondUserNftId = nftId;
    }

    (bool success, bytes memory data) = address(this).call{value: fee}("");
    if (success != true) {
        revert(_getRevertMsg(data));
    }
  }

  function acceptSwap(uint256 swapId) public {
    safeTransferFrom(address(this), _swaps[swapId].initiator, _swaps[swapId].secondUserNftId);
    safeTransferFrom(address(this), _swaps[swapId].secondUser, _swaps[swapId].initiatorNftId);
  }

  function rejectSwap(uint256 swapId)public {
    safeTransferFrom(address(this), _swaps[swapId].initiator, _swaps[swapId].initiatorNftId);

    if(_swaps[swapId].initiator == msg.sender){
      safeTransferFrom(address(this), _swaps[swapId].secondUser, _swaps[swapId].secondUserNftId);
    }
  }

  function safeTransferFrom(address from, address to, uint256 tokenId) public virtual {
    IERC721 erc721 = IERC721(from);
    erc721.safeTransferFrom(from, to, tokenId);
  }

  function withdrawEther(address payable recipient, uint256 amount) public onlyOwner {
    require(recipient != address(0), "Escrow: transfer to the zero address");
    require(
        address(this).balance >= amount,
        "Escrow: insufficient ETH in contract"
    );
    recipient.transfer(amount);
  }

  function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory _data)
    private returns (bool)
  {
    if (Address.isContract(to)) {
        try IERC721Receiver(to).onERC721Received(_msgSender(), from, tokenId, _data) returns (bytes4 retval) {
            return retval == IERC721Receiver(to).onERC721Received.selector;
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("Escrow: transfer to non ERC721Receiver implementer");
            } else {
              // solhint-disable-next-line no-inline-assembly
              assembly {
                revert(add(32, reason), mload(reason))
            }
          }
        }
      } else {
        return true;
    }
  }
}
