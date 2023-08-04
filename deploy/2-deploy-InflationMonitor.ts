import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";
import { verify } from "../scripts/verify";

const deployInflationMonitor: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, execute },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  const minter = await hre.deployments.get("Minter");

  console.log(`Deploying InflationMonitor...`);

  const deployResult = await deploy("InflationMonitor", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [minter.address],
      },
    },
    args: [],
    log: true,
  });

  console.log(`InflationMonitor is deployed at ${deployResult.address}\n`);

  console.log(`Configuring Minter...`);
  console.log(`>>> Setting supply schedule...`);
  await execute(
    "Minter",
    { from: deployer, log: true },
    "setInflationMonitor",
    deployResult.address
  );
  console.log("\n");
  await verify(deployResult.address, [])
};

export default deployInflationMonitor;
deployInflationMonitor.tags = ["InflationMonitor"];
deployInflationMonitor.dependencies = ["Minter"];
