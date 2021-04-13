# Buidler-Starter

## Requirements

Following software is required to be installed to use this repo:
* [NodeJS](https://nodejs.org/en/) >= v12.0.0

This repo also uses dependecies that are associated with `buidler` but not built-in:
* [buidler-deploy](https://github.com/wighawag/buidler-deploy)
* [buidler-gas-reporter](https://github.com/cgewecke/buidler-gas-reporter/tree/master)
* [buidler-typechain](https://github.com/rhlsthrm/buidler-typechain)

## Usage

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