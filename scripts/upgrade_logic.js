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

// 升级逻辑合约的主函数
async function upgradeLogic() {
    try {
        console.log("开始升级流程...");
        console.log("当前账户地址:", tronWeb.address.fromPrivateKey(privateKey));

        // 1. 部署新的Logic合约
        console.log("正在部署新的Logic合约...");
        const newLogicContract = await deployContract("Logic");
        console.log("新Logic合约已部署，地址:", newLogicContract.address);

        // 2. 更新Proxy指向新的Logic合约
        console.log("正在更新Proxy指向...");
        const proxyAbi = require("../artifacts/contracts/Proxy.sol/Proxy.json").abi;
        const proxyInstance = await tronWeb.contract(proxyAbi, proxyAddress);

        const upgradeTx = await proxyInstance.upgradeTo(newLogicContract.address).send({
            feeLimit: 100000000
        });

        console.log("Proxy已成功指向新的Logic合约，交易ID:", upgradeTx);

        // 3. 验证升级是否成功
        const logicAbi = require("../artifacts/contracts/Logic.sol/Logic.json").abi;
        const proxyAsLogic = await tronWeb.contract(logicAbi, proxyAddress);

        const tokenName = await proxyAsLogic.name().call();
        const tokenSymbol = await proxyAsLogic.symbol().call();
        const tokenDecimals = await proxyAsLogic.decimals().call();
        const totalTokenSupply = await proxyAsLogic.totalSupply().call();

        console.log("\n合约升级已完成！");
        console.log("代币名称:", tokenName);
        console.log("代币符号:", tokenSymbol);
        console.log("小数位数:", tokenDecimals.toString());
        console.log("总供应量:", totalTokenSupply.toString());

        // 4. 更新部署信息
        const deploymentInfo = JSON.parse(fs.readFileSync("./deployment-info.json", "utf8"));
        deploymentInfo.previousLogic = deploymentInfo.logic;
        deploymentInfo.logic = newLogicContract.address;
        deploymentInfo.lastUpgraded = new Date().toISOString();

        fs.writeFileSync(
            "./deployment-info.json",
            JSON.stringify(deploymentInfo, null, 2)
        );
        console.log("部署信息已更新到 deployment-info.json");

    } catch (error) {
        console.error("升级过程中出错:", error);
    }
}

// 部署合约的辅助函数
async function deployContract(contractName) {
    // 读取合约字节码和ABI
    const contractPath = `./artifacts/contracts/${contractName}.sol/${contractName}.json`;
    const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    // 创建部署交易
    const options = {
        abi: contractJson.abi,
        bytecode: contractJson.bytecode,
        feeLimit: 1000000000,
        parameters: [] // 构造函数参数，如果有的话
    };

    const transaction = await tronWeb.transactionBuilder.createSmartContract(options);
    const signedTransaction = await tronWeb.trx.sign(transaction);
    const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);

    // 等待交易确认
    console.log(`${contractName}合约部署交易已提交，交易ID:`, receipt.transaction.txID);
    console.log("等待交易确认...");

    // 等待几秒钟让交易确认
    await new Promise(resolve => setTimeout(resolve, 15000));

    // 获取合约地址
    const txInfo = await tronWeb.trx.getTransactionInfo(receipt.transaction.txID);
    if (!txInfo || !txInfo.contract_address) {
        throw new Error(`无法获取${contractName}合约地址，部署可能失败`);
    }

    return {
        address: tronWeb.address.fromHex(txInfo.contract_address),
        txId: receipt.transaction.txID
    };
}

// 执行升级
upgradeLogic()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 