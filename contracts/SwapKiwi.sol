// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.1;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract SwapKiwi is Ownable {

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

  event SwapExecuted(address indexed from, address indexed to, uint256 indexed swapId);
  event SwapRejected(address indexed from, address indexed to, uint256 indexed swapId);
  event SwapCanceled(address indexed from, uint256 indexed swapId);
  event SwapProposed(uint256 indexed swapId);
  event SwapInitiated(uint256 indexed swapId);

  modifier onlyInitiator(uint256 swapId) {
    require(msg.sender == _swaps[swapId].initiator,
      "SwapKiwi: caller is not swap initiator");
    _;
  }

  modifier requireSameLength(address[] memory nftAddresses, uint256[] memory nftIds) {
    require(nftAddresses.length == nftIds.length, "SwapKiwi: NFT and ID arrays have to be same length");
    _;
  }

  modifier chargeAppFee() {
    require(msg.value == fee, "SwapKiwi: Sent ETH amount needs to equal application fee");
    _;
  }

  function setAppFee(uint newFee) public onlyOwner {
    fee = newFee;
  }

  function proposeSwap(address secondUser, address[] memory nftAddresses, uint256[] memory nftIds)
    public payable chargeAppFee requireSameLength(nftAddresses, nftIds) {
      _swapsCounter += 1;

      Swap storage swap = _swaps[_swapsCounter];
      swap.initiator = msg.sender;
      swap.initiatorNftAddresses = nftAddresses;
      swap.initiatorNftIds = nftIds;
      swap.secondUser = secondUser;

      emit SwapProposed(_swapsCounter);
  }

  function initiateSwap(uint256 swapId, address[] memory nftAddresses, uint256[] memory nftIds)
    public payable chargeAppFee requireSameLength(nftAddresses, nftIds) {
      require(_swaps[swapId].secondUser == msg.sender, "SwapKiwi: caller is not swap participator");

      _swaps[swapId].secondUserNftAddresses = nftAddresses;
      _swaps[swapId].secondUserNftIds = nftIds;

      emit SwapInitiated(swapId);
  }

  function acceptSwap(uint256 swapId) public onlyInitiator(swapId) {
    // transfer NFTs from escrow to initiator
    safeMultipleTransfersFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].secondUserNftAddresses,
      _swaps[swapId].secondUserNftIds
    );

    // transfer NFTs from escrow to second user
    safeMultipleTransfersFrom(
      address(this),
      _swaps[swapId].secondUser,
      _swaps[swapId].initiatorNftAddresses,
      _swaps[swapId].initiatorNftIds
    );

    emit SwapExecuted(_swaps[swapId].initiator, _swaps[swapId].secondUser, swapId);
  }

  function cancelSwap(uint256 swapId) public {
    require(_swaps[swapId].secondUserNftAddresses.length != 0,
      "SwapKiwi: Can't cancel swap, other user didn't add NFTs");

    // return initiator NFTs
    safeMultipleTransfersFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].initiatorNftAddresses,
      _swaps[swapId].initiatorNftIds
    );

    emit SwapCanceled(_swaps[swapId].initiator, swapId);
  }

  function rejectSwap(uint256 swapId) public onlyInitiator(swapId)  {
    // return initiator NFTs
    safeMultipleTransfersFrom(
      address(this),
      _swaps[swapId].initiator,
      _swaps[swapId].initiatorNftAddresses,
      _swaps[swapId].initiatorNftIds
    );

    // return second user NFTs
    if(_swaps[swapId].initiator == msg.sender){
      safeMultipleTransfersFrom(
        address(this),
        _swaps[swapId].secondUser,
        _swaps[swapId].secondUserNftAddresses,
        _swaps[swapId].secondUserNftIds
      );
    }

    emit SwapRejected(_swaps[swapId].initiator, _swaps[swapId].secondUser, swapId);
  }

  function safeMultipleTransfersFrom(
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
    require(_checkOnERC721Received(from, to, tokenId, _data), "SwapKiwi: transfer to non ERC721Receiver implementer");
  }

  function withdrawEther(address payable recipient, uint256 amount) public onlyOwner {
    require(recipient != address(0), "SwapKiwi: transfer to the zero address");
    require(
        address(this).balance >= amount,
        "SwapKiwi: insufficient ETH in contract"
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
                revert("SwapKiwi: transfer to non ERC721Receiver implementer");
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
