// @ts-nocheck
import  "@nomiclabs/hardhat-ethers";
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main(){
    // define the network that you want to verify the contracts
    const network = "fuji"

    const jsonsInDir = fs.readdirSync(`./deployments/${network}`).filter(file => path.extname(file) === '.json');
    jsonsInDir.forEach(async (file) => {
        const fileData = fs.readFileSync(path.join(`./deployments/${network}`, file));
        const json = JSON.parse(fileData.toString());
        try {
            await hre.run("verify:verify", {
                address: json.address,
                constructorArguments: json.args,
            });
            console.log("verified contract: ", json.address)
        } catch (error) {
            console.error(`Error occurred while verifying contract ${json.address}: `, error);
        }
    });

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })