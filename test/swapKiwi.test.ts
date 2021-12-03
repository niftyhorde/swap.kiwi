import { Deployment } from "hardhat-deploy/types";
import { expect, use } from "chai";
import { ethers, deployments } from "hardhat";
import { SwapKiwi } from "../typechain/SwapKiwi";
import { TestERC721 } from "../typechain/TestERC721";
import { TestERC1155 } from "../typechain/TestERC1155";
import { Signer } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
import chaiAsPromised from 'chai-as-promised';
import { parseEther } from "ethers/lib/utils";

use(chaiAsPromised);

describe("SwapKiwi", async function () {
  let SwapKiwi: Deployment;
  let swapKiwi: SwapKiwi;
  let TestERC721: Deployment;
  let appUserERC721: TestERC721;
  let otherAppUserERC721: TestERC721;
  let TestERC1155: Deployment;
  let appUserERC1155: TestERC1155;
  let otherAppUserERC1155: TestERC1155;
  let signers: Signer[];
  let appUser: SwapKiwi;
  let otherAppUser: SwapKiwi;
  let appUserAddress: string;
  let otherAppUserAddress: string;
  const VALID_APP_FEE = ethers.utils.parseEther("0.1");

  before(async () => {
    signers = await ethers.getSigners();
    ({ SwapKiwi, TestERC721, TestERC1155 } = await deployments.fixture());

    swapKiwi = await ethers.getContractAt(SwapKiwi.abi, SwapKiwi.address, signers[0]) as SwapKiwi;

    appUserERC721 = await ethers.getContractAt(TestERC721.abi, TestERC721.address, signers[2]) as TestERC721;
    otherAppUserERC721 = await ethers.getContractAt(TestERC721.abi, TestERC721.address, signers[3]) as TestERC721;

    appUserERC1155 = await ethers.getContractAt(TestERC1155.abi, TestERC1155.address, signers[2]) as TestERC1155;
    otherAppUserERC1155 = await ethers.getContractAt(TestERC1155.abi, TestERC1155.address, signers[3]) as TestERC1155;

    appUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[2]) as SwapKiwi;
    otherAppUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[3]) as SwapKiwi;
    appUserAddress = await signers[2].getAddress();
    otherAppUserAddress = await signers[3].getAddress();
  });

  function getFilterName(eventName: string) {
    let filter: any;
    switch (eventName) {
      case "SwapExecuted":
        filter = swapKiwi.filters.SwapExecuted(null, null, null);
        break;
      case "SwapCanceled":
        filter = swapKiwi.filters.SwapCanceled(null, null);
        break;
      case "SwapProposed":
        filter = swapKiwi.filters.SwapProposed(null, null, null, null, null, null, null);
        break;
      case "SwapInitiated":
        filter = swapKiwi.filters.SwapInitiated(null, null, null, null, null, null, null);
      default: null
    }
    return filter;
  }

  async function getEventWithArgsFromLogs(txReceipt: TransactionReceipt, eventName: string): Promise<any | null> {
    if (txReceipt.logs) {
      const events = await swapKiwi.queryFilter(getFilterName(eventName), undefined);
      return events.map((e) => {
        if (e.event == eventName) {
          return {
            eventName: eventName,
            args: e.args
          }
        }
      }
      ).pop()
    }
    return null;
  }

  it("Should successfuly set app fee if caller is the owner", async function () {
    await swapKiwi.setAppFee(VALID_APP_FEE);
    expect((await swapKiwi.fee()).toString()).to.be.deep.equal(VALID_APP_FEE.toString());
  });

  it("Should fail to set app fee if caller is not owner", async function () {
    const nonOwnerContract = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

    await expect(nonOwnerContract.setAppFee(1000))
      .to.be.rejectedWith("Ownable: caller is not the owner");
  });

  it('Should fail to propose swap with invalid app fee', async function () {
    await expect(appUser.proposeSwap(otherAppUserAddress, [], [], [], {
      value: parseEther("0.01")
    })).to.be.rejectedWith(
      "SwapKiwi: Sent ETH amount needs to be more or equal application fee"
    );
  });

  it('Should fail to propose swap with different nft address and id length', async function () {
    await expect(appUser.proposeSwap(otherAppUserAddress, [], [13], [], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      "SwapKiwi: NFT and ID arrays have to be same length"
    );
  });

  it('Should fail to propose swap with different nft address and amount length', async function () {
    await expect(appUser.proposeSwap(otherAppUserAddress, [], [], [5], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      "SwapKiwi: NFT and AMOUNT arrays have to be same length"
    );
  });

  it('Should succesfully deposit NFT into escrow contract and emit "SwapProposed" event', async function () {
    const initiatorTokenIds = [25, 25];
    const initiatorTokenAmounts = [0, 50];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    expect(await appUserERC721.ownerOf(initiatorTokenIds[0])).to.be.deep.equal(appUserAddress);
    
    const erc1155_balance_beforeDeposit =  await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    expect(erc1155_balance_beforeDeposit.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");

    const erc1155_balance_AfterDeposit =  await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    const erc1155_balance_SwapKiwi = await appUserERC1155.balanceOf(swapKiwi.address, initiatorTokenIds[1]);

    // check if all values are emitted in event
    expect(logs.eventName).to.be.deep.equal("SwapProposed");
    expect(logs.args.from).to.be.deep.equal(appUserAddress);
    expect(logs.args.to).to.be.deep.equal(otherAppUserAddress);
    expect(logs.args.nftAddresses[0]).to.be.deep.equal(appUserERC721.address);
    expect(logs.args.nftIds[0].toString()).to.be.deep.equal("25");
    expect(logs.args.nftIds[1].toString()).to.be.deep.equal("25");
    expect(logs.args.nftAmounts[0].toString()).to.be.deep.equal("0");
    expect(logs.args.nftAmounts[1].toString()).to.be.deep.equal("50");
    expect(await appUserERC721.ownerOf(25)).to.be.deep.equal(swapKiwi.address);
    expect(erc1155_balance_AfterDeposit.toNumber()).to.be.deep.equal(0);
    expect(erc1155_balance_SwapKiwi.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
  });

  it('Should succesfully cancel swap by first user (after swap proposed) and emit "SwapCanceled" event', async function () {
    await appUserERC721.mint(appUserAddress, 140);
    await appUserERC721.approve(swapKiwi.address, 140);
    await appUserERC1155.mint(appUserAddress, 30, 50);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], [140, 30], [0, 50], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const user_erc1155BalanceBeforeCancel = await appUserERC1155.balanceOf(appUserAddress, 30);
    expect(user_erc1155BalanceBeforeCancel.toNumber()).to.be.deep.equal(0);
    const cancelTx = await appUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    const user_erc1155BalanceAfterCancel = await appUserERC1155.balanceOf(appUserAddress, 30);
    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(appUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that ERC721 and ERC1155 are returned to initial owner
    expect(await appUserERC721.ownerOf(140)).to.be.deep.equal(appUserAddress);
    expect(user_erc1155BalanceAfterCancel.toNumber()).to.be.deep.equal(50);
  });

  it('Should succesfully cancel swap by second user (after swap proposed) and emit "SwapCanceled" event', async function () {
    const initiatorTokenIds = [141, 725];
    const initiatorTokenAmounts = [0, 50];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const user_erc1155BalanceBeforeCancel = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    expect(user_erc1155BalanceBeforeCancel.toNumber()).to.be.deep.equal(0);

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    const user_erc1155BalanceAfterCancel = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that ERC721 and ERC1155 are returned to initial owner
    expect(await appUserERC721.ownerOf(initiatorTokenIds[0])).to.be.deep.equal(appUserAddress);
    expect(user_erc1155BalanceAfterCancel.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
  });

  it('Should succesfully cancel swap by first user (after swap initiated) and emit "SwapCanceled" event', async function () {
    const initiatorTokenIds = [120, 923];
    const initiatorTokenAmounts = [0, 25];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const secondUserTokenIds = [130, 131, 47];
    const secondUserTokenAmounts = [0, 0, 50];

    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[0]);
    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[1]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[0]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[1]);
    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[2], secondUserTokenAmounts[2]);
    await otherAppUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address, otherAppUserERC721.address, otherAppUserERC1155.address],
      secondUserTokenIds,
      secondUserTokenAmounts,
      {
        value: VALID_APP_FEE
      }
    );

    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");

    const initiatorERC1155_923_balance = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    const secondUserERC1155_47_balance = await otherAppUserERC1155.balanceOf(otherAppUserAddress, secondUserTokenIds[2]);
    
    expect(initiatorERC1155_923_balance.toNumber()).to.be.deep.equal(0);
    expect(secondUserERC1155_47_balance.toNumber()).to.be.deep.equal(0);

    // check if all values are emitted in "SwapInitiated" event
    expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
    expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    const initiatorERC1155_923_balanceAfterCancel = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    const secondUserERC1155_47_balanceAfterCancel = await otherAppUserERC1155.balanceOf(otherAppUserAddress, secondUserTokenIds[2]);

    expect(initiatorERC1155_923_balanceAfterCancel.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
    expect(secondUserERC1155_47_balanceAfterCancel.toNumber()).to.be.deep.equal(secondUserTokenAmounts[2]);

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that NFT is returned to initial owners
    expect(await appUserERC721.ownerOf(120)).to.be.deep.equal(appUserAddress);
    expect(await appUserERC721.ownerOf(130)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserERC721.ownerOf(131)).to.be.deep.equal(otherAppUserAddress);
  });

  it('Should succesfully cancel swap by second user (after swap initiated) and emit "SwapCanceled" event', async function () {
    const initiatorTokenIds = [121, 47];
    const initiatorTokenAmounts = [0, 25];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const secondUserTokenIds = [135, 136, 71];
    const secondUserTokenAmounts = [0, 0, 25];

    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[0]);
    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[1]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[0]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[1]);
    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[2], secondUserTokenAmounts[2]);
    await otherAppUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address, otherAppUserERC721.address, otherAppUserERC1155.address],
      secondUserTokenIds,
      secondUserTokenAmounts,
      {
        value: VALID_APP_FEE
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");

    const initiatorERC1155_47_balance = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    const secondUserERC1155_71_balance = await otherAppUserERC1155.balanceOf(otherAppUserAddress, secondUserTokenIds[2]);
    
    expect(initiatorERC1155_47_balance.toNumber()).to.be.deep.equal(0);
    expect(secondUserERC1155_71_balance.toNumber()).to.be.deep.equal(0);

    // check if all values are emitted in "SwapInitiated" event
    expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
    expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    const initiatorERC1155_47_balanceAfterCancel = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);
    const secondUserERC1155_71_balanceAfterCancel = await otherAppUserERC1155.balanceOf(otherAppUserAddress, secondUserTokenIds[2]);

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that NFT is returned to initial owners
    expect(await appUserERC721.ownerOf(121)).to.be.deep.equal(appUserAddress);
    expect(await appUserERC721.ownerOf(135)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserERC721.ownerOf(136)).to.be.deep.equal(otherAppUserAddress);
    expect(initiatorERC1155_47_balanceAfterCancel.toNumber()).to.be.deep.equal(secondUserTokenAmounts[2]);
    expect(secondUserERC1155_71_balanceAfterCancel.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
  });

  it('Should succesfully cancel swap created with ether value', async function () {
    const firstUserBalance = await appUser.signer.getBalance();
    const secondUserBalance = await otherAppUser.signer.getBalance();

    const initiatorTokenIds = [430, 431];
    const initiatorTokenAmounts = [0, 25];

    await appUserERC721.mint(appUserAddress, 430);
    await appUserERC721.approve(swapKiwi.address, 430);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE.add(parseEther("20"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await otherAppUserERC721.mint(otherAppUserAddress, 431);
    await otherAppUserERC721.approve(swapKiwi.address, 431);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address],
      [431], [0],
      {
        value: VALID_APP_FEE.add(parseEther("10"))
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    const erc1155_431_initiatorBalance = await appUserERC1155.balanceOf(appUserAddress, initiatorTokenIds[1]);

    expect(await appUserERC721.ownerOf(430)).to.be.deep.equal(appUserAddress);
    expect(await appUserERC721.ownerOf(431)).to.be.deep.equal(otherAppUserAddress);
    expect(erc1155_431_initiatorBalance.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
    expect(firstUserBalance.sub(await appUser.signer.getBalance()).lt(parseEther("1"))).to.be.equal(true);
    expect(secondUserBalance.sub(await otherAppUser.signer.getBalance()).lt(parseEther("1"))).to.be.equal(true);
  });

  it('Should fail to initiate swap if swap canceled', async function () {
    const initiatorTokenIds = [170, 171];
    const initiatorTokenAmounts = [0, 90];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());
    const cancelTx = await appUser.cancelSwap(swapIdFromLogs);
    await cancelTx.wait(1);

    await otherAppUserERC721.mint(otherAppUserAddress, 301);
    await otherAppUserERC721.approve(swapKiwi.address, 301);
    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserERC721.address], [301], [0], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      `SwapKiwi: caller is not swap participator`
    );
  });

  it('Should fail to initiate swap with invalid app fee', async function () {
    const tx = await appUser.proposeSwap(otherAppUserAddress, [], [], [], {
      value: VALID_APP_FEE.add(parseEther("0.1"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [], [], [], {
      value: parseEther("0.01")
    })).to.be.rejectedWith(
      `SwapKiwi: Sent ETH amount needs to be more or equal application fee`
    );
  });

  it('Should fail to initiate swap twice', async function () {
    const initiatorTokenIds = [189, 190];
    const initiatorTokenAmounts = [0, 75];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());
    await otherAppUserERC721.mint(otherAppUserAddress, 302);
    await otherAppUserERC721.approve(swapKiwi.address, 302);
    await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserERC721.address], [302], [0], {
      value: VALID_APP_FEE
    })

    await otherAppUserERC721.mint(otherAppUserAddress, 303);
    await otherAppUserERC721.approve(swapKiwi.address, 303);
    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserERC721.address], [303], [0], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      "SwapKiwi: swap already initiated"
    );
  });

  it('Should fail to initiate swap twice if proposed only with ether', async function () {
    const initiatorTokenIds = [1732, 1733];
    const initiatorTokenAmounts = [0, 100];

    await appUserERC721.mint(appUserAddress, 1732);
    await appUserERC721.approve(swapKiwi.address, 1732);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());
    await otherAppUser.initiateSwap(swapIdFromLogs, [], [], [], {
      value: VALID_APP_FEE.add(ethers.utils.parseEther("0.25"))
    })


    await otherAppUserERC721.mint(otherAppUserAddress, 1733);
    await otherAppUserERC721.approve(swapKiwi.address, 1733);
    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserERC721.address], [1733], [0], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      "SwapKiwi: swap already initiated"
    );
  });

  it('Should fail to cancel swap twice', async function () {
    const initiatorTokenIds = [200, 201];
    const initiatorTokenAmounts = [0, 2];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const cancelTx = await appUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(appUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that NFT is returned to initial owner
    expect(await appUserERC721.ownerOf(200)).to.be.deep.equal(appUserAddress);

    await expect(appUser.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
      "SwapKiwi: Can't cancel swap, must be swap participant"
    );
  });

  it("Should fail to cancel swap if user is not a swap participant", async function () {
    const nonSwapParticipant = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

    const initiatorTokenIds = [70, 71];
    const initiatorTokenAmounts = [0, 75];

    // first user NFT minting and swap deposit into SwapKiwi
    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await expect(nonSwapParticipant.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
      "SwapKiwi: Can't cancel swap, must be swap participant");
  });

  it("Should fail to accept swap if second user didn't add NFTs or ether", async function () {
    const initiatorTokenIds = [2000, 2001];
    const initiatorTokenAmounts = [0, 10];

    // first user NFT minting and swap deposit into SwapKiwi
    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await expect(appUser.acceptSwap(swapIdFromLogs)).to.be.rejectedWith(
      "SwapKiwi: Can't accept swap, both participants didn't add NFTs");
  });

  it('Should fail to accept swap if not swap initiator', async function () {
    await appUserERC721.mint(appUserAddress, 2100);
    await appUserERC721.approve(swapKiwi.address, 2100);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address], [2100], [0], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [],
      [],
      [],
      {
        value: VALID_APP_FEE.add(parseEther("50"))
      }
    );
    await initiateSwapTx.wait(1);

    await expect(otherAppUser.acceptSwap(swapIdFromLogs)).to.be.rejectedWith(
      "SwapKiwi: caller is not swap initiator"
    );
  });

  it('Should successfully execute NFT - NFT swap', async function () {
    // first user NFT minting and swap deposit into SwapKiwi
    const initiatorNftIds = [85, 86, 55];
    const initiatorNftAmounts = [0, 0, 10];
    const secondUserNftIds = [87, 88, 56];
    const secondUserNftAmounts = [0, 0, 15];

    await appUserERC721.mint(appUserAddress, initiatorNftIds[0]);
    await appUserERC721.mint(appUserAddress, initiatorNftIds[1]);
    await appUserERC721.approve(swapKiwi.address, initiatorNftIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorNftIds[1]);
    await appUserERC1155.mint(appUserAddress, initiatorNftIds[2], initiatorNftAmounts[2]);
    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC721.address, appUserERC1155.address], initiatorNftIds, initiatorNftAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const swap_erc1155_55_balance = await appUserERC1155.balanceOf(swapKiwi.address, 55);

    // check that first user NFTs are deposited into SwapKiwi
    expect(await appUserERC721.ownerOf(85)).to.be.deep.equal(swapKiwi.address);
    expect(await appUserERC721.ownerOf(86)).to.be.deep.equal(swapKiwi.address);
    expect(swap_erc1155_55_balance.toNumber()).to.be.deep.equal(initiatorNftAmounts[2]);

    // second user NFT minting and swap deposit into SwapKiwi
    await otherAppUserERC721.mint(otherAppUserAddress, secondUserNftIds[0]);
    await otherAppUserERC721.mint(otherAppUserAddress, secondUserNftIds[1]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserNftIds[0]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserNftIds[1]);
    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserNftIds[2], secondUserNftAmounts[2]);
    await otherAppUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address, otherAppUserERC721.address, otherAppUserERC1155.address],
      secondUserNftIds,
      secondUserNftAmounts,
      {
        value: VALID_APP_FEE
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
    
    const swap_erc1155_56_balance = await otherAppUserERC1155.balanceOf(swapKiwi.address, secondUserNftIds[2]);

    // check if all values are emitted in "SwapInitiated" event
    expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
    expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);
    
    // check that second user NFTs are deposited into SwapKiwi
    expect(await otherAppUserERC721.ownerOf(87)).to.be.deep.equal(swapKiwi.address);
    expect(await otherAppUserERC721.ownerOf(88)).to.be.deep.equal(swapKiwi.address);
    expect(swap_erc1155_56_balance.toNumber()).to.be.deep.equal(secondUserNftAmounts[2]);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    const acceptSwapTxReceipt = await acceptSwapTx.wait(1);
    const acceptSwapLogs = await getEventWithArgsFromLogs(acceptSwapTxReceipt, "SwapExecuted");

    // check if all values are emitted in "SwapExecuted" event
    expect(acceptSwapLogs.eventName).to.be.deep.equal("SwapExecuted");
    expect(acceptSwapLogs.args.from).to.be.deep.equal(appUserAddress);
    expect(acceptSwapLogs.args.to).to.be.deep.equal(otherAppUserAddress);
    // check that NFTs are transfered from SwapKiwi to participants - same address because both have same signer

    expect(await otherAppUserERC721.ownerOf(85)).to.be.deep.equal(otherAppUserAddress);
    expect(await otherAppUserERC721.ownerOf(86)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserERC721.ownerOf(87)).to.be.deep.equal(appUserAddress);
    expect(await appUserERC721.ownerOf(88)).to.be.deep.equal(appUserAddress);

    const initiator_erc1155_56_balance = await otherAppUserERC1155.balanceOf(appUserAddress, secondUserNftIds[2]);
    expect(initiator_erc1155_56_balance.toNumber()).to.be.deep.equal(secondUserNftAmounts[2]);

    const secondUser_erc1155_55_balance = await otherAppUserERC1155.balanceOf(otherAppUserAddress, initiatorNftIds[2]);
    expect(secondUser_erc1155_55_balance.toNumber()).to.be.deep.equal(initiatorNftAmounts[2]);
  });

  it('Should successfully execute NFT + ether - NFT + ether swap', async function () {
    const firstUserBalance = await appUser.signer.getBalance();
    const secondUserBalance = await otherAppUser.signer.getBalance();

    const initiatorTokenIds = [375, 1376, 1377];
    const initiatorTokenAmounts = [0, 10, 20];

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[2], initiatorTokenAmounts[2]);

    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE.add(parseEther("50"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const secondUserTokenIds = [376, 2376, 2377];
    const secondUserTokenAmounts = [0, 50, 60];

    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[0]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[0]);

    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[1], secondUserTokenAmounts[1]);
    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[2], secondUserTokenAmounts[2]);

    await otherAppUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address, otherAppUserERC1155.address, otherAppUserERC1155.address],
      secondUserTokenIds,
      secondUserTokenAmounts,
      {
        value: VALID_APP_FEE.add(parseEther("25"))
      }
    );
    await initiateSwapTx.wait(1);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    await acceptSwapTx.wait(1);

    const erc1155_2376_initiatorBalance = await otherAppUserERC1155.balanceOf(appUserAddress, secondUserTokenIds[1]);
    const erc1155_2377_initiatorBalance = await otherAppUserERC1155.balanceOf(appUserAddress, secondUserTokenIds[2]);

    const erc1155_1376_secondUserBalance = await appUserERC1155.balanceOf(otherAppUserAddress, initiatorTokenIds[1]);
    const erc1155_1377_secondUserBalance = await appUserERC1155.balanceOf(otherAppUserAddress, initiatorTokenIds[2]);

    expect(await appUserERC721.ownerOf(375)).to.be.deep.equal(otherAppUserAddress);
    expect(await otherAppUserERC721.ownerOf(376)).to.be.deep.equal(appUserAddress);
    expect(erc1155_2376_initiatorBalance.toNumber()).to.be.deep.equal(secondUserTokenAmounts[1]);
    expect(erc1155_2377_initiatorBalance.toNumber()).to.be.deep.equal(secondUserTokenAmounts[2]);
    expect(erc1155_1376_secondUserBalance.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
    expect(erc1155_1377_secondUserBalance.toNumber()).to.be.deep.equal(initiatorTokenAmounts[2]);
    expect(firstUserBalance.sub((await appUser.signer.getBalance()).add(parseEther("25"))).lt(parseEther("1"))).to.be.equal(true);
    expect(secondUserBalance.sub((await otherAppUser.signer.getBalance()).sub(parseEther("25"))).lt(parseEther("1"))).to.be.equal(true);
  });

  it('Should successfully execute ether - NFT swap', async function () {
    const secondUserBalance = await otherAppUser.signer.getBalance();

    const tx = await appUser.proposeSwap(otherAppUserAddress, [], [], [], {
      value: VALID_APP_FEE.add(parseEther("50"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const secondUserTokenIds = [1800, 1801, 1802];
    const secondUserTokenAmounts = [0, 50, 60];

    await otherAppUserERC721.mint(otherAppUserAddress, secondUserTokenIds[0]);
    await otherAppUserERC721.approve(swapKiwi.address, secondUserTokenIds[0]);

    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[1], secondUserTokenAmounts[1]);
    await otherAppUserERC1155.mint(otherAppUserAddress, secondUserTokenIds[2], secondUserTokenAmounts[2]);

    await otherAppUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserERC721.address, otherAppUserERC1155.address, otherAppUserERC1155.address],
      secondUserTokenIds,
      secondUserTokenAmounts,
      {
        value: VALID_APP_FEE
      }
    );
    await initiateSwapTx.wait(1);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    await acceptSwapTx.wait(1);

    const erc1155_1801_initiatorBalance = await otherAppUserERC1155.balanceOf(appUserAddress, secondUserTokenIds[1]);
    const erc1155_1802_initiatorBalance = await otherAppUserERC1155.balanceOf(appUserAddress, secondUserTokenIds[2]);

    expect(await otherAppUserERC721.ownerOf(1800)).to.be.deep.equal(appUserAddress);
    expect(erc1155_1801_initiatorBalance.toNumber()).to.be.deep.equal(secondUserTokenAmounts[1]);
    expect(erc1155_1802_initiatorBalance.toNumber()).to.be.deep.equal(secondUserTokenAmounts[2]);
    expect(
      (
        await otherAppUser.signer.getBalance()
      ).sub(secondUserBalance).sub(parseEther("50")).lt(parseEther("1"))).to.be.equal(true);
  });

  it('Should successfully execute NFT - ether swap', async function () {
    const firstUserBalance = await appUser.signer.getBalance();

    const initiatorTokenIds = [1822, 1823, 1825];
    const initiatorTokenAmounts = [0, 10, 20];

    await appUserERC721.mint(appUserAddress, initiatorTokenIds[0]);
    await appUserERC721.approve(swapKiwi.address, initiatorTokenIds[0]);

    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[1], initiatorTokenAmounts[1]);
    await appUserERC1155.mint(appUserAddress, initiatorTokenIds[2], initiatorTokenAmounts[2]);

    await appUserERC1155.setApprovalForAll(swapKiwi.address, true);

    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserERC721.address, appUserERC1155.address, appUserERC1155.address], initiatorTokenIds, initiatorTokenAmounts, {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [],
      [],
      [],
      {
        value: VALID_APP_FEE.add(parseEther("50"))
      }
    );
    await initiateSwapTx.wait(1);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    await acceptSwapTx.wait(1);

    const erc1155_1823_otherUserBalance = await appUserERC1155.balanceOf(otherAppUserAddress, initiatorTokenIds[1]);
    const erc1155_1825_otherUserBalance = await appUserERC1155.balanceOf(otherAppUserAddress, initiatorTokenIds[2]);

    expect(await appUserERC721.ownerOf(initiatorTokenIds[0])).to.be.deep.equal(otherAppUserAddress);
    expect(erc1155_1823_otherUserBalance.toNumber()).to.be.deep.equal(initiatorTokenAmounts[1]);
    expect(erc1155_1825_otherUserBalance.toNumber()).to.be.deep.equal(initiatorTokenAmounts[2]);
    expect(
      (
        await appUser.signer.getBalance()
      ).sub(firstUserBalance).sub(parseEther("50")).lt(parseEther("1"))).to.be.equal(true);
  });

  it("Should successfully withdraw only collected fees", async function () {
    await swapKiwi.withdrawEther(await signers[7].getAddress());

    const tx1 = await appUser.proposeSwap(otherAppUserAddress, [], [], [], {
      value: VALID_APP_FEE.add(ethers.utils.parseEther("1"))
    });
    const txReceipt1 = await tx1.wait(1);
    const logs1 = await getEventWithArgsFromLogs(txReceipt1, "SwapProposed");
    const swapIdFromLogs1 = Number(logs1.args.swapId.toString());
    const initiateSwapTx1 = await otherAppUser.initiateSwap(
      swapIdFromLogs1,
      [],
      [],
      [],
      {
        value: VALID_APP_FEE.add(parseEther("5"))
      }
    );
    await initiateSwapTx1.wait(1);
    const acceptSwapTx1 = await appUser.acceptSwap(swapIdFromLogs1);
    await acceptSwapTx1.wait(1);
    const tx2 = await appUser.proposeSwap(otherAppUserAddress, [], [], [], {
      value: VALID_APP_FEE.add(ethers.utils.parseEther("1"))
    });
    const txReceipt2 = await tx2.wait(1);
    const logs2 = await getEventWithArgsFromLogs(txReceipt2, "SwapProposed");
    const swapIdFromLogs = Number(logs2.args.swapId.toString());
    const initiateSwapTx2 = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [],
      [],
      [],
      {
        value: VALID_APP_FEE.add(parseEther("5"))
      }
    );
    await initiateSwapTx2.wait(1);

    await swapKiwi.withdrawEther(appUserERC721.address)

    expect((await ethers.provider.getBalance(appUserERC721.address)).toString())
      .to.be.deep.equal(VALID_APP_FEE.mul(4).toString())
  });

  it("Should fail to withdraw collected fees if not owner", async function () {
    await expect(appUser.withdrawEther(appUser.address))
      .to.be.rejectedWith(
        "Ownable: caller is not the owner");
  });

  it("Should fail to withdraw collected fees if sent to zero address", async function () {
    await expect(swapKiwi.withdrawEther("0x0000000000000000000000000000000000000000"))
      .to.be.rejectedWith("SwapKiwi: transfer to the zero address");
  });
});
