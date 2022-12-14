//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

import "@api3/airnode-protocol-v1/contracts/dapis/DapiReader.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

import "./interface/IPriceFeed.sol";

contract API3PriceFeed is IPriceFeed, DapiReader {
    using PRBMathUD60x18 for uint256;

    uint256 SCALE = 10**12;

    constructor(address _dapiServer) DapiReader(_dapiServer) {}

    /// @dev returns log(price) of an asset
    /// @param _dapiName dapi Name i.e AVAX/USD
    function getPrice(bytes32 _dapiName) external view override returns (uint256) {
        int224 value = IDapiServer(dapiServer).readDataFeedValueWithDapiName(_dapiName);

        uint256 scaledVal;
        unchecked {
            scaledVal = uint256(int256(value)) * SCALE;
        }
        return scaledVal.log2();
    }
}
