import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { run } from "hardhat";
import { verify } from "../scripts/verify";

const deployAmmReader: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  console.log(`Deploying AmmReader...`);

  const deployResult = await deploy("AmmReader", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log(`AmmReader is deployed at ${deployResult.address}\n`);

  await verify(deployResult.address, [])
};

export default deployAmmReader;
deployAmmReader.tags = ["AmmReader"];
