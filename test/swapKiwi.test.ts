import {Deployment} from "hardhat-deploy/types";
import {expect, use} from "chai";
import {ethers, deployments} from "hardhat";
import {SwapKiwi} from "../typechain/SwapKiwi";
import {TestNFT} from "../typechain/TestNFT";
import {Signer} from "ethers";
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe("Escrow", function () {
  let SwapKiwi: Deployment;
  let swapKiwi: SwapKiwi;
  let TestNFT: Deployment;
  let testNFT: TestNFT;
  let signers: Signer[];

  before(async () => {
    signers = await ethers.getSigners();
    ({SwapKiwi, TestNFT} = await deployments.fixture());
    swapKiwi = await ethers.getContractAt(SwapKiwi.abi, SwapKiwi.address, signers[0]) as SwapKiwi;
    testNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[1]) as TestNFT;

  });

  it("Should fail to set app fee if caller is not owner", async function () {
    const nonOwnerContract = new ethers.Contract(SwapKiwi.address, SwapKiwi.abi, signers[6]) as SwapKiwi;

    await expect(nonOwnerContract.setAppFee(1000))
    .to.be.rejectedWith("VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });

  it("Should successfuly set app fee if caller is the owner", async function () {
    await swapKiwi.setAppFee(50000);
    expect((await swapKiwi.fee()).toString()).to.be.deep.equal("50000");
  });

});
