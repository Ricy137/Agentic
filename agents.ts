import { Wallet, WalletAddress } from '@coinbase/coinbase-sdk';
import { AgentKit, CdpWalletProvider, EvmWalletProvider, customActionProvider, cdpApiActionProvider, cdpWalletActionProvider } from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { createPublicClient, parseUnits, http, formatUnits, } from 'viem';
import { baseSepolia } from 'viem/chains';
import * as dotenv from "dotenv";
import * as fs from "fs";
import { AAVE_POOL_ABI, USDC_ADDRESS, AAVE_POOL_ADDRESS, ERC20_ABI } from './constants';
import aaveAbi from './aave_v3_abi.json';
import usdcAbi from './usdc_abi.json';

dotenv.config();

const WALLET_DATA_FILE = "wallet_data.txt";
const publicClient = createPublicClient({
   chain: baseSepolia,
   transport: http()
});

async function getUserAccountData(address: string) {
   try {
      const [data, usdcBalance] = await Promise.all([
         publicClient.readContract({
            address: AAVE_POOL_ADDRESS,
            abi: AAVE_POOL_ABI,
            functionName: 'getUserAccountData',
            args: [address as `0x${string}`]
         }),
         publicClient.readContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`]
         })
      ]);
      return {
         totalCollateralBase: data[0],
         totalDebtBase: data[1],
         availableBorrowsBase: data[2],
         currentLiquidationThreshold: data[3],
         ltv: data[4],
         healthFactor: data[5],
         usdcBalance: usdcBalance,
      };
   } catch (error) {
      console.error('Error calling getUserAccountData:', error);
      throw error;
   }
}

export async function initializeAgent() {
   try {
      // Initialize LLM
      const llm = new ChatOpenAI({
         model: "gpt-4o-mini",
      });
      let walletDataStr: string | null = null;
      let wallet: Wallet | null = null;
      let address: WalletAddress | null = null;
      if (fs.existsSync(WALLET_DATA_FILE)) {
         try {
            walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
         } catch (error) {
            console.error("Error reading wallet data:", error);
            throw error;
         }
      }
      const config = {
         apiKeyName: process.env.CDP_API_KEY_NAME,
         apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
         cdpWalletData: walletDataStr || undefined,
         networkId: "base-sepolia",
      };

      const walletProvider = await CdpWalletProvider.configureWithWallet(config);
      const walletData = await JSON.parse(walletDataStr!);
      wallet = await Wallet.import({
         walletId: walletData.walletId,
         seed: walletData.seed,
         networkId: "base-sepolia",
      });
      if (!wallet) {
         throw new Error('Wallet not found');
      }
      address = await wallet.getDefaultAddress();

      const checkAaveStatics = customActionProvider<CdpWalletProvider>({
         name: "check_account_data",
         description: `Retrieves an overview of a user's account with AAVE and USDC details, including wallet balance, total supplied USDC, total borrowed USDC e.t. 
         Health Factor indicates the stability of a borrow position, with a health factor below 1 signaling the risk of liquidation. The liquidation threshold, set by Aave Governance for each collateral asset, determines the maximum percentage of value that can be borrowed against it. For example, if you supply $10,000 in ETH with an 80% liquidation threshold and borrow $6,000 in GHO, your health factor would be 1.333.
         LTV(load to value) represents the maximum amount you can borrow against the collateral(deposited), while Liquidation threshold is the limit at which a load becomes undercollateralized.
         `,
         schema: z.object({}),
         invoke: async (walletProvider, args: any) => {
            const addr = walletProvider.getAddress();
            const data = await getUserAccountData(addr);
            // This would be passed for AI to further presentation
            return `Your account data: \n Total Deposited: ${formatUnits(data.totalCollateralBase, 8)} USDC \n Total Debt: ${formatUnits(data.totalDebtBase, 8)} USDC \n Available Borrows: ${formatUnits(data.availableBorrowsBase, 8)} USDC \n Current Liquidation Threshold: ${formatUnits(data.currentLiquidationThreshold, 2).toString()}% \n LTV: ${formatUnits(data.ltv, 2)} % \n Health Factor: ${formatUnits(data.healthFactor, 18)} \n USDC Balance: ${formatUnits(data.usdcBalance, 6)} User Address: ${addr}`;
         },
      });

      const supplyUSDC = customActionProvider<CdpWalletProvider>({
         name: "supply_usdc",
         description: "Supplies/deposit/collateralize USDC to the AAVE pool on baseSepolia testnet.This action. This would return a transaction hash if successful and please provide specific explorer url as: https://sepolia.basescan.org/tx/Here_is_the_transaction_hash. format. The action would reduce the risk of liquidation",
         schema: z.object({ amount: z.string() }),
         invoke: async (walletProvider, args: { amount: string }) => {
            const amount = args.amount;
            const amountToSupply = parseUnits(amount, 6);
            const contractArgs = {
               spender: AAVE_POOL_ADDRESS,
               value: amountToSupply.toString(),
            }
            try {
               //TODO: 
               const approveContract = await wallet!.invokeContract({
                  contractAddress: USDC_ADDRESS,
                  method: "approve",
                  args: contractArgs,
                  abi: usdcAbi,
               });
               const approveTx = await approveContract.wait();
               if (!approveTx) {
                  throw new Error('Failed to approve USDC spend');
               }
               console.log("Approved USDC spend");
               const supplyContract = await wallet.invokeContract({
                  contractAddress: AAVE_POOL_ADDRESS,
                  method: "supply",
                  args: {
                     asset: USDC_ADDRESS,
                     amount: amountToSupply.toString(),
                     onBehalfOf: address.getId(),
                     referralCode: "0"
                  },
                  abi: aaveAbi,
               });

               const supplyTx = await supplyContract.wait();
               if (!supplyTx) {
                  throw new Error('Failed to supply USDC to Aave');
               }
               return `USDC supplied to Aave: ${supplyTx.getTransactionHash()}`;
            } catch (err) {
               console.log('Soory, error supplying USDC to Aave:', err);
               return `Soory, error supplying USDC to Aave: ${err}`;
            }
         },
      });

      const borrowUSDC = customActionProvider<CdpWalletProvider>({
         name: "borrow_usdc",
         description: "Borrows USDC from the AAVE pool on baseSepolia testnet. This action would return a transaction hash if successful and the user's position in AAVE maybe dangerous. So better to get a new overview of the user's aave overview after the action executed to check the user's position and provide financial advice according to updated overview.",
         schema: z.object({ amount: z.string() }),
         invoke: async (walletProvider: EvmWalletProvider, args: { amount: string }) => {
            try {
               const amount = args.amount;
               const amountToBorrow = parseUnits(amount, 6);
               const borrowContract = await wallet.invokeContract({
                  contractAddress: AAVE_POOL_ADDRESS,
                  method: "borrow",
                  args: {
                     asset: USDC_ADDRESS,
                     amount: amountToBorrow.toString(),
                     interestRateMode: "2",
                     referralCode: "0",
                     onBehalfOf: address.getId()
                  },
                  abi: aaveAbi,
               });
               const borrowTx = await borrowContract.wait();
               if (!borrowTx) {
                  return 'Failed to supply USDC to Aave';
               }
               return `USDC borrowed from Aave: ${borrowTx.getTransactionHash()}`;
            } catch (err) {
               console.log('Sorry, error borrowing USDC from Aave:', err);
               return `Sorry, error borrowing USDC from Aave: ${err}`;
            }
         }
      })

      const repayUSDC = customActionProvider<CdpWalletProvider>({
         name: "repay_usdc",
         description: "Repay USDC to the AAVE pool on baseSepolia testnet. This would return a transaction hash if successful and please provide specific explorer url as: https://sepolia.basescan.org/tx/Here_is_the_transaction_hash format. This action would reduce the risk of user's position ",
         schema: z.object({ amount: z.string() }),
         invoke: async (args: { amount: string }) => {
            const amountToRepay = parseUnits(args.amount, 6);
            try {
               const approveContract = await wallet.invokeContract({
                  contractAddress: USDC_ADDRESS,
                  method: "approve",
                  args: {
                     spender: AAVE_POOL_ADDRESS,
                     value: amountToRepay.toString()
                  },
                  abi: usdcAbi,
               });
               const approveTx = await approveContract.wait();
               if (!approveTx) {
                  return 'Failed to approve USDC spend';
               }
               const repayContract = await wallet.invokeContract({
                  contractAddress: AAVE_POOL_ADDRESS,
                  method: "repay",
                  args: {
                     asset: USDC_ADDRESS,
                     amount: amountToRepay.toString(),
                     interestRateMode: "2",
                     onBehalfOf: address.getId()
                  },
                  abi: aaveAbi,
               });
               const repayTx = await repayContract.wait();
               if (!repayTx) {
                  return 'Failed to repay USDC to Aave';
               }
               return `USDC repaid to Aave: ${repayTx.getTransactionHash()}`;
            } catch (err) {
               return `Sorry, error repaying USDC to Aave: ${err}`;
            }
         }
      })

      const withdrawUSDC = customActionProvider<CdpWalletProvider>({
         name: "withdraw_usdc",
         description: "Withdraw USDC from the AAVE pool on baseSepolia testnet. This would return a transaction hash if successful and please provide specific explorer url as: https://sepolia.basescan.org/tx/Here_is_the_transaction_hash format. Since this action would reduce user's collatoral asset, it would increase user's risk of loading position",
         schema: z.object({ amount: z.string() }),
         invoke: async (args: { amount: string }) => {
            try {
               const amountToWithdraw = parseUnits(args.amount, 6);
               const userAddr = walletProvider.getAddress();
               //TODO:
               const withdrawContract = await wallet!.invokeContract({
                  contractAddress: AAVE_POOL_ADDRESS,
                  method: "withdraw",
                  args: {
                     asset: USDC_ADDRESS,
                     amount: amountToWithdraw.toString(),
                     to: userAddr
                  },
                  abi: aaveAbi,
               });
               console.log("withdrawContract TX:", withdrawContract.getTransaction());

               const withdrawTx = await withdrawContract.wait();
               if (!withdrawTx) {
                  return 'Failed to withdraw USDC from Aave';
               }
               return `USDC withdrawn from Aave: ${withdrawTx.getTransactionHash()}`;
            } catch (err: any) {
               console.log('Error withdrawing USDC from Aave:', err);
               return `Sorry, error withdrawing USDC from Aave: ${err}`;
            }
         }
      })

      // Initialize AgentKit
      const agentkit = await AgentKit.from({
         walletProvider,
         actionProviders: [
            cdpApiActionProvider({
               apiKeyName: process.env.CDP_API_KEY_NAME,
               apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            }),
            cdpWalletActionProvider({
               apiKeyName: process.env.CDP_API_KEY_NAME,
               apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            }),
            checkAaveStatics,
            supplyUSDC,
            borrowUSDC,
            repayUSDC,
            withdrawUSDC,
         ],
      });

      const tools = await getLangChainTools(agentkit);

      // Store buffered conversation history in memory
      const memory = new MemorySaver();
      const agentConfig = { configurable: { thread_id: "CDP AgentKit Chatbot Example!" } };

      // Create React Agent using the LLM and CDP AgentKit tools
      const agent = createReactAgent({
         llm,
         tools,
         checkpointSaver: memory,
         messageModifier: `
        You are a helpful financial agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are empowered to interact onchain using your tools. If you ever need funds, you can request them from the faucet if you are on network ID 'base-sepolia'. Before executing your first action, get the wallet details to see what network you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. 
        If someone asks you to do something you can't do with your currently available tools, you must say so. Be concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.
        The commands are mostly within the scope of AAVE with USDC and one of the few exception is that you can get some faucet ETH on sepolia-base network for gas fees or wrap eth. As a financil advisor, you need to retrieve an overview of user's aave account before and after executing any action. Then provide your analysis of the impact of the action according to the overviews before and after action executed. 
        The health factor is a critical metric within the Aave Protocol that measures the safety of a borrow position. Health Factor = (Total Collateral Value * Weighted Average Liquidation Threshold) / Total Borrow Value. Health Factor indicates the stability of a borrow position, with a health factor below 1 signaling the risk of liquidation.
        However, if you encounter any error, please provide the error message to the user and no need to provide user's account analysis.
        `,
      });
      return { agent, config: agentConfig };
   } catch (error) {
      console.error("Failed to initialize agent:", error);
      throw error;
   }
}