// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Storage.sol";

contract Proxy is Storage {
    event Upgraded(address indexed implementation);

    // 实现合约地址
    address public implementation;

    constructor() {
        owner = msg.sender;
    }

    // 升级实现合约
    function upgradeTo(address _newImplementation) public {
        require(msg.sender == owner, "Only owner can call this function");
        require(
            _newImplementation != address(0),
            "Invalid implementation address"
        );
        require(
            _newImplementation != implementation,
            "Same implementation address"
        );

        implementation = _newImplementation;
        emit Upgraded(_newImplementation);
    }

    // 回退函数，将所有调用委托给实现合约
    fallback() external payable {
        _delegate(implementation);
    }

    receive() external payable {
        _delegate(implementation);
    }

    function _delegate(address _impl) internal {
        require(_impl != address(0), "Implementation not set");

        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
