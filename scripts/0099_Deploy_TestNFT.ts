import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";

const deployFunc: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  await deploy("TestERC721", {from: deployer});
  await deploy("TestERC1155", {from: deployer});
  await deploy("SwapParticipant", {from: deployer});
}

// skip deployment if deploying to mainnet
deployFunc.skip = async (hre: HardhatRuntimeEnvironment) => {
  return hre.network.name === 'mainnet'
};

export default deployFunc;
