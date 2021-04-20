import {HardhatUserConfig} from "hardhat/types";
import accounts from "./test/Accounts"
import dotenv from 'dotenv';

import "@nomiclabs/hardhat-ethers"

import "solidity-coverage";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "hardhat-typechain";

dotenv.config()

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.1",
    settings: {
      optimizer: {
        enabled: false
      }
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    deploy: "./scripts",
  },
  networks: {
    hardhat: {
      loggingEnabled: false,
      live: false,
      accounts: accounts
    },
    coverage: {
      url: 'http://127.0.0.1:5458'
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      live: true,
      loggingEnabled: true
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.GOERLI_MNEMONIC}`
      },
      chainId: 5,
      loggingEnabled: true,
      gas: "auto",
      gasPrice: "auto",
      gasMultiplier: 1.5
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: {
        mnemonic: `${process.env.MAINNET_MNEMONIC}`
      }
    }
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: !!(process.env.REPORT_GAS && process.env.REPORT_GAS != "false"),
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5"
  },
  namedAccounts: {
    deployer: {
      default: 0,
      6: 0
    }
  }
};

export default config;
