import {
  buildShareExtensionInfoPlist,
  renderShareViewController,
  resolveHostOpenURL,
  resolveIosIdentifiers,
} from '../ios/artifacts';
import { resolvePluginOptions } from '../options';

describe('iOS Share Extension artifacts', () => {
  it('derives identifiers and renders a complete native extension', () => {
    const options = resolvePluginOptions({ iosShareExtensionName: 'Example Share' });
    const identifiers = resolveIosIdentifiers(
      {
        appName: 'Example',
        bundleIdentifier: 'com.example.app',
      },
      options
    );

    expect(identifiers).toEqual({
      appGroupIdentifier: 'group.com.example.app',
      bundleIdentifier: 'com.example.app.share',
      displayName: 'Example Share',
      targetName: 'ExampleShare',
    });

    expect(buildShareExtensionInfoPlist(identifiers, options)).toEqual(
      expect.objectContaining({
        CFBundleDisplayName: 'Example Share',
        ExpoShareContentAppGroup: 'group.com.example.app',
        NSExtension: expect.objectContaining({
          NSExtensionPointIdentifier: 'com.apple.share-services',
          NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).ShareViewController',
        }),
      })
    );

    const swift = renderShareViewController(
      identifiers,
      options,
      resolveHostOpenURL('example', options)
    );
    expect(swift).toContain('group.com.example.app');
    expect(swift).toContain('100 * 1024 * 1024');
    expect(swift).toContain('250 * 1024 * 1024');
    expect(swift).toContain('withQueueFileLock');
    expect(swift).toContain('try container.encode(mimeType, forKey: .mimeType)');
    expect(swift).toContain('completeRequest(returningItems: nil, completionHandler: nil)');
    expect(swift).toContain('loadFileRepresentation(forTypeIdentifier:');
    expect(swift).toContain('read(upToCount:');
    // Binary/media attachments must stream. Text/URL may load small in-memory values,
    // but only after a byte-length guard (loadDataRepresentation path).
    expect(swift).toContain('loadDataRepresentation(forTypeIdentifier:');
    expect(swift).not.toMatch(/loadItem\(forTypeIdentifier:\s*UTType\.(image|movie|audio|fileURL)/);
    expect(swift).not.toContain('image.pngData()');
    expect(swift).not.toContain('copyItem(at: source');
    // Default is queue-only continuation: open helpers exist but hostOpenURLString is empty.
    expect(swift).toContain('openHostApp');
    expect(swift).toContain('openURLViaSharedApplication');
    expect(swift).toContain('openURLViaResponderChain');
    expect(swift).toContain('openURLViaExtensionContext');
    expect(swift).toContain('await openHostApp(shareId: shareId)');
    expect(swift).toContain('completeRequest(returningItems: nil, completionHandler: nil)');
    expect(swift).toContain('hostOpenURLString = ""');
    expect(swift).not.toMatch(/__[A-Z_]+__/);
  });

  it('can enable best-effort host auto-open', () => {
    const options = resolvePluginOptions({
      iosShareExtensionName: 'Example Share',
      iosOpenHostAppAfterShare: true,
    });
    const identifiers = resolveIosIdentifiers(
      { appName: 'Example', bundleIdentifier: 'com.example.app' },
      options
    );
    expect(resolveHostOpenURL('example', options)).toBe('example://share');
    const swift = renderShareViewController(
      identifiers,
      options,
      resolveHostOpenURL('example', options)
    );
    expect(swift).toContain('example://share');
    expect(swift).toContain('openURLViaSharedApplication');
    expect(swift).toContain('openURLViaResponderChain');
    expect(swift).toContain('openURLViaExtensionContext');
    expect(swift).toContain('await openHostApp(shareId: shareId)');
    expect(swift).not.toMatch(/__[A-Z_]+__/);
  });

  it('can disable host auto-open', () => {
    const options = resolvePluginOptions({
      iosShareExtensionName: 'Example Share',
      iosOpenHostAppAfterShare: false,
    });
    const identifiers = resolveIosIdentifiers(
      { appName: 'Example', bundleIdentifier: 'com.example.app' },
      options
    );
    expect(resolveHostOpenURL('example', options)).toBe('');
    const swift = renderShareViewController(identifiers, options, '');
    expect(swift).toContain('hostOpenURLString = ""');
    expect(swift).not.toMatch(/__[A-Z_]+__/);
  });

  it('resolves bare and full host schemes only when auto-open is enabled', () => {
    const disabled = resolvePluginOptions({});
    expect(resolveHostOpenURL('myapp', disabled)).toBe('');
    expect(resolveHostOpenURL(undefined, disabled)).toBe('');

    const enabled = resolvePluginOptions({ iosOpenHostAppAfterShare: true });
    expect(resolveHostOpenURL('myapp', enabled)).toBe('myapp://share');
    expect(resolveHostOpenURL('myapp://inbox', enabled)).toBe('myapp://inbox');
    expect(
      resolveHostOpenURL(
        'ignored',
        resolvePluginOptions({ iosOpenHostAppAfterShare: true, iosHostUrlScheme: 'custom://x' })
      )
    ).toBe('custom://x');
  });

  it('requires the extension bundle id to be prefixed by the host bundle id', () => {
    const options = resolvePluginOptions({
      iosShareExtensionBundleIdentifier: 'com.other.vendor.share',
    });
    expect(() =>
      resolveIosIdentifiers({ appName: 'Example', bundleIdentifier: 'com.example.app' }, options)
    ).toThrow('prefixed by the host bundle identifier');
  });
});
