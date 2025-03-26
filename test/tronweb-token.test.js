// TronWeb测试需要使用TronBox或直接通过私有节点进行测试
// 这个文件演示如何使用TronWeb直接与节点交互进行合约测试

const TronWeb = require("tronweb");
const assert = require("assert");
const fs = require("fs");

// 测试配置
const privateKey = process.env.PRIVATE_KEY || "da146374a75310b9666e834ee4ad0866d6f4035967bfc76217c5a495fff9f0d0";
const testPrivateKey1 = "4c923b360210e5e2690672e9658378a46740b954db7017d4aac4c4af213e65d4";
const testPrivateKey2 = "ad7a8f25c389a1e8c30eafd3e605c2d85e6b9e36dc7a9e28bc5c6aad4a81f750";

// 可能的网络配置
const networks = {
    development: {
        // 本地私有节点
        fullHost: "http://127.0.0.1:9090",
    },
    shasta: {
        // Shasta测试网
        fullHost: "https://api.shasta.trongrid.io"
    },
    nile: {
        // Nile测试网
        fullHost: "https://api.nileex.io"
    }
};

// 选择测试网络
const network = process.env.TRON_NETWORK || "development";
console.log(`使用网络: ${network}`);

// 初始化TronWeb实例
const tronWeb = new TronWeb({
    fullHost: networks[network].fullHost,
    privateKey: privateKey
});

// 测试账户
const accounts = {
    owner: {
        privateKey: privateKey,
        address: tronWeb.address.fromPrivateKey(privateKey)
    },
    user1: {
        privateKey: testPrivateKey1,
        address: tronWeb.address.fromPrivateKey(testPrivateKey1)
    },
    user2: {
        privateKey: testPrivateKey2,
        address: tronWeb.address.fromPrivateKey(testPrivateKey2)
    }
};

// 测试合约地址，稍后部署时会设置
let proxyAddress = "";
let logicAddress = "";

// 测试辅助函数
async function deployContract(contractName, options = {}) {
    // 读取合约ABI和字节码
    const contractPath = `./artifacts/contracts/${contractName}.sol/${contractName}.json`;
    const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    // 创建部署交易
    const deployOptions = {
        abi: contractJson.abi,
        bytecode: contractJson.bytecode,
        feeLimit: 1000000000,
        ...options
    };

    // 部署合约
    const transaction = await tronWeb.transactionBuilder.createSmartContract(deployOptions);
    const signedTransaction = await tronWeb.trx.sign(transaction);
    const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);

    // 等待交易确认
    console.log(`部署 ${contractName} 交易发送，交易ID:`, receipt.transaction.txID);

    // 等待几秒钟确认交易
    await new Promise(resolve => setTimeout(resolve, 15000));

    // 获取合约地址
    const txInfo = await tronWeb.trx.getTransactionInfo(receipt.transaction.txID);
    if (!txInfo || !txInfo.contract_address) {
        throw new Error(`无法获取${contractName}合约地址，部署可能失败`);
    }

    return {
        address: tronWeb.address.fromHex(txInfo.contract_address),
        abi: contractJson.abi
    };
}

// 切换TronWeb账户
function switchAccount(privateKey) {
    tronWeb.setPrivateKey(privateKey);
    return tronWeb.address.fromPrivateKey(privateKey);
}

// 测试套件
describe("TronWeb代币合约测试", function () {
    // 设置超时时间（TronWeb测试需要较长时间）
    this.timeout(60000);

    let contract;
    const initialSupply = "1000000000000000"; // 10亿代币，考虑到18位小数
    const tokenName = "TronTestToken";
    const tokenSymbol = "TTT";
    const tokenDecimals = 18;

    before(async function () {
        // 本地节点测试时可能需要给测试账户转账
        try {
            if (network === "development") {
                console.log("向测试账户转账...");
                const fromAddress = accounts.owner.address;

                // 转账给user1
                const trx1 = await tronWeb.trx.sendTransaction(
                    accounts.user1.address,
                    1000000000 // 1000 TRX
                );
                console.log("转账给user1:", trx1.transaction.txID);

                // 转账给user2
                const trx2 = await tronWeb.trx.sendTransaction(
                    accounts.user2.address,
                    1000000000 // 1000 TRX
                );
                console.log("转账给user2:", trx2.transaction.txID);

                // 等待转账确认
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.warn("预先转账失败，继续测试:", error.message);
        }

        console.log("部署合约...");
        console.log("当前账户:", accounts.owner.address);

        // 1. 部署Proxy合约
        const proxy = await deployContract("Proxy");
        proxyAddress = proxy.address;
        console.log("Proxy合约地址:", proxyAddress);

        // 2. 部署Logic合约
        const logic = await deployContract("Logic");
        logicAddress = logic.address;
        console.log("Logic合约地址:", logicAddress);

        // 3. 设置Proxy指向Logic
        const proxyContract = await tronWeb.contract(proxy.abi, proxyAddress);
        await proxyContract.upgradeTo(logicAddress).send({
            feeLimit: 100000000
        });
        console.log("Proxy已更新为指向Logic");

        // 4. 使用Logic的ABI通过Proxy初始化
        contract = await tronWeb.contract(logic.abi, proxyAddress);
        const initTx = await contract.initialize(
            initialSupply,
            tokenName,
            tokenSymbol,
            tokenDecimals
        ).send({
            feeLimit: 100000000
        });
        console.log("初始化完成，交易ID:", initTx);
    });

    // 基本信息测试
    describe("基本信息", function () {
        it("应该正确设置代币名称", async function () {
            const name = await contract.name().call();
            assert.strictEqual(name, tokenName);
        });

        it("应该正确设置代币符号", async function () {
            const symbol = await contract.symbol().call();
            assert.strictEqual(symbol, tokenSymbol);
        });

        it("应该正确设置小数位数", async function () {
            const decimals = await contract.decimals().call();
            assert.strictEqual(decimals.toString(), tokenDecimals.toString());
        });

        it("应该正确设置总供应量", async function () {
            const totalSupply = await contract.totalSupply().call();
            assert.strictEqual(totalSupply.toString(), initialSupply);
        });

        it("应该将所有代币分配给部署者", async function () {
            const ownerBalance = await contract.balanceOf(accounts.owner.address).call();
            assert.strictEqual(ownerBalance.toString(), initialSupply);
        });
    });

    // 转账功能测试
    describe("转账功能", function () {
        const transferAmount = "1000000000"; // 1000代币，考虑小数位

        it("应该能够转账代币", async function () {
            // 初始余额
            const initialOwnerBalance = await contract.balanceOf(accounts.owner.address).call();

            // 执行转账
            const tx = await contract.transfer(accounts.user1.address, transferAmount).send({
                feeLimit: 100000000
            });
            console.log("转账交易ID:", tx);

            // 检查余额变化
            const user1Balance = await contract.balanceOf(accounts.user1.address).call();
            assert.strictEqual(user1Balance.toString(), transferAmount);

            // 检查发送者余额
            const ownerBalance = await contract.balanceOf(accounts.owner.address).call();
            assert.strictEqual(
                ownerBalance.toString(),
                (BigInt(initialOwnerBalance.toString()) - BigInt(transferAmount)).toString()
            );
        });

        it("非持有者不应该能够转账超过余额的代币", async function () {
            // 切换到user1账户
            switchAccount(accounts.user1.privateKey);

            try {
                // 尝试转账超过余额的代币
                const tooMuchAmount = "10000000000000"; // 比user1余额多
                await contract.transfer(accounts.user2.address, tooMuchAmount).send({
                    feeLimit: 100000000
                });
                assert.fail("交易应该失败");
            } catch (error) {
                // 期望失败
                assert(true, "交易正确地失败了");
            }

            // 切回owner账户
            switchAccount(accounts.owner.privateKey);
        });
    });

    // 暂停功能测试
    describe("暂停功能", function () {
        it("所有者应该能够暂停合约", async function () {
            // 暂停合约
            const pauseTx = await contract.pause().send({
                feeLimit: 100000000
            });
            console.log("暂停交易ID:", pauseTx);

            // 检查暂停状态
            const isPaused = await contract.paused().call();
            assert.strictEqual(isPaused, true);
        });

        it("合约暂停时不应该允许转账", async function () {
            try {
                // 尝试在暂停状态下转账
                await contract.transfer(accounts.user2.address, "1000000").send({
                    feeLimit: 100000000
                });
                assert.fail("交易应该失败");
            } catch (error) {
                // 期望失败
                assert(true, "交易正确地失败了");
            }
        });

        it("所有者应该能够恢复合约", async function () {
            // 恢复合约
            const unpauseTx = await contract.unpause().send({
                feeLimit: 100000000
            });
            console.log("恢复交易ID:", unpauseTx);

            // 检查状态
            const isPaused = await contract.paused().call();
            assert.strictEqual(isPaused, false);

            // 恢复后应该能够转账
            const tx = await contract.transfer(accounts.user2.address, "1000000").send({
                feeLimit: 100000000
            });
            console.log("恢复后转账交易ID:", tx);

            // 检查余额
            const user2Balance = await contract.balanceOf(accounts.user2.address).call();
            assert(BigInt(user2Balance.toString()) >= BigInt("1000000"));
        });
    });

    // 黑名单功能测试
    describe("黑名单功能", function () {
        it("所有者应该能够将地址添加到黑名单", async function () {
            // 添加user1到黑名单
            const blacklistTx = await contract.addBlackList(accounts.user1.address).send({
                feeLimit: 100000000
            });
            console.log("添加黑名单交易ID:", blacklistTx);

            // 检查黑名单状态
            const isBlacklisted = await contract.isBlackListed(accounts.user1.address).call();
            assert.strictEqual(isBlacklisted, true);
        });

        it("黑名单用户不应该能够转账", async function () {
            // 切换到user1账户
            switchAccount(accounts.user1.privateKey);

            try {
                // 尝试从黑名单账户转账
                await contract.transfer(accounts.user2.address, "1000").send({
                    feeLimit: 100000000
                });
                assert.fail("交易应该失败");
            } catch (error) {
                // 期望失败
                assert(true, "交易正确地失败了");
            }

            // 切回owner账户
            switchAccount(accounts.owner.privateKey);
        });

        it("所有者应该能够从黑名单中移除地址", async function () {
            // 从黑名单移除user1
            const removeBlacklistTx = await contract.removeBlackList(accounts.user1.address).send({
                feeLimit: 100000000
            });
            console.log("移除黑名单交易ID:", removeBlacklistTx);

            // 检查黑名单状态
            const isBlacklisted = await contract.isBlackListed(accounts.user1.address).call();
            assert.strictEqual(isBlacklisted, false);

            // 现在user1应该能够转账
            switchAccount(accounts.user1.privateKey);
            const tx = await contract.transfer(accounts.user2.address, "1000").send({
                feeLimit: 100000000
            });
            console.log("黑名单移除后转账交易ID:", tx);

            // 切回owner账户
            switchAccount(accounts.owner.privateKey);
        });
    });

    // 费用参数测试
    describe("费用参数", function () {
        const basisPoints = 10; // 0.1%
        const maxFee = 5;

        it("所有者应该能够设置费用参数", async function () {
            // 设置费用参数
            const feeTx = await contract.setParams(basisPoints, maxFee).send({
                feeLimit: 100000000
            });
            console.log("设置费用参数交易ID:", feeTx);

            // 检查参数
            const bps = await contract.basisPointsRate().call();
            assert.strictEqual(bps.toString(), basisPoints.toString());
        });
    });

    // 合约升级测试
    describe("合约升级", function () {
        it("所有者应该能够升级到新的逻辑合约", async function () {
            // 部署新的Logic合约
            const newLogic = await deployContract("Logic");
            console.log("新Logic合约地址:", newLogic.address);

            // 获取Proxy合约实例
            const proxyAbi = JSON.parse(fs.readFileSync("./artifacts/contracts/Proxy.sol/Proxy.json", "utf8")).abi;
            const proxyContract = await tronWeb.contract(proxyAbi, proxyAddress);

            // 执行升级
            const upgradeTx = await proxyContract.upgradeTo(newLogic.address).send({
                feeLimit: 100000000
            });
            console.log("升级交易ID:", upgradeTx);

            // 检查implementation是否更新
            const impl = await proxyContract.implementation().call();
            assert.strictEqual(
                tronWeb.address.fromHex(impl).toLowerCase(),
                newLogic.address.toLowerCase()
            );

            // 验证功能是否正常
            const newContract = await tronWeb.contract(newLogic.abi, proxyAddress);
            const name = await newContract.name().call();
            assert.strictEqual(name, tokenName);
        });
    });
}); 