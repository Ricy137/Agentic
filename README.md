## What is it

This is a DeFi Agent which enables you to interact with AAVE using natural language and delivers easy-to-understand analytics after your operations. Instead of navigating complex interfaces or deciphering obscure data, you can now manage your DeFi activities effortlessly and make informed decisions with clarity.

Key functionalities include managing AAVE transactions such as deposits, borrowings, repayments, and withdraws as well as providing detailed analysis of user account positions before and after each action. Additionally, the agent offers utility features like fetching ETH from faucets when balances are insufficient, ensuring uninterrupted operations and instead of return hard to read error message directly, it would analysis error response and provide human readable error information.

By combining intuitive language processing with actionable insights and automatical assistance from AI, the DeFi Agent makes decentralized finance accessible, efficient, and user-friendly.

## How's it made?

The DeFi Agent combines OpenAI GPT-4o-mini, AgentKit, AAVE and CDP to enable natural language interaction, autonomous onchain DeFi operations and financial analysis assistance. The implementation focuses on:

### Customized AAVE Actions:

-   Developped customized AAVE actions including deposit, withdraw, borrow, repay and get account data functionalities and descriptions with `customActionProvider` for agent to execute and provide tunned responses after action executed.
-   Leverage CDP SDK for each action to interact with AAVE protocol.

### Create React Agent with AgentKit:

-   Integrated OpenAI GPT-4o-mini, customized actions with AgentKit to create a react agent.
-   Configure the agent to automatically retrieves user account overviews before and after each action, delivering clear financial analysis and handling errors gracefully.

The agent was configured to act as a financial assistant, prioritizing concise and helpful responses. It ensures users are informed about their AAVE account status and the impact of their actions, while handling errors gracefully and autonomously resolving issues like insufficient gas fees.
