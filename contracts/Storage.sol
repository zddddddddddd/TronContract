// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Storage {
    // Token基本信息
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public _totalSupply;
    
    // 所有权相关
    address public owner;
    bool public paused;
    bool public initialized;
    
    // 余额和授权映射
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;
    
    // 费用相关
    uint256 public basisPointsRate;
    uint256 public maximumFee;
    
    // 黑名单相关
    mapping(address => bool) public isBlackListed;
    
    // 升级相关
    address public upgradedAddress;
    bool public deprecated;
    
    // 常量
    uint256 public constant MAX_UINT = type(uint256).max;
} 