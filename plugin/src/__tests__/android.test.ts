import { applyAndroidMainActivity, applyAndroidShareConfig } from '../android';
import { resolvePluginOptions } from '../options';

const createManifest = () => ({
  manifest: {
    $: { package: 'com.example.app' },
    application: [
      {
        $: { 'android:name': '.MainApplication' },
        activity: [
          {
            $: { 'android:name': '.MainActivity' },
            'intent-filter': [],
          },
        ],
      },
    ],
  },
});

describe('applyAndroidShareConfig', () => {
  it('adds idempotent SEND filters and single-task activity attributes', () => {
    const options = resolvePluginOptions({
      androidIntentFilters: ['text/plain', 'image/*'],
      androidMultiIntentFilters: ['image/*'],
    });
    const manifest = createManifest();

    applyAndroidShareConfig(manifest as never, options);
    applyAndroidShareConfig(manifest as never, options);

    const activity = manifest.manifest.application[0].activity[0];
    expect(activity.$).toEqual(
      expect.objectContaining({
        'android:launchMode': 'singleTask',
        'android:documentLaunchMode': 'never',
      })
    );
    expect(activity['intent-filter']).toHaveLength(2);
    expect(activity['intent-filter'].map((filter) => filter.action?.[0].$['android:name'])).toEqual(
      ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE']
    );
    expect(activity['intent-filter'][0].data).toEqual([
      { $: { 'android:mimeType': 'text/plain' } },
      { $: { 'android:mimeType': 'image/*' } },
    ]);
  });

  it('preserves user-authored SEND filters while remaining idempotent', () => {
    const options = resolvePluginOptions({
      androidIntentFilters: ['text/plain'],
      androidMultiIntentFilters: ['image/*'],
    });
    const manifest = createManifest();
    const activity = manifest.manifest.application[0].activity[0];
    const userFilter = {
      $: { 'android:priority': '100' },
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:mimeType': 'application/pdf' } }],
    };
    activity['intent-filter'].push(userFilter);

    applyAndroidShareConfig(manifest as never, options);
    applyAndroidShareConfig(manifest as never, options);

    expect(activity['intent-filter']).toContain(userFilter);
    expect(activity['intent-filter']).toHaveLength(3);
  });
});

describe('applyAndroidMainActivity', () => {
  it.each([
    [
      'kt',
      `package com.example\n\nimport android.os.Bundle\n\nclass MainActivity : ReactActivity() {\n}\n`,
      'override fun onNewIntent(intent: Intent)',
      'setIntent(intent)',
      'ShareContentIntentHolder.offer(intent)',
      'ShareContentIntentHolder.consume(intent)',
    ],
    [
      'java',
      `package com.example;\n\nimport android.os.Bundle;\n\nclass MainActivity extends ReactActivity {\n}\n`,
      'public void onNewIntent(Intent intent)',
      'setIntent(intent);',
      'ShareContentIntentHolder.offer(intent);',
      'ShareContentIntentHolder.consume(intent);',
    ],
  ])(
    'adds an idempotent early-intent bridge to %s',
    (language, source, method, setter, offer, consume) => {
      const once = applyAndroidMainActivity(source, language);
      const twice = applyAndroidMainActivity(once, language);

      expect(twice).toBe(once);
      expect(once).toContain(method);
      expect(once).toContain(setter);
      expect(once).toContain(offer);
      expect(once).toContain(consume);
      expect(once.indexOf(offer)).toBeLessThan(once.indexOf(consume));
      expect(once.indexOf(consume)).toBeLessThan(once.indexOf(setter));
      expect(once.match(/expo-share-content-intent/g)).toHaveLength(1);
    }
  );

  it.each([
    [
      'kt',
      `class MainActivity : ReactActivity() {\n  override fun onNewIntent(intent: Intent) {\n    setIntent(intent) // expo-share-content-intent\n    ShareContentIntentHolder.offer(intent)\n    super.onNewIntent(intent)\n  }\n}\n`,
      'ShareContentIntentHolder.consume(intent)',
    ],
    [
      'java',
      `class MainActivity extends ReactActivity {\n  public void onNewIntent(Intent intent) {\n    setIntent(intent); // expo-share-content-intent\n    ShareContentIntentHolder.offer(intent);\n    super.onNewIntent(intent);\n  }\n}\n`,
      'ShareContentIntentHolder.consume(intent);',
    ],
  ])('migrates the legacy %s intent bridge idempotently', (language, source, consume) => {
    const migrated = applyAndroidMainActivity(source, language);
    expect(migrated).toContain(consume);
    expect(migrated.indexOf('ShareContentIntentHolder.offer')).toBeLessThan(
      migrated.indexOf('ShareContentIntentHolder.consume')
    );
    expect(applyAndroidMainActivity(migrated, language)).toBe(migrated);
  });
});
