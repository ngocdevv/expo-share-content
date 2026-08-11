import { resolvePluginOptions } from '../options';

describe('resolvePluginOptions', () => {
  it('provides safe cross-platform defaults', () => {
    expect(resolvePluginOptions({})).toEqual(
      expect.objectContaining({
        androidIntentFilters: ['text/*', 'image/*', 'video/*', 'audio/*', 'application/*'],
        androidMultiIntentFilters: ['image/*', 'video/*', 'audio/*', 'application/*'],
        iosShareExtensionName: 'ShareExtension',
        iosOpenHostAppAfterShare: false,
        maxSharedItems: 20,
        maxSharedFileSize: 100 * 1024 * 1024,
        maxSharedTotalSize: 250 * 1024 * 1024,
      })
    );
  });

  it('rejects malformed Android MIME types', () => {
    expect(() => resolvePluginOptions({ androidIntentFilters: ['image'] })).toThrow(
      'Invalid Android MIME type'
    );
  });

  it.each([
    [{ maxSharedItems: 0 }, 'maxSharedItems'],
    [{ maxSharedItems: 1.5 }, 'maxSharedItems'],
    [{ maxSharedItems: 2_147_483_648 }, 'maxSharedItems'],
    [{ maxSharedFileSize: 0 }, 'maxSharedFileSize'],
    [{ maxSharedFileSize: 2_147_483_648 }, 'maxSharedFileSize'],
    [{ maxSharedTotalSize: 0 }, 'maxSharedTotalSize'],
    [{ maxSharedTotalSize: 2_147_483_648 }, 'maxSharedTotalSize'],
    [
      { maxSharedFileSize: 200, maxSharedTotalSize: 100 },
      'greater than or equal to maxSharedFileSize',
    ],
    [{ iosActivationRules: {} }, 'empty dictionary'],
    [
      {
        maxSharedItems: 2,
        iosActivationRules: { NSExtensionActivationSupportsImageWithMaxCount: 3 },
      },
      'must not exceed maxSharedItems',
    ],
    [{ iosActivationRules: 'TRUEPREDICATE' }, 'TRUEPREDICATE'],
    [
      { iosActivationRules: { NSExtensionActivationSupportsImageWithMaxCount: 0 } },
      'positive integer',
    ],
    [{ iosActivationRules: { UnsupportedActivationRule: true } }, 'UnsupportedActivationRule'],
    [{ iosShareExtensionName: '   ' }, 'iosShareExtensionName'],
    [{ iosDeploymentTarget: 'latest' }, 'iosDeploymentTarget'],
    [{ iosDeploymentTarget: '15.0' }, '16.4 or newer'],
  ] as const)('rejects invalid option %j', (options, expectedMessage) => {
    expect(() => resolvePluginOptions(options)).toThrow(expectedMessage);
  });
});
