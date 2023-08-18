import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";

import { IFNX_TOKEN, IFNX_VESTING_PERIOD } from "../constants/constants";
import { verify } from "../scripts/verify";

const deployStakingReserve: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { execute, deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  const clearingHouse = await hre.deployments.get("ClearingHouse");
  const supplySchedule = await hre.deployments.get("SupplySchedule");

  console.log(`Deploying StakingReserve...`);

  const deployResult = await deploy("StakingReserve", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [IFNX_TOKEN, supplySchedule.address, clearingHouse.address, IFNX_VESTING_PERIOD],
      },
    },
    args: [],
    log: true,
  });

  console.log(`StakingReserve is deployed at ${deployResult.address}\n`);

  console.log(`Configuring ClearingHouse...`);
  console.log(`>>> Setting fee pool...`);
  await execute("ClearingHouse", { from: deployer, log: true }, "setFeePool", deployResult.address);
  console.log("\n");

  await verify(deployResult.address, [])
};

export default deployStakingReserve;
deployStakingReserve.tags = ["StakingReserve"];
deployStakingReserve.dependencies = ["ClearingHouse", "SupplySchedule"];
