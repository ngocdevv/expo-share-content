import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withMainActivity,
} from '@expo/config-plugins';

import type { ResolvedPluginOptions } from './options';

type AndroidManifest = Parameters<typeof AndroidConfig.Manifest.getMainActivityOrThrow>[0];
type MainActivity = ReturnType<typeof AndroidConfig.Manifest.getMainActivityOrThrow>;
type ManifestIntentFilter = NonNullable<MainActivity['intent-filter']>[number];

function createIntentFilter(action: string, mimeTypes: readonly string[]): ManifestIntentFilter {
  return {
    action: [{ $: { 'android:name': action } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    data: mimeTypes.map((mimeType) => ({ $: { 'android:mimeType': mimeType } })),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function filtersEqual(left: ManifestIntentFilter, right: ManifestIntentFilter): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export function applyAndroidShareConfig(
  androidManifest: AndroidManifest,
  options: ResolvedPluginOptions
): AndroidManifest {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  activity.$['android:launchMode'] = 'singleTask';
  activity.$['android:documentLaunchMode'] = 'never';

  const application = androidManifest.manifest.application?.[0];
  if (!application) {
    throw new Error('[react-native-share-content] Android manifest has no application node.');
  }
  const metadataNames = new Set([
    'expo.modules.sharecontent.MAX_SHARED_ITEMS',
    'expo.modules.sharecontent.MAX_SHARED_FILE_SIZE',
    'expo.modules.sharecontent.MAX_SHARED_TOTAL_SIZE',
  ]);
  const metadata = (application['meta-data'] ?? []).filter(
    (item) => !metadataNames.has(item.$['android:name'] ?? '')
  );
  metadata.push(
    {
      $: {
        'android:name': 'expo.modules.sharecontent.MAX_SHARED_ITEMS',
        'android:value': String(options.maxSharedItems),
      },
    },
    {
      $: {
        'android:name': 'expo.modules.sharecontent.MAX_SHARED_FILE_SIZE',
        'android:value': String(options.maxSharedFileSize),
      },
    },
    {
      $: {
        'android:name': 'expo.modules.sharecontent.MAX_SHARED_TOTAL_SIZE',
        'android:value': String(options.maxSharedTotalSize),
      },
    }
  );
  application['meta-data'] = metadata;

  const existing = activity['intent-filter'] ?? [];

  const generated: ManifestIntentFilter[] = [];
  if (options.androidIntentFilters.length > 0) {
    generated.push(createIntentFilter('android.intent.action.SEND', options.androidIntentFilters));
  }
  if (options.androidMultiIntentFilters.length > 0) {
    generated.push(
      createIntentFilter('android.intent.action.SEND_MULTIPLE', options.androidMultiIntentFilters)
    );
  }

  for (const filter of generated) {
    if (!existing.some((candidate) => filtersEqual(candidate, filter))) {
      existing.push(filter);
    }
  }
  activity['intent-filter'] = existing;
  return androidManifest;
}

const MAIN_ACTIVITY_MARKER = 'expo-share-content-intent';

export function applyAndroidMainActivity(contents: string, language: string): string {
  if (contents.includes(MAIN_ACTIVITY_MARKER)) {
    if (contents.includes('ShareContentIntentHolder.consume(')) return contents;

    const kotlinLegacy =
      /(\s*)setIntent\((\w+)\) \/\/ expo-share-content-intent\n\s*ShareContentIntentHolder\.offer\(\2\)/;
    const javaLegacy =
      /(\s*)setIntent\((\w+)\); \/\/ expo-share-content-intent\n\s*ShareContentIntentHolder\.offer\(\2\);/;
    const pattern = language === 'kt' ? kotlinLegacy : language === 'java' ? javaLegacy : null;
    if (!pattern) {
      throw new Error(
        `[react-native-share-content] Unsupported MainActivity language: ${language}`
      );
    }
    const migrated = contents.replace(
      pattern,
      language === 'kt'
        ? '$1ShareContentIntentHolder.offer($2) // expo-share-content-intent\n$1ShareContentIntentHolder.consume($2)\n$1setIntent($2)'
        : '$1ShareContentIntentHolder.offer($2); // expo-share-content-intent\n$1ShareContentIntentHolder.consume($2);\n$1setIntent($2);'
    );
    if (migrated === contents) {
      throw new Error(
        '[react-native-share-content] Unable to update the existing MainActivity intent bridge. Run a clean prebuild.'
      );
    }
    return migrated;
  }

  if (language === 'kt') {
    let updated = contents;
    if (!updated.includes('import android.content.Intent')) {
      updated = updated.replace(/^(package[^\n]+\n)/, '$1\nimport android.content.Intent\n');
    }
    if (!updated.includes('import expo.modules.sharecontent.ShareContentIntentHolder')) {
      updated = updated.replace(
        /^(package[^\n]+\n)/,
        '$1\nimport expo.modules.sharecontent.ShareContentIntentHolder\n'
      );
    }

    const existing = /(override\s+fun\s+onNewIntent\s*\(\s*(\w+)\s*:\s*Intent\??\s*\)\s*\{)/;
    if (existing.test(updated)) {
      return updated.replace(
        existing,
        `$1\n    ShareContentIntentHolder.offer($2) // ${MAIN_ACTIVITY_MARKER}\n    ShareContentIntentHolder.consume($2)\n    setIntent($2)`
      );
    }

    const method = `
  override fun onNewIntent(intent: Intent) {
    ShareContentIntentHolder.offer(intent) // ${MAIN_ACTIVITY_MARKER}
    ShareContentIntentHolder.consume(intent)
    setIntent(intent)
    super.onNewIntent(intent)
  }
`;
    const closingBrace = updated.lastIndexOf('}');
    if (closingBrace < 0)
      throw new Error('[react-native-share-content] Invalid Kotlin MainActivity.');
    return `${updated.slice(0, closingBrace)}${method}${updated.slice(closingBrace)}`;
  }

  if (language === 'java') {
    let updated = contents;
    if (!updated.includes('import android.content.Intent;')) {
      updated = updated.replace(/^(package[^\n]+\n)/, '$1\nimport android.content.Intent;\n');
    }
    if (!updated.includes('import expo.modules.sharecontent.ShareContentIntentHolder;')) {
      updated = updated.replace(
        /^(package[^\n]+\n)/,
        '$1\nimport expo.modules.sharecontent.ShareContentIntentHolder;\n'
      );
    }

    const existing = /(public\s+void\s+onNewIntent\s*\(\s*Intent\s+(\w+)\s*\)\s*\{)/;
    if (existing.test(updated)) {
      return updated.replace(
        existing,
        `$1\n    ShareContentIntentHolder.offer($2); // ${MAIN_ACTIVITY_MARKER}\n    ShareContentIntentHolder.consume($2);\n    setIntent($2);`
      );
    }

    const method = `
  @Override
  public void onNewIntent(Intent intent) {
    ShareContentIntentHolder.offer(intent); // ${MAIN_ACTIVITY_MARKER}
    ShareContentIntentHolder.consume(intent);
    setIntent(intent);
    super.onNewIntent(intent);
  }
`;
    const closingBrace = updated.lastIndexOf('}');
    if (closingBrace < 0)
      throw new Error('[react-native-share-content] Invalid Java MainActivity.');
    return `${updated.slice(0, closingBrace)}${method}${updated.slice(closingBrace)}`;
  }

  throw new Error(`[react-native-share-content] Unsupported MainActivity language: ${language}`);
}

export const withAndroidShareContent: ConfigPlugin<ResolvedPluginOptions> = (config, options) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = applyAndroidShareConfig(manifestConfig.modResults, options);
    return manifestConfig;
  });

  return withMainActivity(config, (activityConfig) => {
    activityConfig.modResults.contents = applyAndroidMainActivity(
      activityConfig.modResults.contents,
      activityConfig.modResults.language
    );
    return activityConfig;
  });
};
