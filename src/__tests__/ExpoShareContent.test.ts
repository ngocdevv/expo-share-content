import type { SharePayload } from '../ExpoShareContent.types';
import { createShareContentApi } from '../createShareContentApi';

const first: SharePayload = {
  id: 'share-1',
  timestamp: 1,
  source: 'share-sheet',
  items: [{ id: 'item-1', type: 'text', mimeType: 'text/plain', text: 'hello' }],
};

function createNative() {
  return {
    getPendingSharesAsync: jest.fn().mockResolvedValue([first]),
    clearPendingSharesAsync: jest.fn().mockResolvedValue(undefined),
    releaseSharedFilesAsync: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn((_eventName: string, _listener: (event: never) => void) => ({
      remove: jest.fn(),
    })),
  };
}

describe('ExpoShareContent JavaScript API', () => {
  it('returns the oldest pending share without acknowledging it', async () => {
    const native = createNative();
    const api = createShareContentApi(native);

    await expect(api.getInitialShareAsync()).resolves.toEqual(first);
    expect(native.getPendingSharesAsync).toHaveBeenCalledTimes(1);
    expect(native.clearPendingSharesAsync).not.toHaveBeenCalled();
  });

  it('keeps acknowledgement and managed-file release as separate operations', async () => {
    const native = createNative();
    const api = createShareContentApi(native);

    await api.clearPendingSharesAsync(['share-1']);
    expect(native.clearPendingSharesAsync).toHaveBeenCalledWith(['share-1']);
    expect(native.releaseSharedFilesAsync).not.toHaveBeenCalled();

    await api.releaseSharedFilesAsync(['share-1']);
    expect(native.releaseSharedFilesAsync).toHaveBeenCalledWith(['share-1']);
  });

  it('returns removable subscriptions for share and error listeners', () => {
    const native = createNative();
    const api = createShareContentApi(native);
    const share = api.addShareListener(jest.fn());
    const error = api.addShareErrorListener(jest.fn());

    share.remove();
    error.remove();
    expect(native.addListener).toHaveBeenNthCalledWith(1, 'onShareReceived', expect.any(Function));
    expect(native.addListener).toHaveBeenNthCalledWith(2, 'onShareError', expect.any(Function));
    expect(share.remove).toHaveBeenCalledTimes(1);
    expect(error.remove).toHaveBeenCalledTimes(1);
  });
});
