#!/usr/bin/env node

const { execSync } = require("child_process");

try {
    console.log("编译智能合约...");
    execSync("npx hardhat compile", { stdio: "inherit" });

    console.log("\n运行代理和逻辑合约测试...");
    execSync("npx hardhat test test/proxy-logic.test.cjs", { stdio: "inherit" });

    console.log("\n测试成功完成！");
} catch (error) {
    console.error("\n测试过程中发生错误:", error.message);
    process.exit(1);
} 