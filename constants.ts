import { parseAbi } from 'viem';

export const AAVE_POOL_ADDRESS = '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b';
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const AAVE_POOL_ABI = parseAbi([
   'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
   'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
   'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
   'function getReserveData(address asset) view returns (  address reserve, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)'
]);

export const ERC20_ABI = parseAbi([
   'function balanceOf(address account) view returns (uint256)',
   'function approve(address spender, uint256 amount) external returns (bool)',
]);

//TODO:TEST
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

export const WETH_ABI = [
   {
      inputs: [],
      name: "deposit",
      outputs: [],
      stateMutability: "payable",
      type: "function",
   },
   {
      inputs: [
         {
            name: "account",
            type: "address",
         },
      ],
      name: "balanceOf",
      outputs: [
         {
            type: "uint256",
         },
      ],
      stateMutability: "view",
      type: "function",
   },
] as const;