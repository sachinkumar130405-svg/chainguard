require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: '../.env' }); // Load from root .env

module.exports = {
  solidity: '0.8.24',
  networks: {
    hardhat: {},
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    sepolia: {
      url: process.env.RPC_URL || process.env.CHAIN_RPC_URL || '',
      accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== 'your_private_key_here' ? [process.env.PRIVATE_KEY] : []
    }
  },
};

