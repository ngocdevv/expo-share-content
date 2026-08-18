import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedPluginOptions } from '../options';

export type IosAppIdentity = {
  appName: string;
  bundleIdentifier: string;
};

export type IosIdentifiers = {
  appGroupIdentifier: string;
  bundleIdentifier: string;
  displayName: string;
  targetName: string;
};

export function resolveIosIdentifiers(
  identity: IosAppIdentity,
  options: ResolvedPluginOptions
): IosIdentifiers {
  if (!identity.bundleIdentifier) {
    throw new Error('[react-native-share-content] expo.ios.bundleIdentifier is required.');
  }

  const displayName = options.iosShareExtensionName;
  const targetName = displayName.replace(/[^a-zA-Z0-9]/g, '');
  if (!targetName) {
    throw new Error(
      '[react-native-share-content] iosShareExtensionName must contain letters or numbers.'
    );
  }

  return {
    appGroupIdentifier: options.iosAppGroupIdentifier ?? `group.${identity.bundleIdentifier}`,
    bundleIdentifier: resolveShareExtensionBundleIdentifier(
      identity.bundleIdentifier,
      options.iosShareExtensionBundleIdentifier
    ),
    displayName,
    targetName,
  };
}

function resolveShareExtensionBundleIdentifier(
  hostBundleIdentifier: string,
  override: string | undefined
): string {
  const value = override?.trim() || `${hostBundleIdentifier}.share`;
  if (value === hostBundleIdentifier) {
    throw new Error(
      '[react-native-share-content] iosShareExtensionBundleIdentifier must differ from the host bundle identifier.'
    );
  }
  if (!value.startsWith(`${hostBundleIdentifier}.`)) {
    throw new Error(
      `[react-native-share-content] iosShareExtensionBundleIdentifier must be prefixed by the host bundle identifier (${hostBundleIdentifier}.).`
    );
  }
  return value;
}

export function buildShareExtensionInfoPlist(
  identifiers: IosIdentifiers,
  options: ResolvedPluginOptions
): Record<string, unknown> {
  return {
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleDisplayName: identifiers.displayName,
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: '$(PRODUCT_NAME)',
    CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    ExpoShareContentAppGroup: identifiers.appGroupIdentifier,
    NSExtension: {
      NSExtensionAttributes: {
        NSExtensionActivationRule: options.iosActivationRules,
      },
      NSExtensionPointIdentifier: 'com.apple.share-services',
      NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).ShareViewController',
    },
  };
}

function swiftString(value: string): string {
  return JSON.stringify(value)
    .replace(/\\u2028/g, '\\u{2028}')
    .replace(/\\u2029/g, '\\u{2029}');
}

function maxFileSizeExpression(bytes: number): string {
  const megabyte = 1024 * 1024;
  return bytes % megabyte === 0 ? `${bytes / megabyte} * 1024 * 1024` : String(bytes);
}

/**
 * Build the URL the Share Extension uses to return to the host app.
 * Empty string disables auto-open.
 */
export function resolveHostOpenURL(
  schemeFromConfig: string | string[] | undefined,
  options: ResolvedPluginOptions
): string {
  if (!options.iosOpenHostAppAfterShare) {
    return '';
  }

  const raw =
    options.iosHostUrlScheme?.trim() ||
    (typeof schemeFromConfig === 'string'
      ? schemeFromConfig.trim()
      : Array.isArray(schemeFromConfig)
        ? String(
            schemeFromConfig.find((item) => typeof item === 'string' && item.trim()) ?? ''
          ).trim()
        : '');

  if (!raw) {
    return '';
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }

  return `${raw}://share`;
}

export function renderShareViewController(
  identifiers: IosIdentifiers,
  options: ResolvedPluginOptions,
  hostOpenURL = ''
): string {
  const templatePath = path.join(__dirname, 'ShareViewController.swift');
  const template = fs.readFileSync(templatePath, 'utf8');

  return template
    .replaceAll('__APP_GROUP__', swiftString(identifiers.appGroupIdentifier))
    .replaceAll('__MAX_ITEMS__', String(options.maxSharedItems))
    .replaceAll('__MAX_FILE_SIZE__', maxFileSizeExpression(options.maxSharedFileSize))
    .replaceAll('__MAX_TOTAL_SIZE__', maxFileSizeExpression(options.maxSharedTotalSize))
    .replaceAll('__HOST_OPEN_URL__', swiftString(hostOpenURL));
}
