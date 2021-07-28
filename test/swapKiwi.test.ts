import { Deployment } from "hardhat-deploy/types";
import { expect, use } from "chai";
import hre, { ethers, deployments } from "hardhat";
import { SwapKiwi } from "../typechain/SwapKiwi";
import { TestNFT } from "../typechain/TestNFT";
import { Contract, Signer } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
import chaiAsPromised from 'chai-as-promised';
import { parseEther } from "ethers/lib/utils";

use(chaiAsPromised);

describe("Escrow", async function () {
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
  const VALID_APP_FEE = ethers.utils.parseEther("0.1");

  before(async () => {
    signers = await ethers.getSigners();
    ({ SwapKiwi, TestNFT } = await deployments.fixture());
    swapKiwi = await ethers.getContractAt(SwapKiwi.abi, SwapKiwi.address, signers[0]) as SwapKiwi;

    appUserNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[2]) as TestNFT;
    otherAppUserNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[3]) as TestNFT;

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
        filter = swapKiwi.filters.SwapProposed(null, null, null, null, null, null);
        break;
      case "SwapInitiated":
        filter = swapKiwi.filters.SwapInitiated(null, null, null, null, null, null);
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
      .to.be.rejectedWith("VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });

  it('Should succesfully deposit NFT into escrow contract and emit "SwapProposed" event', async function () {
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

  it('Should succesfully cancel swap by first user (after swap proposed) and emit "SwapCanceled" event', async function () {
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
    // check that NFT is returned to initial owner
    expect(await appUserNFT.ownerOf(140)).to.be.deep.equal(appUserAddress);
  });

  it('Should succesfully cancel swap by second user (after swap proposed) and emit "SwapCanceled" event', async function () {
    await appUserNFT.mint(appUserAddress, 141);
    await appUserNFT.approve(swapKiwi.address, 141);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [141], {
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
    // check that NFT is returned to initial owner
    expect(await appUserNFT.ownerOf(141)).to.be.deep.equal(appUserAddress);
  });

  it('Should succesfully cancel swap by first user (after swap initiated) and emit "SwapCanceled" event', async function () {
    await appUserNFT.mint(appUserAddress, 120);
    await appUserNFT.approve(swapKiwi.address, 120);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [120], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await otherAppUserNFT.mint(otherAppUserAddress, 130);
    await otherAppUserNFT.mint(otherAppUserAddress, 131);
    await otherAppUserNFT.approve(swapKiwi.address, 130);
    await otherAppUserNFT.approve(swapKiwi.address, 131);
    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserNFT.address, otherAppUserNFT.address],
      [130, 131],
      {
        value: VALID_APP_FEE
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
    // check if all values are emitted in "SwapInitiated" event
    expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
    expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that NFT is returned to initial owners
    expect(await appUserNFT.ownerOf(120)).to.be.deep.equal(appUserAddress);
    expect(await appUserNFT.ownerOf(130)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserNFT.ownerOf(131)).to.be.deep.equal(otherAppUserAddress);
  });

  it('Should succesfully cancel swap by second user (after swap initiated) and emit "SwapCanceled" event', async function () {
    await appUserNFT.mint(appUserAddress, 121);
    await appUserNFT.approve(swapKiwi.address, 121);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [121], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await otherAppUserNFT.mint(otherAppUserAddress, 135);
    await otherAppUserNFT.mint(otherAppUserAddress, 136);
    await otherAppUserNFT.approve(swapKiwi.address, 135);
    await otherAppUserNFT.approve(swapKiwi.address, 136);
    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserNFT.address, otherAppUserNFT.address],
      [135, 136],
      {
        value: VALID_APP_FEE
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    const initiateSwapLogs = await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");
    // check if all values are emitted in "SwapInitiated" event
    expect(initiateSwapLogs.eventName).to.be.deep.equal("SwapInitiated");
    expect(initiateSwapLogs.args.from).to.be.deep.equal(otherAppUserAddress);
    expect(initiateSwapLogs.args.to).to.be.deep.equal(appUserAddress);

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    const cancelTxlogs = await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    // check if all values are emitted in event
    expect(cancelTxlogs.eventName).to.be.deep.equal("SwapCanceled");
    expect(cancelTxlogs.args.canceledBy).to.be.deep.equal(otherAppUserAddress);
    // expect that swap ID from "SwapCanceled" is same as swap ID from "swapProposed" event
    expect(cancelTxlogs.args.swapId.toString()).to.be.deep.equal(String(swapIdFromLogs));
    // check that NFT is returned to initial owners
    expect(await appUserNFT.ownerOf(121)).to.be.deep.equal(appUserAddress);
    expect(await appUserNFT.ownerOf(135)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserNFT.ownerOf(136)).to.be.deep.equal(otherAppUserAddress);
  });

  it('Should succesfully cancel swap with created with ether value', async function () {
    const firstUserBalance = await appUser.signer.getBalance();
    const secondUserBalance = await otherAppUser.signer.getBalance();

    await appUserNFT.mint(appUserAddress, 430);
    await appUserNFT.approve(swapKiwi.address, 430);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [430], {
      value: VALID_APP_FEE.add(parseEther("50"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await otherAppUserNFT.mint(otherAppUserAddress, 431);
    await otherAppUserNFT.approve(swapKiwi.address, 431);
    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserNFT.address],
      [431],
      {
        value: VALID_APP_FEE.add(parseEther("50"))
      }
    );
    const initiateSwapTxReceipt = await initiateSwapTx.wait(1);
    await getEventWithArgsFromLogs(initiateSwapTxReceipt, "SwapInitiated");

    const cancelTx = await otherAppUser.cancelSwap(swapIdFromLogs);
    const cancelTxReceipt = await cancelTx.wait(1);
    await getEventWithArgsFromLogs(cancelTxReceipt, "SwapCanceled");

    expect(await appUserNFT.ownerOf(430)).to.be.deep.equal(appUserAddress);
    expect(await appUserNFT.ownerOf(431)).to.be.deep.equal(otherAppUserAddress);
    expect(firstUserBalance.sub(await appUser.signer.getBalance()).lt(parseEther("1"))).to.be.equal(true);
    expect(secondUserBalance.sub(await otherAppUser.signer.getBalance()).lt(parseEther("1"))).to.be.equal(true);
  });

  it('Should fail to initiate swap if swap canceled', async function () {
    await appUserNFT.mint(appUserAddress, 170);
    await appUserNFT.approve(swapKiwi.address, 170);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [170], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());
    const cancelTx = await appUser.cancelSwap(swapIdFromLogs);
    await cancelTx.wait(1);

    await otherAppUserNFT.mint(otherAppUserAddress, 301);
    await otherAppUserNFT.approve(swapKiwi.address, 301);
    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [301], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      `VM Exception while processing transaction: revert SwapKiwi: caller is not swap participator`
    );
  });

  it('Should fail to initiate swap twice', async function () {
    await appUserNFT.mint(appUserAddress, 189);
    await appUserNFT.approve(swapKiwi.address, 189);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [189], {
      value: VALID_APP_FEE
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());
    await otherAppUserNFT.mint(otherAppUserAddress, 302);
    await otherAppUserNFT.approve(swapKiwi.address, 302);
    await otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [302], {
      value: VALID_APP_FEE
    })


    await otherAppUserNFT.mint(otherAppUserAddress, 303);
    await otherAppUserNFT.approve(swapKiwi.address, 303);
    await expect(otherAppUser.initiateSwap(swapIdFromLogs, [otherAppUserNFT.address], [303], {
      value: VALID_APP_FEE
    })).to.be.rejectedWith(
      "VM Exception while processing transaction: revert SwapKiwi: swap already initiated"
    );
  });

  it('Should fail to cancel swap twice', async function () {
    await appUserNFT.mint(appUserAddress, 200);
    await appUserNFT.approve(swapKiwi.address, 200);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [200], {
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
    expect(await appUserNFT.ownerOf(200)).to.be.deep.equal(appUserAddress);

    await expect(appUser.cancelSwap(swapIdFromLogs)).to.be.rejectedWith(
      "VM Exception while processing transaction: revert SwapKiwi: Can't cancel swap, must be swap participant"
    );
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
    // check if all values are emitted in "SwapInitiated" event
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
    // check that NFTs are transfered from SwapKiwi to participants - same address because both have same signer

    expect(await otherAppUserNFT.ownerOf(85)).to.be.deep.equal(otherAppUserAddress);
    expect(await otherAppUserNFT.ownerOf(86)).to.be.deep.equal(otherAppUserAddress);
    expect(await appUserNFT.ownerOf(87)).to.be.deep.equal(appUserAddress);
    expect(await appUserNFT.ownerOf(88)).to.be.deep.equal(appUserAddress);
  });

  it('Should successfully execute swap with ether', async function () {
    const firstUserBalance = await appUser.signer.getBalance();
    const secondUserBalance = await otherAppUser.signer.getBalance();

    await appUserNFT.mint(appUserAddress, 375);
    await appUserNFT.approve(swapKiwi.address, 375);
    const tx = await appUser.proposeSwap(otherAppUserAddress, [appUserNFT.address], [375], {
      value: VALID_APP_FEE.add(parseEther("100"))
    });
    const txReceipt = await tx.wait(1);
    const logs = await getEventWithArgsFromLogs(txReceipt, "SwapProposed");
    const swapIdFromLogs = Number(logs.args.swapId.toString());

    await otherAppUserNFT.mint(otherAppUserAddress, 376);
    await otherAppUserNFT.approve(swapKiwi.address, 376);
    const initiateSwapTx = await otherAppUser.initiateSwap(
      swapIdFromLogs,
      [otherAppUserNFT.address],
      [376],
      {
        value: VALID_APP_FEE.add(parseEther("50"))
      }
    );
    await initiateSwapTx.wait(1);

    const acceptSwapTx = await appUser.acceptSwap(swapIdFromLogs);
    await acceptSwapTx.wait(1);

    expect(await appUserNFT.ownerOf(375)).to.be.deep.equal(otherAppUserAddress);
    expect(await otherAppUserNFT.ownerOf(376)).to.be.deep.equal(appUserAddress);
    expect(firstUserBalance.sub((await appUser.signer.getBalance()).add(parseEther("50"))).lt(parseEther("1"))).to.be.equal(true);
    expect(secondUserBalance.sub((await otherAppUser.signer.getBalance()).sub(parseEther("50"))).lt(parseEther("1"))).to.be.equal(true);
  });

  it("Should successful withdraw collected fees from SwapKiwi if called by owner", async function () {
    await swapKiwi.withdrawEther(appUserNFT.address, ethers.utils.parseEther("0.1"));

    expect((await ethers.provider.getBalance(appUserNFT.address)).toString())
      .to.be.deep.equal(ethers.utils.parseEther("0.1").toString());
  });

  it("Should fail to withdraw collected fees from SwapKiwi if not owner", async function () {
    await expect(appUser.withdrawEther(appUser.address, ethers.utils.parseEther("1.0")))
      .to.be.rejectedWith(
        "VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });
});
