// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Storage.sol";
import "./SafeMath.sol";

contract Logic is Storage {
    using SafeMath for uint256;

    // 事件定义
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event Pause();
    event Unpause();
    event AddedBlackList(address _user);
    event RemovedBlackList(address _user);
    event DestroyedBlackFunds(address _blackListedUser, uint256 _balance);
    event Issue(uint256 amount);
    event Redeem(uint256 amount);
    event Deprecate(address newAddress);
    event Params(uint256 feeBasisPoints, uint256 maxFee);

    // 修饰器
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Contract is not paused");
        _;
    }

    modifier onlyPayloadSize(uint256 size) {
        require(msg.data.length >= size + 4, "Invalid payload size");
        _;
    }

    // 初始化函数
    function initialize(
        uint256 _initialSupply,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public {
        require(!initialized, "Already initialized"); // 使用新的初始化状态变量

        owner = msg.sender;
        _totalSupply = _initialSupply;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        balances[owner] = _initialSupply;
        deprecated = false;
        initialized = true;
    }

    // ERC20 基本功能
    function transfer(address _to, uint256 _value) public whenNotPaused {
        require(!isBlackListed[msg.sender], "Sender is blacklisted");
        require(_to != address(0), "Cannot transfer to zero address");

        uint256 fee = (_value.mul(basisPointsRate)).div(10000);
        if (fee > maximumFee) {
            fee = maximumFee;
        }
        uint256 sendAmount = _value.sub(fee);

        require(balances[msg.sender] >= _value, "Insufficient balance");
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(sendAmount);

        if (fee > 0) {
            balances[owner] = balances[owner].add(fee);
            emit Transfer(msg.sender, owner, fee);
        }
        emit Transfer(msg.sender, _to, sendAmount);
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public whenNotPaused {
        require(!isBlackListed[_from], "From address is blacklisted");
        require(_to != address(0), "Cannot transfer to zero address");

        uint256 fee = (_value.mul(basisPointsRate)).div(10000);
        if (fee > maximumFee) {
            fee = maximumFee;
        }

        uint256 currentAllowance = allowed[_from][msg.sender];
        if (currentAllowance < MAX_UINT) {
            allowed[_from][msg.sender] = currentAllowance.sub(_value);
        }

        uint256 sendAmount = _value.sub(fee);
        require(balances[_from] >= _value, "Insufficient balance");
        balances[_from] = balances[_from].sub(_value);
        balances[_to] = balances[_to].add(sendAmount);

        if (fee > 0) {
            balances[owner] = balances[owner].add(fee);
            emit Transfer(_from, owner, fee);
        }
        emit Transfer(_from, _to, sendAmount);
    }

    function approve(address _spender, uint256 _value) public {
        require(_spender != address(0), "Cannot approve zero address");
        require(
            !((_value != 0) && (allowed[msg.sender][_spender] != 0)),
            "Reset allowance to 0 first"
        );

        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
    }

    // 查询功能
    function balanceOf(address _owner) public view returns (uint256) {
        return balances[_owner];
    }

    function allowance(
        address _owner,
        address _spender
    ) public view returns (uint256) {
        return allowed[_owner][_spender];
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    // 管理功能
    function pause() public onlyOwner whenNotPaused {
        paused = true;
        emit Pause();
    }

    function unpause() public onlyOwner whenPaused {
        paused = false;
        emit Unpause();
    }

    function issue(uint256 amount) public onlyOwner {
        require(_totalSupply + amount > _totalSupply, "Overflow check");
        require(balances[owner] + amount > balances[owner], "Overflow check");

        balances[owner] = balances[owner].add(amount);
        _totalSupply = _totalSupply.add(amount);
        emit Issue(amount);
    }

    function redeem(uint256 amount) public onlyOwner {
        require(_totalSupply >= amount, "Insufficient total supply");
        require(balances[owner] >= amount, "Insufficient balance");

        _totalSupply = _totalSupply.sub(amount);
        balances[owner] = balances[owner].sub(amount);
        emit Redeem(amount);
    }

    // 黑名单功能
    function addBlackList(address _evilUser) public onlyOwner {
        isBlackListed[_evilUser] = true;
        emit AddedBlackList(_evilUser);
    }

    function removeBlackList(address _clearedUser) public onlyOwner {
        isBlackListed[_clearedUser] = false;
        emit RemovedBlackList(_clearedUser);
    }

    function destroyBlackFunds(address _blackListedUser) public onlyOwner {
        require(isBlackListed[_blackListedUser], "Address is not blacklisted");
        uint256 dirtyFunds = balances[_blackListedUser];
        balances[_blackListedUser] = 0;
        _totalSupply = _totalSupply.sub(dirtyFunds);
        emit DestroyedBlackFunds(_blackListedUser, dirtyFunds);
    }

    // 费用设置
    function setParams(
        uint256 newBasisPoints,
        uint256 newMaxFee
    ) public onlyOwner {
        require(newBasisPoints < 20, "Basis points too high");
        require(newMaxFee < 50, "Maximum fee too high");

        basisPointsRate = newBasisPoints;
        maximumFee = newMaxFee.mul(10 ** decimals);

        emit Params(basisPointsRate, maximumFee);
    }
}
