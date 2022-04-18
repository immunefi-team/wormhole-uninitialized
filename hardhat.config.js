require("@nomiclabs/hardhat-waffle");

module.exports = {
  defaultNetwork: "hardhat",
    networks: {
    hardhat: {
      hardfork: "london",
      forking: {
        url: process.env.ALCHEMY_API,
        blockNumber: 13818843  // last submitContractUpgrade() call block
      }
    },
  },
  solidity: "0.8.0",
};
