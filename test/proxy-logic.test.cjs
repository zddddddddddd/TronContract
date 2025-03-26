const { expect } = require("chai");
const { ethers } = require("hardhat");
const { describe, it, beforeEach } = require("mocha");
const TronWeb = require("tronweb");

// 配置TronWeb实例
const tronWeb = new TronWeb({
    fullHost: "http://127.0.0.1:9090", // 本地测试网
    privateKey: "da146374a75310b9666e834ee4ad0866d6f4035967bfc76217c5a495fff9f0d0" // 测试网私钥
});

// 测试辅助函数
async function deployContract(contractName, signer, ...args) {
    const Contract = await ethers.getContractFactory(contractName, signer);
    const contract = await Contract.deploy(...args);
    await contract.waitForDeployment();
    return contract;
}

describe("代理和逻辑合约测试", function () {
    // 测试超时设置
    this.timeout(50000);

    let owner, user1, user2;
    let proxy, logic, newLogic;
    let proxyAsLogic;

    const initialSupply = ethers.parseUnits("1000000", 18);
    const tokenName = "测试代币";
    const tokenSymbol = "TEST";
    const tokenDecimals = 18;

    beforeEach(async function () {
        // 获取测试账户
        [owner, user1, user2] = await ethers.getSigners();

        // 部署新的合约实例
        logic = await deployContract("Logic", owner);
        proxy = await deployContract("Proxy", owner);

        // 设置代理指向逻辑合约
        await proxy.upgradeTo(await logic.getAddress());

        // 创建一个通过代理访问逻辑合约的实例
        proxyAsLogic = await ethers.getContractAt("Logic", await proxy.getAddress());

        // 初始化逻辑合约
        await proxyAsLogic.initialize(
            initialSupply,
            tokenName,
            tokenSymbol,
            tokenDecimals
        );
    });

    describe("基本信息", function () {
        it("应该正确设置代币名称、符号和小数位数", async function () {
            expect(await proxyAsLogic.name()).to.equal(tokenName);
            expect(await proxyAsLogic.symbol()).to.equal(tokenSymbol);
            expect(await proxyAsLogic.decimals()).to.equal(tokenDecimals);
        });

        it("应该正确设置初始总供应量", async function () {
            const totalSupply = await proxyAsLogic.totalSupply();
            expect(totalSupply).to.equal(initialSupply);
        });

        it("应该将所有代币分配给部署者", async function () {
            const ownerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            expect(ownerBalance).to.equal(initialSupply);
        });
    });

    describe("转账功能", function () {
        const transferAmount = ethers.parseUnits("1000", 18);

        it("应该能够转账代币", async function () {
            await proxyAsLogic.transfer(await user1.getAddress(), transferAmount);

            const user1Balance = await proxyAsLogic.balanceOf(await user1.getAddress());
            expect(user1Balance).to.equal(transferAmount);

            const ownerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            expect(ownerBalance).to.equal(initialSupply - transferAmount);
        });

        it("当余额不足时应该无法转账", async function () {
            await expect(
                proxyAsLogic.connect(user1).transfer(await user2.getAddress(), transferAmount)
            ).to.be.revertedWith("Insufficient balance");
        });

        it("当合约暂停时应该无法转账", async function () {
            await proxyAsLogic.pause();

            await expect(
                proxyAsLogic.transfer(await user1.getAddress(), transferAmount)
            ).to.be.revertedWith("Contract is paused");

            await proxyAsLogic.unpause();

            await proxyAsLogic.transfer(await user1.getAddress(), transferAmount);
            expect(await proxyAsLogic.balanceOf(await user1.getAddress())).to.equal(transferAmount);
        });
    });

    describe("授权与委托转账", function () {
        const approveAmount = ethers.parseUnits("5000", 18);
        const transferAmount = ethers.parseUnits("1000", 18);

        beforeEach(async function () {
            await proxyAsLogic.transfer(await user1.getAddress(), approveAmount);
        });

        it("应该能够授权并通过委托转账", async function () {
            await proxyAsLogic.connect(user1).approve(await user2.getAddress(), approveAmount);

            const allowance = await proxyAsLogic.allowance(await user1.getAddress(), await user2.getAddress());
            expect(allowance).to.equal(approveAmount);

            await proxyAsLogic.connect(user2).transferFrom(
                await user1.getAddress(),
                await owner.getAddress(),
                transferAmount
            );

            expect(await proxyAsLogic.balanceOf(await user1.getAddress())).to.equal(approveAmount - transferAmount);

            const newAllowance = await proxyAsLogic.allowance(await user1.getAddress(), await user2.getAddress());
            expect(newAllowance).to.equal(approveAmount - transferAmount);
        });
    });

    describe("增发与销毁", function () {
        const issueAmount = ethers.parseUnits("10000", 18);
        const redeemAmount = ethers.parseUnits("5000", 18);

        it("所有者应该能够增发代币", async function () {
            const initialTotalSupply = await proxyAsLogic.totalSupply();

            await proxyAsLogic.issue(issueAmount);

            const newTotalSupply = await proxyAsLogic.totalSupply();
            expect(newTotalSupply).to.equal(initialTotalSupply + issueAmount);

            const ownerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            expect(ownerBalance).to.equal(initialTotalSupply + issueAmount);
        });

        it("所有者应该能够销毁代币", async function () {
            const initialTotalSupply = await proxyAsLogic.totalSupply();

            await proxyAsLogic.redeem(redeemAmount);

            const newTotalSupply = await proxyAsLogic.totalSupply();
            expect(newTotalSupply).to.equal(initialTotalSupply - redeemAmount);

            const ownerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            expect(ownerBalance).to.equal(initialTotalSupply - redeemAmount);
        });

        it("非所有者不应该能够增发或销毁代币", async function () {
            await expect(
                proxyAsLogic.connect(user1).issue(issueAmount)
            ).to.be.revertedWith("Only owner can call this function");

            await expect(
                proxyAsLogic.connect(user1).redeem(redeemAmount)
            ).to.be.revertedWith("Only owner can call this function");
        });
    });

    describe("黑名单功能", function () {
        const transferAmount = ethers.parseUnits("1000", 18);

        beforeEach(async function () {
            await proxyAsLogic.transfer(await user1.getAddress(), transferAmount * BigInt(2));
        });

        it("所有者应该能够添加和移除黑名单", async function () {
            await proxyAsLogic.addBlackList(await user1.getAddress());
            expect(await proxyAsLogic.isBlackListed(await user1.getAddress())).to.be.true;

            await expect(
                proxyAsLogic.connect(user1).transfer(await user2.getAddress(), transferAmount)
            ).to.be.revertedWith("Sender is blacklisted");

            await proxyAsLogic.removeBlackList(await user1.getAddress());
            expect(await proxyAsLogic.isBlackListed(await user1.getAddress())).to.be.false;

            await proxyAsLogic.connect(user1).transfer(await user2.getAddress(), transferAmount);
            expect(await proxyAsLogic.balanceOf(await user2.getAddress())).to.equal(transferAmount);
        });

        it("所有者应该能够销毁黑名单用户的资金", async function () {
            const initialTotalSupply = await proxyAsLogic.totalSupply();
            const user1Balance = await proxyAsLogic.balanceOf(await user1.getAddress());

            await proxyAsLogic.addBlackList(await user1.getAddress());
            await proxyAsLogic.destroyBlackFunds(await user1.getAddress());

            expect(await proxyAsLogic.balanceOf(await user1.getAddress())).to.equal(0);

            const newTotalSupply = await proxyAsLogic.totalSupply();
            expect(newTotalSupply).to.equal(initialTotalSupply - user1Balance);
        });
    });

    describe("费用参数", function () {
        const totalAmount = ethers.parseUnits("10000", 18);
        const transferAmount = ethers.parseUnits("5000", 18);
        const basisPoints = 10; // 0.1%
        const maxFee = 5; // 5个代币

        beforeEach(async function () {
            await proxyAsLogic.setParams(basisPoints, maxFee);
            await proxyAsLogic.transfer(await user1.getAddress(), totalAmount);
        });

        it("转账时应收取正确的费用", async function () {
            const initialOwnerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            const initialUser2Balance = await proxyAsLogic.balanceOf(await user2.getAddress());

            // 计算预期费用
            const fee = (transferAmount * BigInt(basisPoints)) / BigInt(10000);
            const maxFeeInWei = ethers.parseUnits(maxFee.toString(), 18);
            const expectedFee = fee > maxFeeInWei ? maxFeeInWei : fee;

            // 执行转账
            await proxyAsLogic.connect(user1).transfer(await user2.getAddress(), transferAmount);

            // 验证余额变化
            const user2Balance = await proxyAsLogic.balanceOf(await user2.getAddress());
            expect(user2Balance).to.equal(initialUser2Balance + transferAmount - expectedFee);

            const ownerBalance = await proxyAsLogic.balanceOf(await owner.getAddress());
            expect(ownerBalance).to.equal(initialOwnerBalance + expectedFee);
        });
    });

    describe("合约升级", function () {
        it("应该能够升级到新的逻辑合约", async function () {
            // 部署新的逻辑合约
            newLogic = await deployContract("Logic", owner);

            // 升级到新的逻辑合约
            await proxy.upgradeTo(await newLogic.getAddress());

            // 验证升级是否成功
            const proxyImplementation = await proxy.implementation();
            expect(proxyImplementation).to.equal(await newLogic.getAddress());
        });

        it("非所有者不应该能够升级合约", async function () {
            // 部署新的逻辑合约
            newLogic = await deployContract("Logic", owner);

            // 尝试使用非所有者账户升级
            await expect(
                proxy.connect(user1).upgradeTo(await newLogic.getAddress())
            ).to.be.revertedWith("Only owner can call this function");
        });
    });
}); 