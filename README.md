# TRON链可升级代币合约

这个项目包含一个基于TRON区块链的可升级代币合约实现，使用代理模式进行合约升级。

## 功能特点

- 基于代理模式实现可升级合约
- 完全兼容TRC20标准
- 实现黑名单功能
- 可配置的交易费用
- 暂停/恢复功能
- 支持代币增发和销毁

## 目录结构

```
├── contracts/             # 智能合约源代码
│   ├── Logic.sol          # 合约逻辑实现
│   ├── Proxy.sol          # 代理合约
│   ├── Storage.sol        # 存储层定义
│   └── SafeMath.sol       # 安全数学库
├── scripts/               # 部署和交互脚本
│   ├── deploy_proxy_logic.js      # 部署代理和逻辑合约
│   ├── upgrade_logic.js           # 升级逻辑合约
│   └── interact.js                # 与合约交互的脚本
├── test/                  # 测试脚本
│   ├── proxy-logic.test.js        # 使用Hardhat测试
│   └── tronweb-token.test.js      # 直接使用TronWeb测试
├── .env.example           # 环境变量示例文件
├── hardhat.config.js      # Hardhat配置文件
└── README.md              # 项目说明文档
```

## 安装

1. 克隆仓库

```bash
git clone <repository-url>
cd tronChain
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

复制`.env.example`文件并重命名为`.env`，然后填写你的私钥：

```bash
cp .env.example .env
```

编辑`.env`文件，添加以下内容：

```
PRIVATE_KEY=你的私钥
```

## 编译合约

使用Hardhat编译合约：

```bash
npx hardhat compile
```

## 运行测试

运行Hardhat测试：

```bash
npx hardhat test
```

运行TronWeb专用测试（需要有本地或远程TRON节点）：

```bash
# 使用本地节点
TRON_NETWORK=development node test/tronweb-token.test.js

# 使用Shasta测试网
TRON_NETWORK=shasta node test/tronweb-token.test.js
```

## 部署合约

### 部署到测试网

部署代理和逻辑合约到Shasta测试网：

```bash
node scripts/deploy_proxy_logic.js
```

部署成功后，脚本会在当前目录生成`deployment-info.json`文件，包含部署的合约地址和其他详细信息。

### 升级逻辑合约

部署新版本的逻辑合约并更新代理：

```bash
node scripts/upgrade_logic.js
```

## 与合约交互

使用交互脚本操作已部署的合约：

```bash
# 获取代币信息
node scripts/interact.js info

# 查询余额
node scripts/interact.js balance <地址>

# 转账
node scripts/interact.js transfer <接收地址> <数量>

# 发行代币（仅限所有者）
node scripts/interact.js issue <数量>

# 销毁代币（仅限所有者）
node scripts/interact.js redeem <数量>

# 添加黑名单
node scripts/interact.js addBlacklist <地址>

# 移除黑名单
node scripts/interact.js removeBlacklist <地址>

# 暂停合约
node scripts/interact.js pause

# 恢复合约
node scripts/interact.js unpause

# 设置费用参数
node scripts/interact.js setFees <基点> <最大费用>
```

## 合约地址

### Shasta测试网

部署后，您可以在`deployment-info.json`文件中找到部署的合约地址。

## 安全考虑

- 合约使用代理模式进行升级，确保代理合约的所有权安全
- 重要功能已添加`onlyOwner`修饰器，防止未授权访问
- 使用SafeMath库防止整数溢出
- 实现了暂停机制，用于紧急情况
- 所有关键功能都有事件记录，便于追踪

## 许可证

MIT
