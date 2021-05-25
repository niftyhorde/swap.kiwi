import { Deployment } from "hardhat-deploy/types";
import { expect, use } from "chai";
import hre, { ethers, deployments } from "hardhat";
import { SwapKiwi } from "../typechain/SwapKiwi";
import { TestNFT } from "../typechain/TestNFT";
import { Contract, Signer } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe("Escrow", async function () {
  let SwapKiwi: Deployment;
  let swapKiwi: SwapKiwi;
  let TestNFT: Deployment;
  let testNFT: TestNFT;
  let signers: Signer[];
  let appUser: SwapKiwi;
  let otherAppUser: SwapKiwi;
  const VALID_APP_FEE = ethers.utils.parseEther("0.1");

  before(async () => {
    signers = await ethers.getSigners();
    ({ SwapKiwi, TestNFT } = await deployments.fixture());
    swapKiwi = await ethers.getContractAt(SwapKiwi.abi, SwapKiwi.address, signers[0]) as SwapKiwi;
    testNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[1]) as TestNFT;

    appUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[1]) as SwapKiwi;
    otherAppUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[1]) as SwapKiwi;
  });

  function getFilterName(eventName: string) {
    let filter: any;
    switch (eventName) {
      case "SwapExecuted":
        filter = swapKiwi.filters.SwapExecuted(null, null, null);
        break;
      case "SwapRejected":
        filter = swapKiwi.filters.SwapRejected(null, null);
        break;
      case "SwapCanceled":
        filter = swapKiwi.filters.SwapCanceled(null, null);
        break;
      case "SwapProposed":
        filter = swapKiwi.filters.SwapProposed(null, null, null, null, null);
        break;
      case "SwapInitiated":
        filter = swapKiwi.filters.SwapInitiated(null, null, null, null, null);
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
      )
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
      .to.be.rejectedWith("VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });

  it('Should succesfully deposit NFT into escrow contract and emit "SwapProposed" event', async function () {
    await testNFT.mint(await signers[1].getAddress(), 25);
    await testNFT.approve(swapKiwi.address, 25);
    expect(await testNFT.ownerOf(25)).to.be.deep.equal(await signers[1].getAddress());

    const tx = await appUser.proposeSwap(otherAppUser.address, [testNFT.address], [25], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");

    // check if all values are emitted in event
    expect(logs[0].eventName).to.be.deep.equal("SwapProposed");
    expect(logs[0].args.from).to.be.deep.equal(await signers[1].getAddress());
    expect(logs[0].args.to).to.be.deep.equal(swapKiwi.address);
    expect(logs[0].args.nftAddresses[0]).to.be.deep.equal(testNFT.address);
    expect(logs[0].args.nftIds[0].toString()).to.be.deep.equal("25");
    expect(await testNFT.ownerOf(25)).to.be.deep.equal(swapKiwi.address);
  });

  it('Should succesfully cancel swap by second user and emit "SwapCanceled" event', async function () {
    await testNFT.mint(await signers[1].getAddress(), 60);
    await testNFT.approve(swapKiwi.address, 60);
    const tx = await appUser.proposeSwap(await signers[1].getAddress(), [testNFT.address], [60], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs[logs.length - 2].args.swapId.toString());

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    // check if all values are emitted in event
    expect(cancelTxlogs[0].eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs[0].args.canceledBy).to.be.deep.equal(await signers[1].getAddress());
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs[0].args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
  });

  it("Should fail to cancel swap if second user has deposited his NFTs", async function () {
    // first user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 70);
    await testNFT.approve(swapKiwi.address, 70);
    const tx = await appUser.proposeSwap(await signers[1].getAddress(), [testNFT.address], [70], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs[logs.length - 1].args.swapId.toString());

    // second user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 71);
    await testNFT.approve(swapKiwi.address, 71);
    await otherAppUser.initiateSwap(swapIdFromLogs, [testNFT.address], [71], {
      value: VALID_APP_FEE
    });
    // check that second player NFT is deposited into SwapKiwi
    expect(await testNFT.ownerOf(71)).to.be.deep.equal(swapKiwi.address);

    await expect(otherAppUser.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
      "VM Exception while processing transaction: revert SwapKiwi: Can't cancel swap after other user added NFTs");
  });

  it('Should succesfully reject swap by swap initiator and emit "swapRejected" event', async function () {
    // first user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 80);
    await testNFT.approve(swapKiwi.address, 80);
    const tx = await appUser.proposeSwap(await signers[1].getAddress(), [testNFT.address], [80], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs[logs.length - 1].args.swapId.toString());

    // second user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 81);
    await testNFT.approve(swapKiwi.address, 81);
    await otherAppUser.initiateSwap(swapIdFromLogs, [testNFT.address], [81], {
      value: VALID_APP_FEE
    });

    const rejectSwapTx = await appUser.rejectSwap(swapIdFromLogs);
    const rejectSwapTxReceipt = await rejectSwapTx.wait(1);
    const rejectSwapLogs = await getEventWithArgsFromLogs(rejectSwapTxReceipt, "SwapRejected");

    // check if all values are emitted in event
    expect(rejectSwapLogs[0].eventName).to.be.deep.equal("SwapRejected");
    expect(rejectSwapLogs[0].args.rejectedBy).to.be.deep.equal(await signers[1].getAddress());
    // expect that swap ID from "SwapRejected" is same as swap ID from "swapProposed" event
    expect(rejectSwapLogs[0].args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
  });

  it("Should fail to reject swap if caller is not initiator", async function () {
    const nonOwnerContract = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

    await expect(nonOwnerContract.rejectSwap(1)).to.be.rejectedWith(
      "VM Exception while processing transaction: revert SwapKiwi: caller is not swap initiator");
  });

  it('Should successfully execute swap, transfer NFTs from SwapKiwi to new users and emit "swapExecutedEvent" and "swapInitiated" events', async function () {
    // first user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 85);
    await testNFT.mint(await signers[1].getAddress(), 86);
    await testNFT.approve(swapKiwi.address, 85);
    await testNFT.approve(swapKiwi.address, 86);
    const tx = await appUser.proposeSwap(await signers[1].getAddress(), [testNFT.address, testNFT.address], [85, 86], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs[logs.length - 1].args.swapId.toString());

    // check that first user NFTs are deposited into SwapKiwi
    expect(await testNFT.ownerOf(85)).to.be.deep.equal(swapKiwi.address);
    expect(await testNFT.ownerOf(86)).to.be.deep.equal(swapKiwi.address);

    // second user NFT minting and swap deposit into SwapKiwi
    await testNFT.mint(await signers[1].getAddress(), 87);
    await testNFT.mint(await signers[1].getAddress(), 88);
    await testNFT.approve(swapKiwi.address, 87);
    await testNFT.approve(swapKiwi.address, 88);
    const initiateSwapTx = await otherAppUser.initiateSwap(swapIdFromLogs, [testNFT.address, testNFT.address], [87, 88], {
      value: VALID_APP_FEE
    });
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
    // check if all values are emitted in "SwapExecuted" event
    expect(initiateSwapLogs[0].eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs[0].args.from).to.be.deep.equal(await signers[1].getAddress());
    expect(initiateSwapLogs[0].args.to).to.be.deep.equal(await signers[1].getAddress());

    // check that second user NFTs are deposited into SwapKiwi
    expect(await testNFT.ownerOf(87)).to.be.deep.equal(swapKiwi.address);
    expect(await testNFT.ownerOf(88)).to.be.deep.equal(swapKiwi.address);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    const acceptSwapTxReceipt = await acceptSwapTx.wait(1);
    const acceptSwapLogs = await getEventWithArgsFromLogs(acceptSwapTxReceipt, "SwapExecuted");

    // check if all values are emitted in "SwapExecuted" event
    expect(acceptSwapLogs[0].eventName).to.be.deep.equal("SwapExecuted");
    expect(acceptSwapLogs[0].args.from).to.be.deep.equal(await signers[1].getAddress());
    expect(acceptSwapLogs[0].args.to).to.be.deep.equal(await signers[1].getAddress());
    // check that NFTs are transfered from SwapKiwi to participants - same address because both have same signer
    expect(await testNFT.ownerOf(85)).to.be.deep.equal(await signers[1].getAddress());
    expect(await testNFT.ownerOf(86)).to.be.deep.equal(await signers[1].getAddress());
    expect(await testNFT.ownerOf(87)).to.be.deep.equal(await signers[1].getAddress());
    expect(await testNFT.ownerOf(88)).to.be.deep.equal(await signers[1].getAddress());
  });

  it("Should successful withdraw collected fees from SwapKiwi if called by owner", async function () {
    await swapKiwi.withdrawEther(testNFT.address, ethers.utils.parseEther("0.1"));

    expect((await ethers.provider.getBalance(testNFT.address)).toString())
      .to.be.deep.equal(ethers.utils.parseEther("0.1").toString());
  });

  it("Should fail to withdraw collected fees from SwapKiwi if called not owner", async function () {
    await expect(appUser.withdrawEther(appUser.address, ethers.utils.parseEther("1.0")))
      .to.be.rejectedWith(
        "VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });
});
