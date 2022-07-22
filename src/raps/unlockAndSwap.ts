import {
  ALLOWS_PERMIT,
  ChainId,
  ETH_ADDRESS as ETH_ADDRESS_AGGREGATOR,
  PermitSupportedTokenList,
  RAINBOW_ROUTER_CONTRACT_ADDRESS,
  WRAPPED_ASSET,
} from '@rainbow-me/swaps';
import { concat, reduce, toLower } from 'lodash';
import { assetNeedsUnlocking, estimateApprove } from './actions';
import {
  createNewAction,
  createNewRap,
  RapAction,
  RapActionTypes,
  SwapActionParameters,
} from './common';
import { isNativeAsset } from '@rainbow-me/handlers/assets';
import { estimateSwapGasLimit } from '@rainbow-me/handlers/uniswap';
import store from '@rainbow-me/redux/store';
import { ETH_ADDRESS } from '@rainbow-me/references';
import { add } from '@rainbow-me/utilities';
import { ethereumUtils } from '@rainbow-me/utils';

export const estimateUnlockAndSwap = async (
  swapParameters: SwapActionParameters
) => {
  const { inputAmount, tradeDetails, chainId } = swapParameters;
  const { inputCurrency, outputCurrency } = store.getState().swap;

  if (!inputCurrency || !outputCurrency || !inputAmount) {
    return ethereumUtils.getBasicSwapGasLimit(Number(chainId));
  }
  const { accountAddress } = store.getState().settings;

  const isNativeAssetUnwrapping =
    toLower(inputCurrency.address) ===
      toLower(WRAPPED_ASSET[Number(chainId)]) &&
    (toLower(outputCurrency.address) === toLower(ETH_ADDRESS) ||
      toLower(outputCurrency.address) === toLower(ETH_ADDRESS_AGGREGATOR));

  let gasLimits: (string | number)[] = [];
  let swapAssetNeedsUnlocking = false;
  // Aggregators represent native asset as 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
  let nativeAsset =
    ETH_ADDRESS_AGGREGATOR.toLowerCase() ===
      inputCurrency.address.toLowerCase() ||
    isNativeAsset(
      inputCurrency.address,
      ethereumUtils.getNetworkFromChainId(Number(chainId))
    );

  if (!isNativeAssetUnwrapping && !nativeAsset) {
    swapAssetNeedsUnlocking = await assetNeedsUnlocking(
      accountAddress,
      inputAmount,
      inputCurrency,
      RAINBOW_ROUTER_CONTRACT_ADDRESS,
      chainId
    );
  }

  let unlockGasLimit;
  let swapGasLimit;

  if (swapAssetNeedsUnlocking) {
    unlockGasLimit = await estimateApprove(
      accountAddress,
      inputCurrency.address,
      RAINBOW_ROUTER_CONTRACT_ADDRESS,
      chainId
    );
    gasLimits = concat(gasLimits, unlockGasLimit);
  }
  swapGasLimit = await estimateSwapGasLimit({
    chainId: Number(chainId),
    requiresApprove: swapAssetNeedsUnlocking,
    tradeDetails,
  });

  gasLimits = concat(gasLimits, swapGasLimit);

  return reduce(gasLimits, (acc, limit) => add(acc, limit), '0');
};

export const createUnlockAndSwapRap = async (
  swapParameters: SwapActionParameters
) => {
  let actions: RapAction[] = [];

  const { inputAmount, tradeDetails, flashbots, chainId } = swapParameters;
  const { inputCurrency, outputCurrency } = store.getState().swap;
  const { accountAddress } = store.getState().settings;
  const isNativeAssetUnwrapping =
    toLower(inputCurrency.address) === toLower(WRAPPED_ASSET[`${chainId}`]) &&
    toLower(outputCurrency.address) === toLower(ETH_ADDRESS) &&
    chainId === ChainId.mainnet;

  // Aggregators represent native asset as 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
  let nativeAsset =
    ETH_ADDRESS_AGGREGATOR.toLowerCase() ===
      inputCurrency.address.toLowerCase() ||
    isNativeAsset(
      inputCurrency.address,
      ethereumUtils.getNetworkFromChainId(Number(chainId))
    );

  let swapAssetNeedsUnlocking = false;

  if (!isNativeAssetUnwrapping && !nativeAsset) {
    swapAssetNeedsUnlocking = await assetNeedsUnlocking(
      accountAddress,
      inputAmount,
      inputCurrency,
      RAINBOW_ROUTER_CONTRACT_ADDRESS,
      chainId
    );
  }
  const allowsPermit =
    !nativeAsset &&
    chainId === ChainId.mainnet &&
    ALLOWS_PERMIT[
      toLower(inputCurrency.address) as keyof PermitSupportedTokenList
    ];

  if (swapAssetNeedsUnlocking && !allowsPermit) {
    const unlock = createNewAction(RapActionTypes.unlock, {
      amount: inputAmount,
      assetToUnlock: inputCurrency,
      chainId,
      contractAddress: RAINBOW_ROUTER_CONTRACT_ADDRESS,
    });
    actions = concat(actions, unlock);
  }

  // create a swap rap
  const swap = createNewAction(RapActionTypes.swap, {
    chainId,
    flashbots,
    inputAmount,
    permit: swapAssetNeedsUnlocking && allowsPermit,
    requiresApprove: swapAssetNeedsUnlocking && !allowsPermit,
    tradeDetails,
  });
  actions = concat(actions, swap);

  // create the overall rap
  const newRap = createNewRap(actions);
  return newRap;
};
