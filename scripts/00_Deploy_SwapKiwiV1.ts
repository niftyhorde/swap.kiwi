import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployFunc: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let contractOwnerAddress: string | undefined;

  const initialAppFee = ethers.utils.parseEther(process.env.SWAP_KIWI_FEE ?? "0.0025");

  if (hre.network.name === 'mainnet') {
    contractOwnerAddress = process.env.CONTRACT_OWNER_ADDRESS;

    if (!contractOwnerAddress) {
      throw Error("Missing mainnet deployment owner address");
    }
    await deploy("SwapKiwiV1", {
      from: deployer, args: [
        initialAppFee,
        contractOwnerAddress
      ],
    });
  } else {
    contractOwnerAddress = deployer;
    await deploy("SwapKiwiV1", {
      from: deployer, args: [
        initialAppFee,
        contractOwnerAddress
      ],
    });
  }
}
export default deployFunc;
