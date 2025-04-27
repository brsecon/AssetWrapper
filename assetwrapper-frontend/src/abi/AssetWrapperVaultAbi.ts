// src/abi/AssetWrapperVaultAbi.ts

// AssetWrapper/artifacts/contracts/AssetWrapperVault.sol/AssetWrapperVault.json dosyasından
// "abi": [...] dizisinin tamamını kopyalayıp aşağıdaki köşeli parantezlerin içine yapıştır.
export const AssetWrapperVaultAbi = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "initialOwner",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "InsufficientLockedBalance",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NftAlreadyLocked",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NftNotLocked",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NonPositiveAmount",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "OwnableInvalidOwner",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "OwnableUnauthorizedAccount",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ReentrancyGuardReentrantCall",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "token",
          "type": "address"
        }
      ],
      "name": "SafeERC20FailedOperation",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "UnauthorizedCaller",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ZeroAssetContractAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ZeroRecipientAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ZeroUserAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ZeroWrapperNftAddress",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "wrapperId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetContract",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "idOrAmount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isNFT",
          "type": "bool"
        }
      ],
      "name": "AssetLocked",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "wrapperId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetContract",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "idOrAmount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isNFT",
          "type": "bool"
        }
      ],
      "name": "AssetUnlocked",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "newWrapperNftAddress",
          "type": "address"
        }
      ],
      "name": "WrapperNftAddressSet",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "isNFTLocked",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "wrapperId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "assetContract",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "idOrAmount",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "isNFT",
          "type": "bool"
        }
      ],
      "name": "lockAsset",
      "outputs": [
        {
          "internalType": "bool",
          "name": "success",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "lockedERC20Balance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "name": "onERC721Received",
      "outputs": [
        {
          "internalType": "bytes4",
          "name": "",
          "type": "bytes4"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "renounceOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newWrapperNftAddress",
          "type": "address"
        }
      ],
      "name": "setWrapperNftAddress",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "wrapperId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "assetContract",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "idOrAmount",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "isNFT",
          "type": "bool"
        }
      ],
      "name": "unlockAsset",
      "outputs": [
        {
          "internalType": "bool",
          "name": "success",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "wrapperNftContractAddress",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]; // <-- Köşeli parantezin kapandığından emin ol