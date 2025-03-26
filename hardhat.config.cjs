require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// 从环境变量中获取私钥
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Hardhat本地网络
    hardhat: {
      chainId: 31337
    },
    // 本地测试网络（可以使用Tron私有节点）
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    // Shasta测试网（使用跨链工具部署）
    shasta: {
      url: "https://api.shasta.trongrid.io/jsonrpc",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    // Nile测试网
    nile: {
      url: "https://api.nileex.io/jsonrpc",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  },
  // 用于Etherscan合约验证的配置
  // 注意：需要使用与TRON兼容的验证工具
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  // 定义自定义任务
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 100000 // TRON交易可能需要较长时间
  }
};
