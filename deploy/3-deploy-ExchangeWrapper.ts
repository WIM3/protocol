import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";

import { IFNX_TOKEN, UNISWAP_V2_ROUTER } from "../constants/constants";
import { verify } from "../scripts/verify";

const deployExchangeWrapper: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  console.log(`Deploying ExchangeWrapper...`);

  const deployResult = await deploy("ExchangeWrapper", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [UNISWAP_V2_ROUTER, IFNX_TOKEN],
      },
    },
    args: [],
    log: true,
  });

  console.log(`ExchangeWrapper is deployed at ${deployResult.address}\n`);

  await verify(deployResult.address, [])
};

export default deployExchangeWrapper;
deployExchangeWrapper.tags = ["ExchangeWrapper"];
