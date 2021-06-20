import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { BigNumber } from 'ethers';

const deployFunc: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let contractOwnerAddress: string | undefined;

  const initialAppFee = ethers.utils.parseEther(process.env.SWAP_KIWI_FEE ?? "0.0025");

  if (hre.network.name === 'mainnet') {
    const mainnetDeploymentGasPrice = BigNumber.from(process.env.MAINNET_DEPLOYMENT_GAS_PRICE);
    contractOwnerAddress = process.env.CONTRACT_OWNER_ADDRESS;

    if (!mainnetDeploymentGasPrice || !contractOwnerAddress) {
      throw Error("Missing mainnet deployment owner address and/or gas price env");
    }
    await deploy("SwapKiwi", {
      from: deployer, args: [
        initialAppFee,
        contractOwnerAddress
      ],
      gasPrice: mainnetDeploymentGasPrice
    });
  } else {
    contractOwnerAddress = deployer;
    await deploy("SwapKiwi", {
      from: deployer, args: [
        initialAppFee,
        contractOwnerAddress
      ],
    });
  }
}
export default deployFunc;
