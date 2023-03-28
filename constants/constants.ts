import { toFullDigit } from "../test/helper/number";

export const SELF_SERVE_RRP_BEACON_WHITELISTER = "0x525d10B8Ed4FA6fb757Bb722400aE6Da4cdfb80A"; // BEACON WHITELISTER on Rinkeby https://docs.api3.org/beacon/v0.1/reference/contract-addresses.html

export const DAPI_SERVER = "0xdC91ea613247C0C9438A6F64Cc0E08291198981a"; // DAPI SERVER on Avalanche Testnet https://github.com/api3dao/operations/blob/main/chain/deployments/references.json
// old DAPI 0x795036637AeB61359F1435C66117A371A433C174;

export const QUOTE_ASSET_RESERVE = 10;
export const BASE_ASSET_RESERVE = 10;
export const TRADE_LIMIT_RATIO = 1;
export const FUNDING_PERIOD = 1;
export const PRICE_FEED_KEY = "0x415641582f555344000000000000000000000000000000000000000000000000"; // AVAX/USD

export const FLUNCTUATION_LIMIT_RATIO = 1;
export const TOLL_RATIO = 1;
export const SPREAD_RATIO = 1;
export const INIT_MARGIN_RATIO = 0;
export const MAINTENANCE_MARGIN_RATIO = 0;
export const LIQUIDATION_FEE_RATIO = 0;

// export const IFNX_TOKEN = "0x7bc79Cc7B862CB170F29DcFC3b17dBc796009E90"; // IFNX on Rinkeby
// export const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router02 on Rinkeby

export const IFNX_TOKEN = "0x44e7970caD4f9B70992cbd2CD48223d755BCfE21"; // IFNX on Fuji
export const QUOTE_ASSET = "0x560606bD72766Df2aaD1B0307D4a227929Fab421"; // USDC on Fuji
// export const QUOTE_ASSET = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"; // USDC on Avalanche

export const UNISWAP_V2_ROUTER = "0x16ACD823C7cA3a5205d184758F77A29183ee025B"; // Uniswap V2 Router02 on Fuji

export const IFNX_INFLATION_RATE = toFullDigit(0.01); // 1%
export const IFNX_MINT_DURATION = 7 * 24 * 60 * 60; // 1 week
export const IFNX_DECAY_RATE = 0;

export const IFNX_VESTING_PERIOD = 0;

// ISLA Token
// export const ISLE_TOKEN = "0x7bc79Cc7B862CB170F29DcFC3b17dBc796009E90"; // ISLE on Rinkeby
// export const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router02 on Rinkeby
export const ISLE_TOKEN = ""; // ISLE on Fuji

export const ISLE_INFLATION_RATE = toFullDigit(0.01); // 1%
export const ISLE_MINT_DURATION = 7 * 24 * 60 * 60; // 1 week
export const ISLE_DECAY_RATE = 0;

export const ISLE_VESTING_PERIOD = 0;
