require("dotenv").config();
const TronWeb = require("tronweb");
const axios = require('axios');  // 确认axios可用

// 从.env文件中读取私钥
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("请在.env文件中设置PRIVATE_KEY");
    process.exit(1);
}

// 选择网络
const NETWORK = process.env.TRON_NETWORK || 'shasta';
const networks = {
    shasta: {
        fullHost: "https://api.shasta.trongrid.io"
    },
    nile: {
        fullHost: "https://api.nile.trongrid.io"
    },
    development: {
        fullHost: "http://127.0.0.1:9090"
    }
};

// 设置更长的超时时间
if (axios.defaults) {
    axios.defaults.timeout = 60000; // 60秒超时
}

// 初始化TronWeb
const tronWeb = new TronWeb({
    fullHost: networks[NETWORK].fullHost,
    privateKey: privateKey
});

// 部署合约的主函数
async function deploy() {
    try {
        const accountAddress = tronWeb.address.fromPrivateKey(privateKey);
        console.log("开始部署合约...");
        console.log("当前网络:", NETWORK);
        console.log("当前账户地址:", accountAddress);

        try {
            // 检查账户余额
            const accountBalance = await tronWeb.trx.getBalance(accountAddress);
            console.log("账户余额:", accountBalance / 1000000, "TRX");

            // 检查余额是否足够
            if (accountBalance < 1000000000) { // 至少需要1000 TRX
                console.error("账户余额不足，至少需要1000 TRX来部署合约");
                process.exit(1);
            }
        } catch (balanceError) {
            console.warn("无法获取账户余额，继续部署:", balanceError.message);
        }

        // 1. 部署Proxy合约
        console.log("正在部署Proxy合约...");
        const proxyContract = await deployContract("Proxy");
        console.log("Proxy合约已部署，地址:", proxyContract.address);

        // 2. 部署Logic合约
        console.log("正在部署Logic合约...");
        const logicContract = await deployContract("Logic");
        console.log("Logic合约已部署，地址:", logicContract.address);

        // 3. 设置Proxy指向Logic
        console.log("正在设置Proxy指向Logic合约...");
        const proxyInstance = await tronWeb.contract().at(proxyContract.address);
        const upgradeTx = await proxyInstance.upgradeTo(logicContract.address).send({
            feeLimit: 100000000
        });
        console.log("Proxy已成功指向Logic合约，交易ID:", upgradeTx);

        // 4. 通过Proxy初始化Logic
        console.log("正在初始化Logic合约...");
        // 使用ABI创建Logic合约实例，但地址指向Proxy
        const logicAbi = require("../artifacts/contracts/Logic.sol/Logic.json").abi;
        const proxyAsLogic = await tronWeb.contract(logicAbi, proxyContract.address);

        // 初始化代币参数
        const totalSupply = 1000000000000000; // 10亿，考虑到18位小数
        const name = "TronToken";
        const symbol = "TTK";
        const decimals = 18;

        const initTx = await proxyAsLogic.initialize(
            totalSupply,
            name,
            symbol,
            decimals
        ).send({
            feeLimit: 100000000
        });

        console.log("Logic合约已通过Proxy初始化，交易ID:", initTx);

        // 5. 验证部署是否成功
        const tokenName = await proxyAsLogic.name().call();
        const tokenSymbol = await proxyAsLogic.symbol().call();
        const tokenDecimals = await proxyAsLogic.decimals().call();
        const totalTokenSupply = await proxyAsLogic.totalSupply().call();

        console.log("\n合约部署与初始化已完成！");
        console.log("代币名称:", tokenName);
        console.log("代币符号:", tokenSymbol);
        console.log("小数位数:", tokenDecimals.toString());
        console.log("总供应量:", totalTokenSupply.toString());
        console.log("Proxy地址:", proxyContract.address);
        console.log("Logic地址:", logicContract.address);

        // 将部署信息保存到文件
        const fs = require("fs");
        const deploymentInfo = {
            network: NETWORK,
            proxy: proxyContract.address,
            logic: logicContract.address,
            deployer: tronWeb.address.fromPrivateKey(privateKey),
            deploymentTime: new Date().toISOString(),
            tokenInfo: {
                name: tokenName,
                symbol: tokenSymbol,
                decimals: tokenDecimals.toString(),
                totalSupply: totalTokenSupply.toString()
            }
        };

        fs.writeFileSync(
            "./deployment-info.json",
            JSON.stringify(deploymentInfo, null, 2)
        );
        console.log("部署信息已保存到 deployment-info.json");

    } catch (error) {
        console.error("部署过程中出错:", error);
    }
}

// 部署合约的辅助函数
async function deployContract(contractName) {
    // 读取合约字节码和ABI
    const fs = require("fs");
    const contractPath = `./artifacts/contracts/${contractName}.sol/${contractName}.json`;
    const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    // 获取账户地址
    const accountAddress = tronWeb.address.fromPrivateKey(privateKey);

    // 创建部署交易
    const options = {
        abi: contractJson.abi,
        bytecode: contractJson.bytecode,
        feeLimit: 1000000000,
        callValue: 0,  // 明确设置为0
        parameters: [] // 构造函数参数，如果有的话
    };

    // 最多尝试3次
    let attemptCount = 0;
    const maxAttempts = 3;

    while (attemptCount < maxAttempts) {
        attemptCount++;
        console.log(`开始第${attemptCount}次尝试部署${contractName}合约...`);

        try {
            console.log(`准备部署${contractName}合约...`);
            const transaction = await tronWeb.transactionBuilder.createSmartContract(options, accountAddress);
            console.log(`创建${contractName}部署交易成功`);

            const signedTransaction = await tronWeb.trx.sign(transaction);
            console.log(`签名${contractName}部署交易成功`);

            const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);
            console.log(`${contractName}合约部署交易已提交，交易ID:`, receipt.transaction.txID);
            console.log(`等待交易确认中，这可能需要一些时间...`);

            // 增加等待时间并每隔15秒检查一次
            let confirmed = false;
            for (let i = 0; i < 4; i++) {
                console.log(`等待交易确认，已等待${i * 15}秒...`);
                await new Promise(resolve => setTimeout(resolve, 15000));

                try {
                    const txInfo = await tronWeb.trx.getTransactionInfo(receipt.transaction.txID);

                    if (txInfo && Object.keys(txInfo).length > 0) {
                        console.log(`${contractName}交易信息:`, JSON.stringify(txInfo, null, 2));

                        // 检查交易是否失败
                        if (txInfo.receipt && txInfo.receipt.result === 'FAILED') {
                            throw new Error(`${contractName}部署失败: ${txInfo.resMessage || '未知错误'}`);
                        }

                        // 如果有合约地址，交易已确认成功
                        if (txInfo.contract_address) {
                            const contractAddress = tronWeb.address.fromHex(txInfo.contract_address);
                            console.log(`${contractName}合约地址:`, contractAddress);

                            return {
                                address: contractAddress,
                                txId: receipt.transaction.txID
                            };
                        }
                    }
                } catch (infoError) {
                    console.warn(`获取交易信息时出错:`, infoError.message);
                }
            }

            // 如果没有确认，我们尝试再次部署
            console.log(`${contractName}合约部署交易未能在60秒内确认，尝试重新部署...`);

        } catch (error) {
            console.error(`尝试${attemptCount}部署${contractName}合约时出错:`, error.message);

            if (attemptCount >= maxAttempts) {
                throw new Error(`多次尝试部署${contractName}合约失败，请检查网络连接或账户状态`);
            }

            // 等待一段时间后重试
            console.log(`等待30秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

    throw new Error(`部署${contractName}合约失败，已尝试${maxAttempts}次`);
}

// 执行部署
deploy()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 