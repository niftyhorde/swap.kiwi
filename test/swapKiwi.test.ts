import { Deployment } from "hardhat-deploy/types";
import { expect, use } from "chai";
import hre, { ethers, deployments, network } from "hardhat";
import { SwapKiwi } from "../typechain/SwapKiwi";
import { TestNFT } from "../typechain/TestNFT";
import { Contract, Signer } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
import chaiAsPromised from 'chai-as-promised';

import { cryptoPunksAbi } from "./cryptoPunksAbi"

use(chaiAsPromised);

describe("Swap.Kiwi", async function () {
  let SwapKiwi: Deployment;
  let swapKiwi: SwapKiwi;
  let TestNFT: Deployment;
  let appUserNFT: TestNFT;
  let otherAppUserNFT: TestNFT;
  let signers: Signer[];
  let appUser: SwapKiwi;
  let otherAppUser: SwapKiwi;
  let appUserAddress: string;
  let otherAppUserAddress: string;
  let cryptoPunks1Signer: Signer;
  let cryptoPunks: Contract;
  let cryptoPunk1OwnerAddress: string;

  const VALID_APP_FEE = ethers.utils.parseEther("0.1");
  const cryptoPunksMainnetAddress = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB";

  before(async () => {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xB88F61E6FbdA83fbfffAbE364112137480398018"]
    });

    signers = await ethers.getSigners();
    ({ SwapKiwi, TestNFT } = await deployments.fixture());
    swapKiwi = await ethers.getContractAt(SwapKiwi.abi, SwapKiwi.address, signers[0]) as SwapKiwi;

    appUserNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[2]) as TestNFT;
    otherAppUserNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[3]) as TestNFT;
    cryptoPunks = await ethers.getContractAt(cryptoPunksAbi, cryptoPunksMainnetAddress);

    appUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[2]) as SwapKiwi;
    otherAppUser = new ethers.Contract(swapKiwi.address, SwapKiwi.abi, signers[3]) as SwapKiwi;
    cryptoPunks1Signer = ethers.provider.getSigner("0xB88F61E6FbdA83fbfffAbE364112137480398018");
    appUserAddress = await signers[2].getAddress();
    otherAppUserAddress = await signers[3].getAddress();
    cryptoPunk1OwnerAddress = await cryptoPunks1Signer.getAddress();
  });

  after(async () => {
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0xB88F61E6FbdA83fbfffAbE364112137480398018"]
    });

    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_APP_ID}`,
          blockNumber: 12503592
        }
      }]
    })
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
      ).pop()
    }
    return null;
  }

  describe("ERC721 tests", async function () {
    it("Should successfully set app fee if caller is the owner", async function () {
      await swapKiwi.setAppFee(VALID_APP_FEE);
      expect((await swapKiwi.fee()).toString()).to.be.deep.equal(VALID_APP_FEE.toString());
    });

    it("Should fail to set app fee if caller is not owner", async function () {
      const nonOwnerContract = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

      await expect(nonOwnerContract.setAppFee(1000))
        .to.be.rejectedWith("VM Exception while processing transaction: revert Ownable: caller is not the owner");
    });

    it('Should successfully deposit NFT into escrow contract and emit "SwapProposed" event', async function () {
      await appUserNFT.mint(appUserAddress, 25);
      await appUserNFT.approve(swapKiwi.address, 25);
      expect(await appUserNFT.ownerOf(25)).to.be.deep.equal(appUserAddress);

      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [25], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");

      // check if all values are emitted in event
      expect(logs.eventName).to.be.deep.equal("SwapProposed");
      expect(logs.args.from).to.be.deep.equal(appUserAddress);
      expect(logs.args.to).to.be.deep.equal(otherAppUserAddress);
      expect(logs.args.nftAddresses[0]).to.be.deep.equal(appUserNFT.address);
      expect(logs.args.nftIds[0].toString()).to.be.deep.equal("25");
      expect(await appUserNFT.ownerOf(25)).to.be.deep.equal(swapKiwi.address);
    });

    it('Should successfully cancel swap by first user and emit "SwapCanceled" event', async function () {
      await appUserNFT.mint(appUserAddress, 140);
      await appUserNFT.approve(swapKiwi.address, 140);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [140], {
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
      // check if NFTs are returned to their initial owners
      expect(await appUserNFT.ownerOf(140)).to.be.deep.equal(appUserAddress);
    });

    it('Should successfully cancel swap by second user and emit "SwapCanceled" event', async function () {
      await appUserNFT.mint(appUserAddress, 120);
      await appUserNFT.approve(swapKiwi.address, 120);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [120], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
      const cancelTxReceipt = await cancelTx.wait(1);
      const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

      // check if all values are emitted in event
      expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
      expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
      // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
      expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
      // check if NFTs are returned to their initial owners
      expect(await appUserNFT.ownerOf(120)).to.be.deep.equal(appUserAddress);
    });

    it("Should fail to cancel swap if second user already added NFTs", async function () {
      // first user NFT minting and swap deposit into SwapKiwi
      await appUserNFT.mint(appUserAddress, 160);
      await appUserNFT.approve(swapKiwi.address, 160);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [160], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      // second user NFT minting and swap deposit into SwapKiwi
      await otherAppUserNFT.mint(otherAppUserAddress, 71);
      await otherAppUserNFT.approve(swapKiwi.address, 71);
      await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [71], {
        value: VALID_APP_FEE
      });
      // check that second player NFT is deposited into SwapKiwi
      expect(await otherAppUserNFT.ownerOf(71)).to.be.deep.equal(swapKiwi.address);

      await expect(otherAppUser.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
        "VM Exception while processing transaction: revert SwapKiwi: Can't cancel swap after other user added NFTs");
    });

    it("Should fail to cancel swap if user is not a swap participant", async function () {
      const nonSwapParticipant = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

      // first user NFT minting and swap deposit into SwapKiwi
      await appUserNFT.mint(appUserAddress, 70);
      await appUserNFT.approve(swapKiwi.address, 70);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [70], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      await expect(nonSwapParticipant.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
        "VM Exception while processing transaction: revert SwapKiwi: Can't cancel swap, must be swap participant");
    });

    it('Should successfully reject swap by swap initiator and emit "swapRejected" event', async function () {
      // first user NFT minting and swap deposit into SwapKiwi
      await appUserNFT.mint(appUserAddress, 80);
      await appUserNFT.approve(swapKiwi.address, 80);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [80], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      // second user NFT minting and swap deposit into SwapKiwi
      await otherAppUserNFT.mint(otherAppUserAddress, 81);
      await otherAppUserNFT.approve(swapKiwi.address, 81);
      await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [81], {
        value: VALID_APP_FEE
      });

      const rejectSwapTx = await appUser.rejectSwap(swapIdFromLogs);
      const rejectSwapTxReceipt = await rejectSwapTx.wait(1);
      const rejectSwapLogs = await getEventWithArgsFromLogs(rejectSwapTxReceipt, "SwapRejected");

      // check if all values are emitted in event
      expect(rejectSwapLogs.eventName).to.be.deep.equal("SwapRejected");
      expect(rejectSwapLogs.args.rejectedBy).to.be.deep.equal(appUserAddress);
      // expect that swap ID from "SwapRejected" is same as swap ID from "swapProposed" event
      expect(rejectSwapLogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    });

    it("Should fail to reject swap if caller is not initiator", async function () {
      const nonOwnerContract = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

      await expect(nonOwnerContract.rejectSwap(1)).to.be.rejectedWith(
        "VM Exception while processing transaction: revert SwapKiwi: caller is not swap initiator");
    });

    it('Should successfully execute swap, transfer NFTs from SwapKiwi to new users and emit "swapExecutedEvent" and "swapInitiated" events', async function () {
      // first user NFT minting and swap deposit into SwapKiwi
      await appUserNFT.mint(appUserAddress, 85);
      await appUserNFT.mint(appUserAddress, 86);
      await appUserNFT.approve(swapKiwi.address, 85);
      await appUserNFT.approve(swapKiwi.address, 86);
      const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address, appUserNFT.address], [85, 86], {
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      // check that first user NFTs are deposited into SwapKiwi
      expect(await appUserNFT.ownerOf(85)).to.be.deep.equal(swapKiwi.address);
      expect(await appUserNFT.ownerOf(86)).to.be.deep.equal(swapKiwi.address);

      // second user NFT minting and swap deposit into SwapKiwi
      await otherAppUserNFT.mint(otherAppUserAddress, 87);
      await otherAppUserNFT.mint(otherAppUserAddress, 88);
      await otherAppUserNFT.approve(swapKiwi.address, 87);
      await otherAppUserNFT.approve(swapKiwi.address, 88);
      const initiateSwapTx = await otherAppUser.initiateSwap(
        swapIdFromLogs,
        [otherAppUserNFT.address, otherAppUserNFT.address],
        [87, 88],
        {
          value: VALID_APP_FEE
        }
      );
      const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
      const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
      // check if all values are emitted in "SwapExecuted" event
      expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
      expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
      expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);

      // check that second user NFTs are deposited into SwapKiwi
      expect(await otherAppUserNFT.ownerOf(87)).to.be.deep.equal(swapKiwi.address);
      expect(await otherAppUserNFT.ownerOf(88)).to.be.deep.equal(swapKiwi.address);

      const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
      const acceptSwapTxReceipt = await acceptSwapTx.wait(1);
      const acceptSwapLogs = await getEventWithArgsFromLogs(acceptSwapTxReceipt, "SwapExecuted");

      // check if all values are emitted in "SwapExecuted" event
      expect(acceptSwapLogs.eventName).to.be.deep.equal("SwapExecuted");
      expect(acceptSwapLogs.args.from).to.be.deep.equal(appUserAddress);
      expect(acceptSwapLogs.args.to).to.be.deep.equal(otherAppUserAddress);
      // check that NFTs are transferred from SwapKiwi to participants - same address because both have same signer

      expect(await otherAppUserNFT.ownerOf(85)).to.be.deep.equal(otherAppUserAddress);
      expect(await otherAppUserNFT.ownerOf(86)).to.be.deep.equal(otherAppUserAddress);
      expect(await appUserNFT.ownerOf(87)).to.be.deep.equal(appUserAddress);
      expect(await appUserNFT.ownerOf(88)).to.be.deep.equal(appUserAddress);
    });

    it("Should successful withdraw collected fees from SwapKiwi if called by owner", async function () {
      await swapKiwi.withdrawEther(appUserNFT.address, ethers.utils.parseEther("0.1"));

      expect((await ethers.provider.getBalance(appUserNFT.address)).toString())
        .to.be.deep.equal(ethers.utils.parseEther("0.1").toString());
    });

    it("Should fail to withdraw collected fees from SwapKiwi if called not owner", async function () {
      await expect(appUser.withdrawEther(appUser.address, ethers.utils.parseEther("1.0")))
        .to.be.rejectedWith(
          "VM Exception while processing transaction: revert Ownable: caller is not the owner");
    });
  });

  describe("CryptoPunks tests", async function () {
    it('Should successfully cancel CryptoPunks swap by second user and emit "SwapCanceled" event', async function () {
      // check that cryptoPunks1Signer is CryptoPunk with id=1 owner
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );

      // deposit CryptoPunk NFT into SwapKiwi
      await cryptoPunks1Signer.sendTransaction({
        to: cryptoPunks.address,
        data: cryptoPunks.interface.encodeFunctionData("transferPunk", [swapKiwi.address, 1]),
      });
      // check that first user NFTs are deposited into SwapKiwi
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(swapKiwi.address);
      const tx = await cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("proposeSwap", [
          otherAppUserAddress, [cryptoPunks.address], [1]
        ]),
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);

      const cancelTxReceipt = await cancelTx.wait(1);
      const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

      // check if all values are emitted in event
      expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
      expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
      // // check if NFTs are returned to their initial owners
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );
    });

    it('Should successfully reject CryptoPunks swap by second user and emit "swapRejected" event', async function () {
      // check that cryptoPunks1Signer is CryptoPunk with id=1 owner
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );

      // deposit CryptoPunk NFT into SwapKiwi
      await cryptoPunks1Signer.sendTransaction({
        to: cryptoPunks.address,
        data: cryptoPunks.interface.encodeFunctionData("transferPunk", [swapKiwi.address, 1]),
      });
      // check that first user NFTs are deposited into SwapKiwi
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(swapKiwi.address);
      const tx = await cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("proposeSwap", [
          otherAppUserAddress, [cryptoPunks.address], [1]
        ]),
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      // second user NFT minting and swap deposit into SwapKiwi
      await otherAppUserNFT.mint(otherAppUserAddress, 95);
      await otherAppUserNFT.approve(swapKiwi.address, 95);
      const initiateSwapTx = await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [95], {
        value: VALID_APP_FEE
      });
      const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
      const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");

      // check if all values are emitted in "SwapInitiated" event
      expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
      expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
      expect(initiateSwapLogs.args.to).to.be.deep.equal(cryptoPunk1OwnerAddress);
      // check that second user NFTs are deposited into SwapKiwi
      expect(await otherAppUserNFT.ownerOf(95)).to.be.deep.equal(swapKiwi.address);

      const cancelTx = await cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("rejectSwap", [swapIdFromLogs]),
      });
      const cancelTxReceipt = await cancelTx.wait(1);
      const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapRejected");

      // check if all values are emitted in event
      expect(cancelTxlogs.eventName).to.be.deep.equal("SwapRejected");
      expect(cancelTxlogs.args.rejectedBy).to.be.deep.equal(cryptoPunk1OwnerAddress);
      // check if NFTs are returned to their initial owners
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );
      expect(await otherAppUserNFT.ownerOf(95)).to.be.deep.equal(otherAppUserAddress);
    });

    it("Should fail to swap CryptoPunks if CryptoPunk is not deposited into SwapKiwi before proposing swap", async function () {
      // check that cryptoPunks1Signer is CryptoPunk with id=1 owner
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );

      await expect(cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("proposeSwap", [
          otherAppUserAddress, [cryptoPunks.address], [1]
        ]),
        value: VALID_APP_FEE
      })).to.be.rejectedWith(
        "VM Exception while processing transaction: revert SwapKiwi: CryptoPunk not deposited into SwapKiwi");
    });

    it("Should successfully swap CryptoPunks", async function () {
      // check that cryptoPunks1Signer is CryptoPunk with id=1 owner
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(
        cryptoPunk1OwnerAddress
      );

      // deposit CryptoPunk NFT into SwapKiwi
      await cryptoPunks1Signer.sendTransaction({
        to: cryptoPunks.address,
        data: cryptoPunks.interface.encodeFunctionData("transferPunk", [swapKiwi.address, 1]),
      });
      // check that first user NFTs are deposited into SwapKiwi
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(swapKiwi.address);
      const tx = await cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("proposeSwap", [
          otherAppUserAddress, [cryptoPunks.address], [1]
        ]),
        value: VALID_APP_FEE
      });
      const txReceipt = await tx.wait(1);
      const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
      const swapIdFromLogs = Number(logs.args.swapId.toString());

      // first user NFT minting and swap deposit into SwapKiwi
      await otherAppUserNFT.mint(otherAppUserAddress, 101);
      await otherAppUserNFT.approve(swapKiwi.address, 101);
      const initiateSwapTx = await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [101], {
        value: VALID_APP_FEE
      });
      const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
      const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
      // check if all values are emitted in "SwapInitiated" event
      expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
      expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
      expect(initiateSwapLogs.args.to).to.be.deep.equal(cryptoPunk1OwnerAddress);
      // check that second user NFTs are deposited into SwapKiwi
      expect(await otherAppUserNFT.ownerOf(101)).to.be.deep.equal(swapKiwi.address);

      const acceptSwapTx = await cryptoPunks1Signer.sendTransaction({
        to: swapKiwi.address,
        data: swapKiwi.interface.encodeFunctionData("acceptSwap", [swapIdFromLogs])
      });
      const acceptSwapTxReceipt = await acceptSwapTx.wait(1);
      const acceptSwapLogs = await getEventWithArgsFromLogs(acceptSwapTxReceipt, "SwapExecuted");
      // check if all values are emitted in "SwapExecuted" event
      expect(acceptSwapLogs.eventName).to.be.deep.equal("SwapExecuted");
      expect(acceptSwapLogs.args.from).to.be.deep.equal(cryptoPunk1OwnerAddress);
      expect(acceptSwapLogs.args.to).to.be.deep.equal(otherAppUserAddress);
      // check that NFTs are transferred from SwapKiwi to participants
      expect(await cryptoPunks.punkIndexToAddress(1)).to.be.deep.equal(otherAppUserAddress);
      expect(await otherAppUserNFT.ownerOf(101)).to.be.deep.equal(cryptoPunk1OwnerAddress);
    });
  });
});
