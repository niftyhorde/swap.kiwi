// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
* @title This is the contract which added erc1155 into the previous swap contract.
*/
contract SwapKiwi is Ownable, ERC721Holder, ERC1155Holder {

	uint64 private _swapsCounter;
	uint128 private _etherLocked;
	uint128 public fee;

	mapping (uint64 => Swap) private _swaps;

	struct Swap {
		address payable initiator;
		address[] initiatorNftAddresses;
		uint256[] initiatorNftIds;
		uint256[] initiatorNftAmounts;
		address payable secondUser;
		address[] secondUserNftAddresses;
		uint256[] secondUserNftIds;
		uint256[] secondUserNftAmounts;
		uint128 initiatorEtherValue;
		uint128 secondUserEtherValue;
	}

	event SwapExecuted(address indexed from, address indexed to, uint64 indexed swapId);
	event SwapCanceled(address indexed canceledBy, uint64 indexed swapId);
	event SwapProposed(
		address indexed from,
		address indexed to,
		uint64 indexed swapId,
		uint128 etherValue,
		address[] nftAddresses,
		uint256[] nftIds,
		uint256[] nftAmounts
	);
	event SwapInitiated(
		address indexed from,
		address indexed to,
		uint64 indexed swapId,
		uint128 etherValue,
		address[] nftAddresses,
		uint256[] nftIds,
		uint256[] nftAmounts
	);
	event AppFeeChanged(
		uint128 fee
	);

	modifier onlyInitiator(uint64 swapId) {
		require(msg.sender == _swaps[swapId].initiator,
			"SwapKiwi: caller is not swap initiator");
		_;
	}

	modifier requireSameLength(address[] memory nftAddresses, uint256[] memory nftIds, uint256[] memory nftAmounts) {
		require(nftAddresses.length == nftIds.length, "SwapKiwi: NFT and ID arrays have to be same length");
		require(nftAddresses.length == nftAmounts.length, "SwapKiwi: NFT and AMOUNT arrays have to be same length");
		_;
	}

	modifier chargeAppFee() {
		require(msg.value >= fee, "SwapKiwi: Sent ETH amount needs to be more or equal application fee");
		_;
	}

	constructor(uint128 initalAppFee, address contractOwnerAddress) {
		fee = initalAppFee;
		super.transferOwnership(contractOwnerAddress);
	}

	function setAppFee(uint128 newFee) external onlyOwner {
		fee = newFee;
		emit AppFeeChanged(newFee);
	}

	/**
	* @dev First user proposes a swap to the second user with the NFTs that he deposits and wants to trade.
	*      Proposed NFTs are transfered to the SwapKiwi contract and
	*      kept there until the swap is accepted or canceled/rejected.
	*
	* @param secondUser address of the user that the first user wants to trade NFTs with
	* @param nftAddresses array of NFT addressed that want to be traded
	* @param nftIds array of IDs belonging to NFTs that want to be traded
	* @param nftAmounts array of NFT amounts that want to be traded. If the amount is zero, that means 
	* the token is ERC721 token. Otherwise the token is ERC1155 token.
	*/
	function proposeSwap(
		address secondUser,
		address[] memory nftAddresses,
		uint256[] memory nftIds,
		uint256[] memory nftAmounts
	) external payable chargeAppFee requireSameLength(nftAddresses, nftIds, nftAmounts) {
		_swapsCounter += 1;

		safeMultipleTransfersFrom(
			msg.sender,
			address(this),
			nftAddresses,
			nftIds,
			nftAmounts
		);

		Swap storage swap = _swaps[_swapsCounter];
		swap.initiator = payable(msg.sender);
		swap.initiatorNftAddresses = nftAddresses;
		swap.initiatorNftIds = nftIds;
		swap.initiatorNftAmounts = nftAmounts;

		uint128 _fee = fee;

		if (msg.value > _fee) {
			swap.initiatorEtherValue = uint128(msg.value) - _fee;
			_etherLocked += swap.initiatorEtherValue;
		}
		swap.secondUser = payable(secondUser);

		emit SwapProposed(
			msg.sender,
			secondUser,
			_swapsCounter,
			swap.initiatorEtherValue,
			nftAddresses,
			nftIds,
			nftAmounts
		);
	}

	/**
	* @dev Second user accepts the swap (with proposed NFTs) from swap initiator and
	*      deposits his NFTs into the SwapKiwi contract.
	*      Callable only by second user that is invited by swap initiator.
	*
	* @param swapId ID of the swap that the second user is invited to participate in
	* @param nftAddresses array of NFT addressed that want to be traded
	* @param nftIds array of IDs belonging to NFTs that want to be traded
	* @param nftAmounts array of NFT amounts that want to be traded. If the amount is zero, that means 
	* the token is ERC721 token. Otherwise the token is ERC1155 token.
	*/
	function initiateSwap(
		uint64 swapId,
		address[] memory nftAddresses,
		uint256[] memory nftIds,
		uint256[] memory nftAmounts
	) external payable chargeAppFee requireSameLength(nftAddresses, nftIds, nftAmounts) {
		require(_swaps[swapId].secondUser == msg.sender, "SwapKiwi: caller is not swap participator");
		require(
			_swaps[swapId].secondUserEtherValue == 0 &&
			( _swaps[swapId].secondUserNftAddresses.length == 0 &&
			_swaps[swapId].secondUserNftIds.length == 0 &&
			_swaps[swapId].secondUserNftAmounts.length == 0
			), "SwapKiwi: swap already initiated"
		);

		safeMultipleTransfersFrom(
			msg.sender,
			address(this),
			nftAddresses,
			nftIds,
			nftAmounts
		);

		_swaps[swapId].secondUserNftAddresses = nftAddresses;
		_swaps[swapId].secondUserNftIds = nftIds;
		_swaps[swapId].secondUserNftAmounts = nftAmounts;

		uint128 _fee = fee;

		if (msg.value > _fee) {
			_swaps[swapId].secondUserEtherValue = uint128(msg.value) - _fee;
			_etherLocked += _swaps[swapId].secondUserEtherValue;
		}

		emit SwapInitiated(
			msg.sender,
			_swaps[swapId].initiator,
			swapId,
			_swaps[swapId].secondUserEtherValue,
			nftAddresses,
			nftIds,
			nftAmounts
		);
	}

	/**
	* @dev Swap initiator accepts the swap (NFTs proposed by the second user).
	*      Executeds the swap - transfers NFTs from SwapKiwi to the participating users.
	*      Callable only by swap initiator.
	*
	* @param swapId ID of the swap that the initator wants to execute
	*/
	function acceptSwap(uint64 swapId) external onlyInitiator(swapId) {
		require(
			(_swaps[swapId].secondUserNftAddresses.length != 0 || _swaps[swapId].secondUserEtherValue > 0) &&
			(_swaps[swapId].initiatorNftAddresses.length != 0 || _swaps[swapId].initiatorEtherValue > 0),
			"SwapKiwi: Can't accept swap, both participants didn't add NFTs"
		);

		// transfer NFTs from escrow to initiator
		safeMultipleTransfersFrom(
			address(this),
			_swaps[swapId].initiator,
			_swaps[swapId].secondUserNftAddresses,
			_swaps[swapId].secondUserNftIds,
			_swaps[swapId].secondUserNftAmounts
		);

		// transfer NFTs from escrow to second user
		safeMultipleTransfersFrom(
			address(this),
			_swaps[swapId].secondUser,
			_swaps[swapId].initiatorNftAddresses,
			_swaps[swapId].initiatorNftIds,
			_swaps[swapId].initiatorNftAmounts
		);

		if (_swaps[swapId].initiatorEtherValue != 0) {
			_etherLocked -= _swaps[swapId].initiatorEtherValue;
			uint128 amountToTransfer = _swaps[swapId].initiatorEtherValue;
			_swaps[swapId].initiatorEtherValue = 0;
			_swaps[swapId].secondUser.transfer(amountToTransfer);
		}
		if (_swaps[swapId].secondUserEtherValue != 0) {
			_etherLocked -= _swaps[swapId].secondUserEtherValue;
			uint128 amountToTransfer = _swaps[swapId].secondUserEtherValue;
			_swaps[swapId].secondUserEtherValue = 0;
			_swaps[swapId].initiator.transfer(amountToTransfer);
		}

		emit SwapExecuted(_swaps[swapId].initiator, _swaps[swapId].secondUser, swapId);

		delete _swaps[swapId];
	}

	/**
	* @dev Returns NFTs from SwapKiwi to swap initator.
	*      Callable only if second user hasn't yet added NFTs.
	*
	* @param swapId ID of the swap that the swap participants want to cancel
	*/
	function cancelSwap(uint64 swapId) external {
		require(
			_swaps[swapId].initiator == msg.sender || _swaps[swapId].secondUser == msg.sender,
			"SwapKiwi: Can't cancel swap, must be swap participant"
		);
		// return initiator NFTs
		safeMultipleTransfersFrom(
			address(this),
			_swaps[swapId].initiator,
			_swaps[swapId].initiatorNftAddresses,
			_swaps[swapId].initiatorNftIds,
			_swaps[swapId].initiatorNftAmounts
		);

		if(_swaps[swapId].secondUserNftAddresses.length != 0) {
			// return second user NFTs
			safeMultipleTransfersFrom(
				address(this),
				_swaps[swapId].secondUser,
				_swaps[swapId].secondUserNftAddresses,
				_swaps[swapId].secondUserNftIds,
				_swaps[swapId].secondUserNftAmounts
			);
		}

		if (_swaps[swapId].initiatorEtherValue != 0) {
			_etherLocked -= _swaps[swapId].initiatorEtherValue;
			uint128 amountToTransfer = _swaps[swapId].initiatorEtherValue;
			_swaps[swapId].initiatorEtherValue = 0;
			_swaps[swapId].initiator.transfer(amountToTransfer);
		}
		if (_swaps[swapId].secondUserEtherValue != 0) {
			_etherLocked -= _swaps[swapId].secondUserEtherValue;
			uint128 amountToTransfer = _swaps[swapId].secondUserEtherValue;
			_swaps[swapId].secondUserEtherValue = 0;
			_swaps[swapId].secondUser.transfer(amountToTransfer);
		}

		emit SwapCanceled(msg.sender, swapId);

		delete _swaps[swapId];
	}

	function safeMultipleTransfersFrom(
		address from,
		address to,
		address[] memory nftAddresses,
		uint256[] memory nftIds,
		uint256[] memory nftAmounts
	) internal virtual {
		for (uint256 i=0; i < nftIds.length; i++){
			safeTransferFrom(from, to, nftAddresses[i], nftIds[i], nftAmounts[i], "");
		}
	}

	function safeTransferFrom(
		address from,
		address to,
		address tokenAddress,
		uint256 tokenId,
		uint256 tokenAmount,
		bytes memory _data
	) internal virtual {
		if (tokenAmount == 0) {
			IERC721(tokenAddress).safeTransferFrom(from, to, tokenId, _data);
		} else {
			IERC1155(tokenAddress).safeTransferFrom(from, to, tokenId, tokenAmount, _data);
		}
		
	}

	function withdrawEther(address payable recipient) external onlyOwner {
		require(recipient != address(0), "SwapKiwi: transfer to the zero address");

		recipient.transfer((address(this).balance - _etherLocked));
	}
}
