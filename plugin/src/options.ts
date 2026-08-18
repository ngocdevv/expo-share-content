export type IosActivationRules = Record<string, boolean | number | string> | string;

export type ExpoShareContentPluginOptions = {
  androidIntentFilters?: string[];
  androidMultiIntentFilters?: string[];
  iosActivationRules?: IosActivationRules;
  iosAppGroupIdentifier?: string;
  iosShareExtensionName?: string;
  iosShareExtensionBundleIdentifier?: string;
  iosDeploymentTarget?: string;
  /**
   * After the Share Extension commits a share, optionally open the host app via URL scheme.
   * Default: false. Apple does not officially support Share Extensions foregrounding the
   * containing app; enable only as best-effort and expect App Store/reliability limits.
   */
  iosOpenHostAppAfterShare?: boolean;
  /**
   * Host URL scheme used to return to the app after sharing, e.g. `"myapp"` or
   * `"myapp://share"`. Defaults to `expo.scheme` when omitted.
   */
  iosHostUrlScheme?: string;
  maxSharedItems?: number;
  maxSharedFileSize?: number;
  /** Aggregate binary bytes accepted in one share. Default: 250 MiB. */
  maxSharedTotalSize?: number;
};

export type ResolvedPluginOptions = Required<
  Omit<
    ExpoShareContentPluginOptions,
    'iosAppGroupIdentifier' | 'iosShareExtensionBundleIdentifier' | 'iosHostUrlScheme'
  >
> &
  Pick<
    ExpoShareContentPluginOptions,
    'iosAppGroupIdentifier' | 'iosShareExtensionBundleIdentifier' | 'iosHostUrlScheme'
  >;

const DEFAULT_ANDROID_INTENT_FILTERS = ['text/*', 'image/*', 'video/*', 'audio/*', 'application/*'];

const DEFAULT_ANDROID_MULTI_INTENT_FILTERS = ['image/*', 'video/*', 'audio/*', 'application/*'];

const DEFAULT_IOS_ACTIVATION_RULES: Record<string, boolean | number> = {
  NSExtensionActivationSupportsText: true,
  NSExtensionActivationSupportsWebURLWithMaxCount: 1,
  NSExtensionActivationSupportsImageWithMaxCount: 10,
  NSExtensionActivationSupportsMovieWithMaxCount: 10,
  NSExtensionActivationSupportsFileWithMaxCount: 10,
};

const MIME_TYPE_PATTERN = /^(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*)\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/i;
const ANDROID_MANIFEST_INTEGER_MAX = 2_147_483_647;
const IOS_ACTIVATION_RULE_TYPES = {
  NSExtensionActivationSupportsAttachmentsWithMaxCount: 'count',
  NSExtensionActivationSupportsAttachmentsWithMinCount: 'count',
  NSExtensionActivationSupportsFileWithMaxCount: 'count',
  NSExtensionActivationSupportsImageWithMaxCount: 'count',
  NSExtensionActivationSupportsMovieWithMaxCount: 'count',
  NSExtensionActivationSupportsText: 'boolean',
  NSExtensionActivationSupportsWebPageWithMaxCount: 'count',
  NSExtensionActivationSupportsWebURLWithMaxCount: 'count',
} as const;

function validateMimeTypes(values: readonly string[]): void {
  for (const value of values) {
    if (!MIME_TYPE_PATTERN.test(value)) {
      throw new Error(`[react-native-share-content] Invalid Android MIME type: ${value}`);
    }
  }
}

function assertPositiveInteger(value: number, optionName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ANDROID_MANIFEST_INTEGER_MAX) {
    throw new Error(
      `[react-native-share-content] ${optionName} must be a positive integer no greater than ${ANDROID_MANIFEST_INTEGER_MAX}.`
    );
  }
}

function validateIosActivationRules(value: IosActivationRules | undefined): void {
  if (value === undefined) return;
  if (typeof value === 'string') {
    if (!value.trim()) {
      throw new Error(
        '[react-native-share-content] iosActivationRules predicate must not be empty.'
      );
    }
    if (/\bTRUEPREDICATE\b/i.test(value)) {
      throw new Error(
        '[react-native-share-content] iosActivationRules must not contain TRUEPREDICATE in production builds.'
      );
    }
    return;
  }

  if (Object.keys(value).length === 0) {
    throw new Error(
      '[react-native-share-content] iosActivationRules must not be an empty dictionary.'
    );
  }
  for (const [key, ruleValue] of Object.entries(value)) {
    const expectedType = IOS_ACTIVATION_RULE_TYPES[key as keyof typeof IOS_ACTIVATION_RULE_TYPES];
    if (!expectedType) {
      throw new Error(`[react-native-share-content] Unsupported iosActivationRules key: ${key}`);
    }
    if (expectedType === 'boolean') {
      if (typeof ruleValue !== 'boolean') {
        throw new Error(`[react-native-share-content] ${key} must be a boolean.`);
      }
      continue;
    }
    if (!Number.isSafeInteger(ruleValue) || Number(ruleValue) <= 0) {
      throw new Error(`[react-native-share-content] ${key} must be a positive integer.`);
    }
  }
}

function validateIosOptions(options: ExpoShareContentPluginOptions): void {
  validateIosActivationRules(options.iosActivationRules);
  if (options.iosShareExtensionName !== undefined && !options.iosShareExtensionName.trim()) {
    throw new Error('[react-native-share-content] iosShareExtensionName must not be empty.');
  }
  if (
    options.iosDeploymentTarget !== undefined &&
    !/^\d+(?:\.\d+){0,2}$/.test(options.iosDeploymentTarget)
  ) {
    throw new Error(
      '[react-native-share-content] iosDeploymentTarget must be a numeric version such as "16.4".'
    );
  }
  if (options.iosDeploymentTarget !== undefined) {
    const [major = 0, minor = 0] = options.iosDeploymentTarget
      .split('.')
      .map((part) => Number(part));
    if (major < 16 || (major === 16 && minor < 4)) {
      throw new Error(
        '[react-native-share-content] iosDeploymentTarget must be iOS 16.4 or newer.'
      );
    }
  }
  if (
    options.iosAppGroupIdentifier !== undefined &&
    !/^group\.[A-Za-z0-9][A-Za-z0-9.-]*$/.test(options.iosAppGroupIdentifier)
  ) {
    throw new Error(
      '[react-native-share-content] iosAppGroupIdentifier must start with "group." and use identifier-safe characters.'
    );
  }
  if (
    options.iosShareExtensionBundleIdentifier !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(options.iosShareExtensionBundleIdentifier)
  ) {
    throw new Error(
      '[react-native-share-content] iosShareExtensionBundleIdentifier is not a valid bundle identifier.'
    );
  }
  if (options.iosHostUrlScheme !== undefined) {
    const scheme = options.iosHostUrlScheme.trim();
    if (!scheme) {
      throw new Error(
        '[react-native-share-content] iosHostUrlScheme must not be empty when provided.'
      );
    }
    // Accept bare schemes (myapp) or full URL prefixes (myapp://share).
    if (!/^[A-Za-z][A-Za-z0-9+.-]*(?::\/\/[\S]*)?$/.test(scheme)) {
      throw new Error(
        '[react-native-share-content] iosHostUrlScheme must be a URL scheme such as "myapp" or "myapp://share".'
      );
    }
  }
}

export function resolvePluginOptions(
  options: ExpoShareContentPluginOptions = {}
): ResolvedPluginOptions {
  const androidIntentFilters = options.androidIntentFilters ?? [...DEFAULT_ANDROID_INTENT_FILTERS];
  const androidMultiIntentFilters = options.androidMultiIntentFilters ?? [
    ...DEFAULT_ANDROID_MULTI_INTENT_FILTERS,
  ];

  validateMimeTypes(androidIntentFilters);
  validateMimeTypes(androidMultiIntentFilters);
  validateIosOptions(options);

  const maxSharedItems = options.maxSharedItems ?? 20;
  const maxSharedFileSize = options.maxSharedFileSize ?? 100 * 1024 * 1024;
  const maxSharedTotalSize = options.maxSharedTotalSize ?? 250 * 1024 * 1024;
  const iosActivationRules = options.iosActivationRules ?? { ...DEFAULT_IOS_ACTIVATION_RULES };
  assertPositiveInteger(maxSharedItems, 'maxSharedItems');
  assertPositiveInteger(maxSharedFileSize, 'maxSharedFileSize');
  assertPositiveInteger(maxSharedTotalSize, 'maxSharedTotalSize');
  if (
    iosActivationRules &&
    typeof iosActivationRules === 'object' &&
    Object.values(iosActivationRules).some(
      (value) => typeof value === 'number' && value > maxSharedItems
    )
  ) {
    throw new Error(
      '[react-native-share-content] iOS activation-rule item counts must not exceed maxSharedItems.'
    );
  }
  if (maxSharedTotalSize < maxSharedFileSize) {
    throw new Error(
      '[react-native-share-content] maxSharedTotalSize must be greater than or equal to maxSharedFileSize.'
    );
  }

  return {
    androidIntentFilters,
    androidMultiIntentFilters,
    iosActivationRules,
    iosAppGroupIdentifier: options.iosAppGroupIdentifier,
    iosShareExtensionName: options.iosShareExtensionName ?? 'ShareExtension',
    iosShareExtensionBundleIdentifier: options.iosShareExtensionBundleIdentifier,
    iosDeploymentTarget: options.iosDeploymentTarget ?? '16.4',
    iosOpenHostAppAfterShare: options.iosOpenHostAppAfterShare ?? false,
    iosHostUrlScheme: options.iosHostUrlScheme,
    maxSharedItems,
    maxSharedFileSize,
    maxSharedTotalSize,
  };
}
