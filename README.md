# This project demonstrates a PoC for the Wormhole uninitialized implementation contract vulnerability

Wormhome last upgraded their implementation contract `submitContractUpgrade()` at tx hash:  https://etherscan.io/tx/0xd45111d7c22a4ba4a1cd110c8224859000fcb0cd5cefd02bd40434ac42a07be6 at blockNumber: 13818843

```shell
export ALCHEMY_API=https://eth-mainnet.alchemyapi.io/v2/[API_KEY]
npm i
npx hardhat run poc.js
```

![terminal](https://user-images.githubusercontent.com/13177578/163887843-3cdffc81-4f9b-4ccb-830c-c3b8ce73ba20.png)

Wormhole initialized the implementation `initialize()` at tx hash: https://etherscan.io/tx/0x9acb2b580aba4f5be75366255800df5f62ede576619cb5ce638cedc61273a50f at blockNumber: 14269474

It was recorded that $1.8 billion worth of assets residing in the contract at the time of submission.

 Hacker could have held the entire protocol ransom with the threat that the Ethereum Wormhole bridge would be bricked, and all the funds residing in that contract lost forever.
