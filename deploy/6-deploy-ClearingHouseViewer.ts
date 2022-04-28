import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";

const deployClearingHouseViewer: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const clearingHouse = await hre.deployments.get("ClearingHouse");

  const deployResult = await deploy("ClearingHouseViewer", {
    from: deployer,
    args: [clearingHouse.address],
    log: true,
  });

  try {
    await new Promise((r) => setTimeout(r, 30000));
    await run("verify:verify", {
      address: deployResult.address,
      constructorArguments: [clearingHouse.address],
    });
  } catch (error) {
    console.log(error);
  }
};

export default deployClearingHouseViewer;
deployClearingHouseViewer.tags = ["ClearingHouseViewer"];
deployClearingHouseViewer.dependencies = ["ClearingHouse"];
