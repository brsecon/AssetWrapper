import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import AssetWrapperJson from '@/contracts/abis/AssetWrapper.json';
import { type Address } from 'viem';

const assetWrapperAbi = AssetWrapperJson.abi;

// This Asset interface might be less directly used if we call specific functions
// but can be useful for conceptual understanding or if a generic wrapper is added later.
export interface Asset {
  contractAddress: Address; 
  assetType: number; // 0: ERC20, 1: ERC721, 2: ERC1155
  amount: bigint;       
  tokenId: bigint;      
}

export interface WrapNFTsParams {
  nftAddresses: Address[];
  tokenIds: bigint[];
  // owner is implicitly msg.sender in the contract functions
}

export interface WrapWETHTokensParams {
  wethAmounts: bigint[];
  // owner is implicitly msg.sender
}

export interface WrapERC1155sParams {
  tokenAddresses: Address[];
  ids: bigint[];
  amounts: bigint[];
  data: `0x${string}`[]; // Array of bytes, hex string format
}

// Add other params interfaces for ERC1155 if needed

export function useWrapAssets() {
  const { address: account } = useAccount(); 
  const { data: writeData, error: writeError, isPending: isWritePending, writeContractAsync, reset } = useWriteContract();

  const assetWrapperContractAddress = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as Address | undefined;

  const { data: wrapFee, isLoading: isLoadingWrapFee, error: wrapFeeError } = useReadContract({
    address: assetWrapperContractAddress,
    abi: assetWrapperAbi,
    functionName: 'wrapFee',
    query: {
      enabled: !!assetWrapperContractAddress, // Only run query if address is available
    },
  });

  const executeWrapNFTs = async ({ nftAddresses, tokenIds }: WrapNFTsParams) => {
    if (!assetWrapperContractAddress) {
      throw new Error("Asset Wrapper contract address is not configured. Please set NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS in your .env.local file.");
    }
    // Fee loading/error checks
    if (isLoadingWrapFee) {
        throw new Error("Wrap fee is currently being fetched. Please try again shortly.");
    }
    if (wrapFeeError) {
        throw new Error(`Failed to fetch wrap fee: ${wrapFeeError.message}`);
    }
    if (typeof wrapFee === 'undefined') { // Check if wrapFee is undefined after loading and no error
      throw new Error("Wrap fee could not be fetched or is not available (undefined).");
    }

    return writeContractAsync({
      address: assetWrapperContractAddress,
      abi: assetWrapperAbi,
      functionName: 'wrapNFTs',
      args: [nftAddresses, tokenIds],
      value: wrapFee as bigint, // Use the fetched wrapFee, cast to bigint
    });
  };
  
  const executeWrapWETHTokens = async ({ wethAmounts }: WrapWETHTokensParams) => {
    if (!assetWrapperContractAddress) {
      throw new Error("Asset Wrapper contract address is not configured. Please set NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS in your .env.local file.");
    }
    // Fee loading/error checks
    if (isLoadingWrapFee) {
        throw new Error("Wrap fee is currently being fetched. Please try again shortly.");
    }
    if (wrapFeeError) {
        throw new Error(`Failed to fetch wrap fee: ${wrapFeeError.message}`);
    }
    if (typeof wrapFee === 'undefined') { // Check if wrapFee is undefined after loading and no error
        throw new Error("Wrap fee could not be fetched or is not available (undefined).");
    }

    return writeContractAsync({
      address: assetWrapperContractAddress,
      abi: assetWrapperAbi,
      functionName: 'wrapWETHTokens',
      args: [wethAmounts],
      value: wrapFee as bigint, // Use the fetched wrapFee, cast to bigint
    });
  };

  const executeWrapERC1155s = async ({ tokenAddresses, ids, amounts, data }: WrapERC1155sParams) => {
    if (!assetWrapperContractAddress) {
      throw new Error("Asset Wrapper contract address is not configured. Please set NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS in your .env.local file.");
    }
    // Fee loading/error checks
    if (isLoadingWrapFee) {
        throw new Error("Wrap fee is currently being fetched. Please try again shortly.");
    }
    if (wrapFeeError) {
        throw new Error(`Failed to fetch wrap fee: ${wrapFeeError.message}`);
    }
    if (typeof wrapFee === 'undefined') { // Check if wrapFee is undefined after loading and no error
        throw new Error("Wrap fee could not be fetched or is not available (undefined).");
    }

    return writeContractAsync({
      address: assetWrapperContractAddress,
      abi: assetWrapperAbi,
      functionName: 'wrapERC1155s',
      args: [tokenAddresses, ids, amounts, data],
      value: wrapFee as bigint, // Use the fetched wrapFee, cast to bigint
    });
  };

  return {
    // Expose specific wrap functions
    wrapNFTs: executeWrapNFTs,
    wrapWETHTokens: executeWrapWETHTokens,
    wrapERC1155s: executeWrapERC1155s,
    // Expose fee details
    wrapFee,
    isLoadingWrapFee,
    wrapFeeError,
    // Expose write contract status
    data: writeData, 
    isPending: isWritePending,
    error: writeError,
    reset,
  };
}

// Hook for unwrapping assets
export function useUnwrapAsset() {
  const { data: writeData, error: writeError, isPending: isWritePending, writeContractAsync, reset } = useWriteContract();
  const assetWrapperContractAddress = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as Address | undefined;

  const executeUnwrap = async (wrapperId: bigint) => {
    if (!assetWrapperContractAddress) {
      throw new Error("Asset Wrapper contract address is not configured. Please set NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS in your .env.local file.");
    }

    return writeContractAsync({
      address: assetWrapperContractAddress,
      abi: assetWrapperAbi,
      functionName: 'unwrap',
      args: [wrapperId],
    });
  };

  return {
    unwrapAsset: executeUnwrap,
    data: writeData,
    isPending: isWritePending,
    error: writeError,
    reset,
  };
}
