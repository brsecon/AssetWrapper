import { useWriteContract } from 'wagmi';
import AssetWrapperJson from '@/contracts/abis/AssetWrapper.json';
import { type Address } from 'viem';

const assetWrapperAbi = AssetWrapperJson.abi;

export interface UseUnwrapAssetParams {
  wrapperId: bigint; // uint256
}

export function useUnwrapAsset() {
  const { data, error, isPending, writeContractAsync, reset } = useWriteContract();

  const assetWrapperContractAddress = process.env.NEXT_PUBLIC_ASSET_WRAPPER_CONTRACT_ADDRESS as Address | undefined;

  const executeUnwrap = async ({ wrapperId }: UseUnwrapAssetParams) => {
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
    data,
    isPending,
    error,
    reset,
  };
}
