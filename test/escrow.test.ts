import {Deployment} from "hardhat-deploy/types";
import {expect, use} from "chai";
import {ethers, deployments} from "hardhat";
import {Escrow} from "../typechain/Escrow";
import {TestNFT} from "../typechain/TestNFT";
import { BigNumber, Contract, Signer, Wallet } from "ethers";
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe("Escrow", function () {
  let Escrow: Deployment;
  let escrow: Escrow;
  let TestNFT: Deployment;
  let testNFT: TestNFT;
  let signers: Signer[];
  let appUser: Contract;

  before(async () => {
    signers = await ethers.getSigners();
    ({Escrow, TestNFT} = await deployments.fixture());
    escrow = await ethers.getContractAt(Escrow.abi, Escrow.address, signers[0]) as Escrow;
    testNFT = await ethers.getContractAt(TestNFT.abi, TestNFT.address, signers[1]) as TestNFT;

    appUser = new ethers.Contract(TestNFT.address, Escrow.abi, signers[5]) as Escrow;
  });


  it("Should fail to set app fee if caller is not owner", async function () {
    const nonOwnerContract = new ethers.Contract(Escrow.address, Escrow.abi, signers[6]) as Escrow;

    await expect(nonOwnerContract.setAppFee(1000))
    .to.be.rejectedWith("VM Exception while processing transaction: revert Ownable: caller is not the owner");
  });

  it("Should successfuly set app fee if caller is the owner", async function () {
    const nonOwnerContract = new ethers.Contract(Escrow.address, Escrow.abi, signers[6]) as Escrow;
    await escrow.setAppFee(50000);
    expect((await escrow.fee()).toString()).to.be.deep.equal("50000");
  });
});
