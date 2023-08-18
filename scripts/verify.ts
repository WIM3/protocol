// @ts-nocheck
import  "@nomiclabs/hardhat-ethers";
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main(){
    const jsonsInDir = fs.readdirSync(`./deployments/${hre.network.name}`).filter(file => path.extname(file) === '.json');
    
    for (let i = 0; i < jsonsInDir.length; i++) {
        const fileData = fs.readFileSync(path.join(`./deployments/${network}`, jsonsInDir[i]));
        const json = JSON.parse(fileData.toString());
        await verify(json.address, json.args)
    }

}

export async function verify(address: string, args: string[]) {
    try {
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: args,
        });
        console.log("verified contract: ", address)
    } catch (error) {
        console.error(`Error occurred while verifying contract ${address}: `, error);
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })