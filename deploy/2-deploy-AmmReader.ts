import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { run } from "hardhat";


const deployAmmReader: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, log},
    getNamedAccounts,
  } = hre;
  const { deployer } = await getNamedAccounts();

  if (process.env.WITH_PROXY) return;

  const deployResult = await deploy("AmmReader", {
    from: deployer,
    args: [],
    log: true,
  });

  if (deployResult.newlyDeployed) {
    log(
      `*** AmmReader deployed at ${deployResult.address} using ${deployResult.receipt?.gasUsed} ***`
    );
  }


  try {
    await new Promise(r => setTimeout(r, 30000));
    await run("verify:verify", {
      address: deployResult.address
    });
  } catch (error) {
    console.log(error);
  }
};

export default deployAmmReader;
deployAmmReader.tags = ["AmmReader"];
