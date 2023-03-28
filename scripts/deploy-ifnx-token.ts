import { ethers } from "hardhat";

import { Wallet, utils } from "zksync-web3";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

async function main() {
  // We get the contract to deploy
  const IfnxToken = await ethers.getContractFactory("IfnxToken");

  // Initial Supply 1,000,000,000
  const ifnxToken = await IfnxToken.deploy(ethers.utils.parseEther("1000000000"));

  await ifnxToken.deployed();

  console.log("Isle deployed to:", ifnxToken.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
