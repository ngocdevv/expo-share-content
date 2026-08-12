import type { ShareErrorEvent, SharePayload, ShareSubscription } from './ExpoShareContent.types';
import { dedupeShares } from './share-utils';

export type ShareContentNativeModule = {
  getPendingSharesAsync(): Promise<SharePayload[]>;
  clearPendingSharesAsync(shareIds: string[] | null): Promise<void>;
  releaseSharedFilesAsync(shareIds: string[]): Promise<void>;
  addListener(
    eventName: 'onShareReceived' | 'onShareError',
    listener: (event: never) => void
  ): ShareSubscription;
};

export function createShareContentApi(nativeModule: ShareContentNativeModule) {
  const getPendingSharesAsync = async (): Promise<SharePayload[]> =>
    dedupeShares(await nativeModule.getPendingSharesAsync());

  const getInitialShareAsync = async (): Promise<SharePayload | null> => {
    const shares = await getPendingSharesAsync();
    return shares[0] ?? null;
  };

  const clearPendingSharesAsync = async (shareIds?: readonly string[]): Promise<void> => {
    await nativeModule.clearPendingSharesAsync(shareIds ? [...shareIds] : null);
  };

  const releaseSharedFilesAsync = async (shareIds: readonly string[]): Promise<void> => {
    await nativeModule.releaseSharedFilesAsync([...shareIds]);
  };

  const addShareListener = (listener: (payload: SharePayload) => void): ShareSubscription =>
    nativeModule.addListener('onShareReceived', listener as (event: never) => void);

  const addShareErrorListener = (listener: (error: ShareErrorEvent) => void): ShareSubscription =>
    nativeModule.addListener('onShareError', listener as (event: never) => void);

  return {
    addShareErrorListener,
    addShareListener,
    clearPendingSharesAsync,
    getInitialShareAsync,
    getPendingSharesAsync,
    releaseSharedFilesAsync,
  };
}

export type ShareContentApi = ReturnType<typeof createShareContentApi>;
