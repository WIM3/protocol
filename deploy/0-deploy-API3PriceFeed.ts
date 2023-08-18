import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";

import { DAPI_SERVER } from "../constants/constants";
import { verify } from "../scripts/verify";

const deployAPI3PriceFeed: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  console.log(`Deploying API3PriceFeed with deployer...`, await deployer.toString());

  const deployResult = await deploy("API3PriceFeed", {
    from: deployer,
    args: [DAPI_SERVER],
    log: true,
  });

  console.log(`API3PriceFeed DAPI_SERVER deployer`, DAPI_SERVER);
  console.log(`API3PriceFeed is deployed at ${deployResult.address}\n`);

  await verify(deployResult.address, [DAPI_SERVER])
};

export default deployAPI3PriceFeed;
deployAPI3PriceFeed.tags = ["Api3API3PriceFeed"];
