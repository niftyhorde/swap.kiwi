// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./RevertMsg.sol";

contract Escrow is Ownable, RevertMsg {

  uint256 private _swapId;
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
  event SwapCreated(uint256 swapId);

  modifier onlyInitiator(uint256 swapId) {
    require(msg.sender == _swaps[swapId].initiator);
    _;
  }

  function setAppFee(uint newFee) public onlyOwner {
    fee = newFee;
  }

  function depositNfts(address secondUser, address[] memory nftAddresses, uint256[] memory nftIds) public {
    for (uint256 i=0; i < nftIds.length; i++){
      safeTransferFrom(nftAddresses[i], address(this), nftAddresses[i], nftIds[i]);
      _swapId += 1;

      Swap storage swap = _swaps[_swapId];
      if(swap.initiator == address(0)){
        swap.initiator = msg.sender;
        swap.initiatorNftAddress = nftAddresses[i];
        swap.initiatorNftId = nftIds[i];
        swap.secondUser = secondUser;
      } else {
        swap.secondUserNftAddress = nftAddresses[i];
        swap.secondUserNftId = nftIds[i];
      }
    }

    (bool success, bytes memory data) = address(this).call{value: fee}("");
    if (success != true) {
        revert(_getRevertMsg(data));
    }
    emit SwapCreated(_swapId);
  }

  function acceptSwap(uint256 swapId) public onlyInitiator(swapId) {
    // transfer NFTs from initiator to escrow
    safeTransferFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].secondUserNftAddress,
      _swaps[swapId].secondUserNftId
    );

    // transfer NFTs from second user to escrow
    safeTransferFrom(
      address(this),
      _swaps[swapId].secondUser,
      _swaps[swapId].initiatorNftAddress,
      _swaps[swapId].initiatorNftId
    );
  }

  function rejectSwap(uint256 swapId) public {
    require(_swaps[swapId].secondUserNftAddress != address(0),
     "Escrow: Can't reject swap, other user didn't add NFTs");

    // return initiator NFTs
    safeTransferFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].initiatorNftAddress,
      _swaps[swapId].initiatorNftId
    );

    // return second user NFTs
    if(_swaps[swapId].initiator == msg.sender){
      safeTransferFrom(
        address(this),
        _swaps[swapId].secondUser,
        _swaps[swapId].secondUserNftAddress,
        _swaps[swapId].secondUserNftId
      );
    }
  }

  function safeTransferFrom(address from, address to, address tokenAddress, uint256 tokenId) public virtual {
    safeTransferFrom(from, to, tokenAddress, tokenId, "");
  }

  function safeTransferFrom(
      address from,
      address to,
      address tokenAddress,
      uint256 tokenId,
      bytes memory _data
    ) public virtual {
    IERC721(tokenAddress).safeTransferFrom(from, to, tokenId, _data);
    require(_checkOnERC721Received(from, to, tokenId, _data), "ERC721: transfer to non ERC721Receiver implementer");
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
