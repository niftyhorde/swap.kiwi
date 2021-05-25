import { ethers } from 'hardhat';
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";

const deployFunc: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const initialAppFee = ethers.utils.parseEther(process.env.SWAP_KIWI_FEE ?? "0.0025");
  await deploy("SwapKiwi", {from: deployer, args: [initialAppFee]});
}
export default deployFunc;
