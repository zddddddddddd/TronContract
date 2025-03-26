require("dotenv").config();
const TronWeb = require("tronweb");
const fs = require("fs");

// 从.env文件中读取私钥
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("请在.env文件中设置PRIVATE_KEY");
    process.exit(1);
}

// 初始化TronWeb
const tronWeb = new TronWeb({
    // fullHost: "https://nile.trongrid.io", // Nile 测试网
    fullHost: "https://api.shasta.trongrid.io", // Shasta测试网
    privateKey: privateKey
});

// 从部署信息文件中读取代理合约地址
let proxyAddress;
try {
    const deploymentInfo = JSON.parse(fs.readFileSync("./deployment-info.json", "utf8"));
    proxyAddress = deploymentInfo.proxy;
    if (!proxyAddress) {
        throw new Error("找不到代理合约地址");
    }
    console.log("当前代理合约地址:", proxyAddress);
} catch (error) {
    console.error("无法读取部署信息:", error.message);
    console.log("请确保已部署合约并生成了deployment-info.json文件");
    process.exit(1);
}

// 创建合约实例
const logicAbi = require("../artifacts/contracts/Logic.sol/Logic.json").abi;
let contract;

// 交互功能
async function interact() {
    const ownerAddress = tronWeb.address.fromPrivateKey(privateKey);
    console.log("当前账户地址:", ownerAddress);

    // 初始化合约实例
    contract = await tronWeb.contract(logicAbi, proxyAddress);

    // 解析命令行参数
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        showHelp();
        return;
    }

    try {
        switch (command) {
            case "info":
                await getTokenInfo();
                break;
            case "balance":
                const balanceAddress = args[1] || ownerAddress;
                await getBalance(balanceAddress);
                break;
            case "transfer":
                const to = args[1];
                const amount = args[2];
                if (!to || !amount) {
                    console.error("缺少参数: transfer <接收地址> <数量>");
                    return;
                }
                await transfer(to, amount);
                break;
            case "issue":
                const issueAmount = args[1];
                if (!issueAmount) {
                    console.error("缺少参数: issue <数量>");
                    return;
                }
                await issue(issueAmount);
                break;
            case "redeem":
                const redeemAmount = args[1];
                if (!redeemAmount) {
                    console.error("缺少参数: redeem <数量>");
                    return;
                }
                await redeem(redeemAmount);
                break;
            case "addBlacklist":
                const blackAddress = args[1];
                if (!blackAddress) {
                    console.error("缺少参数: addBlacklist <地址>");
                    return;
                }
                await addBlacklist(blackAddress);
                break;
            case "removeBlacklist":
                const removeAddress = args[1];
                if (!removeAddress) {
                    console.error("缺少参数: removeBlacklist <地址>");
                    return;
                }
                await removeBlacklist(removeAddress);
                break;
            case "pause":
                await pause();
                break;
            case "unpause":
                await unpause();
                break;
            case "setFees":
                const basisPoints = args[1];
                const maxFee = args[2];
                if (!basisPoints || !maxFee) {
                    console.error("缺少参数: setFees <基点费率> <最大费用>");
                    return;
                }
                await setParams(basisPoints, maxFee);
                break;
            default:
                console.log("未知命令:", command);
                showHelp();
        }
    } catch (error) {
        console.error("执行交互命令时出错:", error.message);
    }
}

// 显示帮助信息
function showHelp() {
    console.log("\n可用命令:");
    console.log("  info                    - 显示代币信息");
    console.log("  balance [地址]           - 查询指定地址余额，默认查询自己");
    console.log("  transfer <地址> <数量>    - 转账");
    console.log("  issue <数量>             - 增发代币（仅限所有者）");
    console.log("  redeem <数量>            - 销毁代币（仅限所有者）");
    console.log("  addBlacklist <地址>      - 将地址添加到黑名单（仅限所有者）");
    console.log("  removeBlacklist <地址>   - 将地址从黑名单中移除（仅限所有者）");
    console.log("  pause                   - 暂停合约（仅限所有者）");
    console.log("  unpause                 - 恢复合约（仅限所有者）");
    console.log("  setFees <基点> <最大费用>  - 设置费用参数（仅限所有者）");
}

// 获取代币信息
async function getTokenInfo() {
    const name = await contract.name().call();
    const symbol = await contract.symbol().call();
    const decimals = await contract.decimals().call();
    const totalSupply = await contract.totalSupply().call();
    const paused = await contract.paused().call();
    const owner = await contract.owner().call();
    const basisPointsRate = await contract.basisPointsRate().call();
    const maximumFee = await contract.maximumFee().call();

    console.log("\n代币信息:");
    console.log("  名称:", name);
    console.log("  符号:", symbol);
    console.log("  小数位:", decimals.toString());
    console.log("  总供应量:", formatAmount(totalSupply));
    console.log("  合约状态:", paused ? "已暂停" : "运行中");
    console.log("  所有者:", owner);
    console.log("  费率基点:", basisPointsRate.toString());
    console.log("  最大费用:", formatAmount(maximumFee));
}

// 获取账户余额
async function getBalance(address) {
    const balance = await contract.balanceOf(address).call();
    console.log(`\n地址 ${address} 的余额:`, formatAmount(balance));
}

// 转账
async function transfer(to, amount) {
    const decimals = await contract.decimals().call();
    const rawAmount = tronWeb.toSun(amount) * Math.pow(10, decimals - 6);

    console.log(`\n正在转账 ${amount} 代币到 ${to}...`);
    const tx = await contract.transfer(to, rawAmount).send({
        feeLimit: 100000000
    });

    console.log("转账成功，交易ID:", tx);
}

// 增发代币
async function issue(amount) {
    const decimals = await contract.decimals().call();
    const rawAmount = tronWeb.toSun(amount) * Math.pow(10, decimals - 6);

    console.log(`\n正在增发 ${amount} 代币...`);
    const tx = await contract.issue(rawAmount).send({
        feeLimit: 100000000
    });

    console.log("增发成功，交易ID:", tx);
}

// 销毁代币
async function redeem(amount) {
    const decimals = await contract.decimals().call();
    const rawAmount = tronWeb.toSun(amount) * Math.pow(10, decimals - 6);

    console.log(`\n正在销毁 ${amount} 代币...`);
    const tx = await contract.redeem(rawAmount).send({
        feeLimit: 100000000
    });

    console.log("销毁成功，交易ID:", tx);
}

// 添加地址到黑名单
async function addBlacklist(address) {
    console.log(`\n正在将 ${address} 添加到黑名单...`);
    const tx = await contract.addBlackList(address).send({
        feeLimit: 100000000
    });

    console.log("添加黑名单成功，交易ID:", tx);
}

// 从黑名单移除地址
async function removeBlacklist(address) {
    console.log(`\n正在将 ${address} 从黑名单移除...`);
    const tx = await contract.removeBlackList(address).send({
        feeLimit: 100000000
    });

    console.log("移除黑名单成功，交易ID:", tx);
}

// 暂停合约
async function pause() {
    console.log("\n正在暂停合约...");
    const tx = await contract.pause().send({
        feeLimit: 100000000
    });

    console.log("合约已暂停，交易ID:", tx);
}

// 恢复合约
async function unpause() {
    console.log("\n正在恢复合约...");
    const tx = await contract.unpause().send({
        feeLimit: 100000000
    });

    console.log("合约已恢复，交易ID:", tx);
}

// 设置费用参数
async function setParams(basisPoints, maxFee) {
    console.log(`\n正在设置费用参数: 基点=${basisPoints}, 最大费用=${maxFee}...`);
    const tx = await contract.setParams(basisPoints, maxFee).send({
        feeLimit: 100000000
    });

    console.log("费用参数已更新，交易ID:", tx);
}

// 格式化金额显示
function formatAmount(amount) {
    // 将原始数值转换为小数点形式，假设18位小数
    const value = amount.toString() / Math.pow(10, 18);
    return value.toString();
}

// 执行交互
interact()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 