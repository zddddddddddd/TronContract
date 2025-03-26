const TronWeb = require('tronweb');
const fs = require('fs');
require('dotenv').config();

// 配置TronWeb
const tronWeb = new TronWeb({
    fullHost: 'https://nile.trongrid.io', // Nile测试网
    privateKey: process.env.PRIVATE_KEY
});

/**
 * 验证合约
 * @param {string} contractAddress - 合约地址
 * @param {string} contractName - 合约名称
 */
async function verifyContract() {
    try {
        // 获取命令行参数
        const contractAddress = process.argv[2]; // 合约地址

        if (!contractAddress) {
            console.error('请提供合约地址作为参数');
            console.log('使用方式: node verify_contract.js <合约地址>');
            return;
        }

        // 获取编译后的合约数据（从artifacts中读取）
        const contractPath = `./artifacts/contracts/Token.sol/Token.json`;

        if (!fs.existsSync(contractPath)) {
            console.error('找不到编译后的合约文件，请先编译合约');
            console.log('运行: npx hardhat compile');
            return;
        }

        const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

        // 准备验证数据
        const verificationData = {
            address: contractAddress,
            name: 'Token', // 合约名称
            abi: contractData.abi,
            bytecode: contractData.bytecode,
            compiler: {
                name: 'solc',
                version: '0.5.0',
            },
            optimizer: {
                enabled: true,
                runs: 200,
            },
            sourceCode: {
                // 需要提供所有相关合约的源代码
                'Token.sol': fs.readFileSync('./contracts/Token.sol', 'utf8'),
                'ERC20.sol': fs.readFileSync('./contracts/ERC20.sol', 'utf8'),
                'ERC20Detailed.sol': fs.readFileSync('./contracts/ERC20Detailed.sol', 'utf8'),
                'IERC20.sol': fs.readFileSync('./contracts/IERC20.sol', 'utf8'),
                'SafeMath.sol': fs.readFileSync('./contracts/SafeMath.sol', 'utf8'),
            }
        };

        console.log(`开始验证合约: ${contractAddress}`);

        // 尝试获取合约信息
        try {
            const contract = await tronWeb.trx.getContract(contractAddress);
            if (contract.result && contract.result.code) {
                console.log('\n合约信息获取成功:');
                if (contract.name) {
                    console.log(`名称: ${contract.name}`);
                }
                console.log(`合约存在于链上，可以进行验证`);
            } else {
                console.log('\n警告: 无法获取合约详细信息，但仍可尝试验证。');
                console.log('可能的原因:');
                console.log('- 合约地址格式正确，但合约不存在');
                console.log('- 网络连接问题');
                console.log('- API限制');
            }
        } catch (error) {
            console.log('\n警告: 获取合约信息时出现错误，但仍可尝试验证。');
            console.log('错误信息:', error.message);
        }

        // 提供验证指南
        console.log('\n验证指南:');
        console.log('1. 访问 https://nile.tronscan.org/#/contracts/verify');
        console.log('2. 输入合约地址:', contractAddress);
        console.log('3. 选择编译器版本: v0.5.0+commit.1d4f565a');
        console.log('4. 启用优化(Optimization)，并设置为200次运行');
        console.log('5. 选择多文件上传模式（Multiple Files）');
        console.log('6. 上传所有合约文件:');
        console.log('   - Token.sol (主合约)');
        console.log('   - ERC20.sol');
        console.log('   - ERC20Detailed.sol');
        console.log('   - IERC20.sol');
        console.log('   - SafeMath.sol');
        console.log('7. 如果合约构造函数有参数，请根据部署时的参数提供ABI编码后的构造参数');
        console.log('8. 点击"验证"按钮');

        // 可能的问题和解决方案
        console.log('\n如果验证失败，检查以下几点:');
        console.log('1. 编译器版本是否正确 - 必须与部署时完全一致');
        console.log('2. 优化设置是否正确 - 必须与部署时一致');
        console.log('3. 源代码是否与部署时完全一致 - 任何小的修改都会导致字节码不匹配');
        console.log('4. 所有导入的合约文件是否都已上传');
        console.log('5. 如果有构造函数参数，确保参数正确编码');

        console.log('\n常见问题:');
        console.log('- 如果报错提示编译器版本不匹配，尝试其他0.5.0版本的编译器');
        console.log('- 如果提示优化不匹配，尝试切换优化开关或调整优化次数');
        console.log('- 如果合约很复杂，可能需要尝试将所有合约代码合并为一个文件');

    } catch (error) {
        console.error('验证合约时发生错误:', error);
    }
}

verifyContract(); 