# SWAP.KIWI

Simple. Safe. Reliable. Your NFT swapping platform.

## Smart contract flow for swapping

1. First user starts a swap by calling `proposeSwap` and providing the address of the second user he wants to trade with and arrays of NFT addresses and IDs he wants to trade -> NFTs transferred to `SwapKiwi` contract

2. Second user can now progress the swap by calling `initiateSwap` with arrays of NFT addresses and IDs he wants to trade -> NFTs transferred to `SwapKiwi` contract
OR
cancel it by calling `cancelSwap` -> NFTs transferred back to swap initiator</br>

3. First user can now execute the swap by calling `acceptSwap` -> NFTs transferred from `SwapKiwi` to participants
OR
 reject the swap entirely by calling `rejectSwap` -> NFTs transferred from `SwapKiwi` to their owners

## Contribution

### Requirements

Following software is required to be installed to use this repo:
* [NodeJS](https://nodejs.org/en/) >= v14.0.0

This repo also uses dependencies that are associated with [Hardhat](https://hardhat.org) but not built-in. Third
-party plugins:
* [hardhat-deploy](https://github.com/wighawag/hardhat-deploy)
* [hardhat-gas-reporter](https://github.com/cgewecke/hardhat-gas-reporter)

### Usage

On first use of this repo, run `yarn install` to install all required dependencies.
Then run `yarn run build` to set up the repo.

Run `yarn run help` to see all available commands:
* `build` - Compiles the entire project and generates Typechain typings
* `lint` - Runs solhint on current project
* `clean` - Clears the cache and deletes all artifacts
* `compile` - Compiles the entire project, building all artifacts
* `deploy:local` - Run deploy script on localhost
* `console` - Opens a buidler console
* `coverage` - Generates a code coverage report for tests
* `flatten` - Flattens and prints all contracts and their dependencies
* `help` - Prints available commands
* `node` - Starts a JSON-RPC server on top of Buidler EVM
* `script` - Runs a user-defined script after compiling the project
* `test:localhost` - Runs mocha tests
* `test:ci`  - Runs gas check and solidity coverage
* `test:gas` - Runs gas check
* `test:coverage` - Runs solidity coverage
* `typechain` - Generate Typechain typings for compiled contracts

### Deployment

Please check `.env.sample` and populate the required variables in the `.env` file.

- `CONTRACT_OWNER_ADDRESS`
  - address of the contract owner on mainnet (for other networks contract owner is `deployer`)
  - on deployment, ownership is automatically transferred from deployer to this address
