pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SwapKiwi is Ownable, IERC721Receiver {

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
  event SwapCanceled(address indexed canceledBy, uint256 indexed swapId);
  event SwapProposed(
    address indexed from,
    address indexed to,
    uint256 indexed swapId,
    address[] nftAddresses,
    uint256[] nftIds
  );
  event SwapInitiated(
    address indexed from,
    address indexed to,
    uint256 indexed swapId,
    address[] nftAddresses,
    uint256[] nftIds
  );

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

  constructor(uint256 initalAppFee, address contractOwnerAddress) {
    fee = initalAppFee;
    super.transferOwnership(contractOwnerAddress);
  }

  function setAppFee(uint newFee) public onlyOwner {
    fee = newFee;
  }

  /**
    * @dev First user proposes a swap to the second user with the NFTs that he deposits and wants to trade.
    *      Proposed NFTs are transfered to the SwapKiwi contract and
    *      kept there until the swap is accepted or canceled/rejected.
    *
    * @param secondUser address of the user that the first user wants to trade NFTs with
    * @param nftAddresses array of NFT addressed that want to be traded
    * @param nftIds array of IDs belonging to NFTs that want to be traded
    */
  function proposeSwap(address secondUser, address[] memory nftAddresses, uint256[] memory nftIds)
    external payable chargeAppFee requireSameLength(nftAddresses, nftIds) {
      _swapsCounter += 1;

      safeMultipleTransfersFrom(
        msg.sender,
        address(this),
        nftAddresses,
        nftIds
    );

      Swap storage swap = _swaps[_swapsCounter];
      swap.initiator = msg.sender;
      swap.initiatorNftAddresses = nftAddresses;
      swap.initiatorNftIds = nftIds;
      swap.secondUser = secondUser;

      emit SwapProposed(msg.sender, secondUser, _swapsCounter, nftAddresses, nftIds);
  }

  /**
    * @dev Second user accepts the swap (with proposed NFTs) from swap initiator and
    *      deposits his NFTs into the SwapKiwi contract.
    *      Callable only by second user that is invited by swap initiator.
    *
    * @param swapId ID of the swap that the second user is invited to participate in
    * @param nftAddresses array of NFT addressed that want to be traded
    * @param nftIds array of IDs belonging to NFTs that want to be traded
    */
  function initiateSwap(uint256 swapId, address[] memory nftAddresses, uint256[] memory nftIds)
    external payable chargeAppFee requireSameLength(nftAddresses, nftIds) {
      require(_swaps[swapId].secondUser == msg.sender, "SwapKiwi: caller is not swap participator");
      require(
        _swaps[swapId].secondUserNftAddresses.length == 0 && _swaps[swapId].secondUserNftIds.length == 0,
        "SwapKiwi: swap already initiated"
      );

      safeMultipleTransfersFrom(
        msg.sender,
        address(this),
        nftAddresses,
        nftIds
    );

      _swaps[swapId].secondUserNftAddresses = nftAddresses;
      _swaps[swapId].secondUserNftIds = nftIds;

      emit SwapInitiated(msg.sender, _swaps[swapId].initiator, swapId, nftAddresses, nftIds);
  }

  /**
    * @dev Swap initiator accepts the swap (NFTs proposed by the second user).
    *      Executeds the swap - transfers NFTs from SwapKiwi to the participating users.
    *      Callable only by swap initiator.
    *
    * @param swapId ID of the swap that the initator wants to execute
    */
  function acceptSwap(uint256 swapId) external onlyInitiator(swapId) {
    require( _swaps[swapId].secondUserNftAddresses.length != 0 &&
      _swaps[swapId].initiatorNftAddresses.length != 0,
       "SwapKiwi: Can't accept swap, both participants didn't add NFTs"
    );

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

    delete _swaps[swapId];
  }

  /**
    * @dev Returns NFTs from SwapKiwi to swap initator.
    *      Callable only if second user hasn't yet added NFTs.
    *
    * @param swapId ID of the swap that the swap participants want to cancel
    */
  function cancelSwap(uint256 swapId) external {
    require(
      _swaps[swapId].initiator == msg.sender || _swaps[swapId].secondUser == msg.sender,
      "SwapKiwi: Can't cancel swap, must be swap participant"
    );
      // return initiator NFTs
      safeMultipleTransfersFrom(
        address(this),
        _swaps[swapId].initiator,
        _swaps[swapId].initiatorNftAddresses,
        _swaps[swapId].initiatorNftIds
      );

    if(_swaps[swapId].secondUserNftAddresses.length != 0) {
      // return second user NFTs
      safeMultipleTransfersFrom(
        address(this),
        _swaps[swapId].secondUser,
        _swaps[swapId].secondUserNftAddresses,
        _swaps[swapId].secondUserNftIds
      );
    }


    emit SwapCanceled(msg.sender, swapId);

    delete _swaps[swapId];
  }

  function safeMultipleTransfersFrom(
      address from,
      address to,
      address[] memory nftAddresses,
      uint256[] memory nftIds
    ) internal virtual {
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
    ) internal virtual {
    IERC721(tokenAddress).safeTransferFrom(from, to, tokenId, _data);
  }

  function withdrawEther(address payable recipient, uint256 amount) external onlyOwner {
    require(recipient != address(0), "SwapKiwi: transfer to the zero address");
    require(
        address(this).balance >= amount,
        "SwapKiwi: insufficient ETH in contract"
    );
    recipient.transfer(amount);
  }

  function onERC721Received(
    /* solhint-disable */
      address operator,
      address from,
      uint256 tokenId,
      bytes calldata data
    /* solhint-enable */
    ) external pure override returns (bytes4) {
      return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }
}
