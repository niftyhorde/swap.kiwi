// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./RevertMsg.sol";

contract Escrow is Ownable, RevertMsg {

  uint256 private _swapsCounter;
  uint256 public fee;
  mapping (address => uint256) private _balances;
  mapping (uint256 => Swap) private _swaps;

  struct Swap {
    address initiator;
    address[] initiatorNftAddresses;
    uint256[] initiatorNftIds;
    address secondUser;
    address[] secondUserNftAddresses;
    uint256[] secondUserNftIds;
  }

  event SwapExecuted(address indexed from, address indexed to, uint256 value);
  event SwapCreated(uint256 swapId);

  modifier onlyInitiator(uint256 swapId) {
    require(msg.sender == _swaps[swapId].initiator);
    _;
  }

  function setAppFee(uint newFee) public onlyOwner {
    fee = newFee;
  }

  function depositNfts(address secondUser, address[] memory nftAddresses, uint256[] memory nftIds) public {
    require(nftAddresses.length == nftIds.length, "Escrow: NFT and ID arrays have to be same length");
      safeTransferFrom(msg.sender, address(this), nftAddresses, nftIds);
      _swapsCounter += 1;

      Swap storage swap = _swaps[_swapsCounter];
      if(swap.initiator == address(0)){
        swap.initiator = msg.sender;
        swap.initiatorNftAddresses = nftAddresses;
        swap.initiatorNftIds = nftIds;
        swap.secondUser = secondUser;
      } else {
        swap.secondUserNftAddresses = nftAddresses;
        swap.secondUserNftIds = nftIds;
      }

    (bool success, bytes memory data) = address(this).call{value: fee}("");
    if (success != true) {
        revert(_getRevertMsg(data));
    }
    emit SwapCreated(_swapsCounter);
  }

  function acceptSwap(uint256 swapId) public onlyInitiator(swapId) {
    // transfer NFTs from initiator to escrow
    safeTransferFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].secondUserNftAddresses,
      _swaps[swapId].secondUserNftIds
    );

    // transfer NFTs from second user to escrow
    safeTransferFrom(
      address(this),
      _swaps[swapId].secondUser,
      _swaps[swapId].initiatorNftAddresses,
      _swaps[swapId].initiatorNftIds
    );

    emit SwapExecuted(_swaps[swapId].initiator, _swaps[swapId].secondUser, swapId);
  }

  function rejectSwap(uint256 swapId) public {
    require(_swaps[swapId].secondUserNftAddresses[0] != address(0),
     "Escrow: Can't reject swap, other user didn't add NFTs");

    // return initiator NFTs
    safeTransferFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].initiatorNftAddresses,
      _swaps[swapId].initiatorNftIds
    );

    // return second user NFTs
    if(_swaps[swapId].initiator == msg.sender){
      safeTransferFrom(
        address(this),
        _swaps[swapId].secondUser,
        _swaps[swapId].secondUserNftAddresses,
        _swaps[swapId].secondUserNftIds
      );
    }
  }

  function safeTransferFrom(
      address from,
      address to,
      address[] memory nftAddresses,
      uint256[] memory nftIds
    ) public virtual {
    for (uint256 i=0; i < nftIds.length; i++){
      safeTransferFrom(from, to, nftAddresses[i], nftIds[i], "");
    }
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
