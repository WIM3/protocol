import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";

import { IFNX_TOKEN } from "../constants/constants";
import { verify } from "../scripts/verify";

const deployMinter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("test")
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  console.log(`Deploying Minter...`, await deployer.toString());

  const deployResult = await deploy("Minter", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [IFNX_TOKEN],
      },
    },
    args: [],
    log: true,
  });

  console.log(`Minter is deployed at ${deployResult.address}\n`);

  await verify(deployResult.address, [])
};

export default deployMinter;
deployMinter.tags = ["Minter"];
