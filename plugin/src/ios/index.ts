import {
  type ConfigPlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from '@expo/config-plugins';
import plist from '@expo/plist';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ResolvedPluginOptions } from '../options';
import {
  buildShareExtensionInfoPlist,
  renderShareViewController,
  resolveHostOpenURL,
  resolveIosIdentifiers,
  type IosIdentifiers,
} from './artifacts';

const INFO_PLIST_FILE = 'Info.plist';
const ENTITLEMENTS_FILE = 'ShareExtension.entitlements';
const SWIFT_FILE = 'ShareViewController.swift';
const PRIVACY_FILE = 'PrivacyInfo.xcprivacy';

function appendUnique(values: unknown, value: string): string[] {
  const existing = Array.isArray(values)
    ? values.filter((item): item is string => typeof item === 'string')
    : [];
  return [...new Set([...existing, value])];
}

function registerHostUrlScheme(
  infoPlist: Record<string, any>,
  hostOpenURL: string,
  bundleIdentifier: string
): void {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(hostOpenURL);
  const scheme = match?.[1];
  if (!scheme) return;

  const urlTypes = Array.isArray(infoPlist.CFBundleURLTypes) ? infoPlist.CFBundleURLTypes : [];
  const alreadyRegistered = urlTypes.some(
    (entry: any) =>
      Array.isArray(entry?.CFBundleURLSchemes) && entry.CFBundleURLSchemes.includes(scheme)
  );
  if (!alreadyRegistered) {
    urlTypes.push({
      CFBundleURLName: `${bundleIdentifier}.react-native-share-content`,
      CFBundleURLSchemes: [scheme],
    });
  }
  infoPlist.CFBundleURLTypes = urlTypes;
}

function getIdentity(config: Parameters<ConfigPlugin>[0], options: ResolvedPluginOptions) {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error('[react-native-share-content] expo.ios.bundleIdentifier is required.');
  }
  return resolveIosIdentifiers(
    {
      appName: config.name,
      bundleIdentifier,
    },
    options
  );
}

async function writeExtensionFiles(
  iosRoot: string,
  identifiers: IosIdentifiers,
  options: ResolvedPluginOptions,
  hostOpenURL: string
): Promise<void> {
  const extensionRoot = path.join(iosRoot, identifiers.targetName);
  await fs.mkdir(extensionRoot, { recursive: true });

  const entitlements = {
    'com.apple.security.application-groups': [identifiers.appGroupIdentifier],
  };
  const privacyManifest = {
    NSPrivacyAccessedAPITypes: [],
    NSPrivacyCollectedDataTypes: [],
    NSPrivacyTracking: false,
  };

  await Promise.all([
    fs.writeFile(
      path.join(extensionRoot, INFO_PLIST_FILE),
      plist.build(buildShareExtensionInfoPlist(identifiers, options))
    ),
    fs.writeFile(path.join(extensionRoot, ENTITLEMENTS_FILE), plist.build(entitlements)),
    fs.writeFile(path.join(extensionRoot, PRIVACY_FILE), plist.build(privacyManifest)),
    fs.writeFile(
      path.join(extensionRoot, SWIFT_FILE),
      renderShareViewController(identifiers, options, hostOpenURL)
    ),
  ]);
}

function detectDevelopmentTeam(project: any): string | undefined {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const settings = configurations[key]?.buildSettings;
    const productName = settings?.PRODUCT_NAME?.replaceAll?.('"', '');
    if (!settings || !productName || /Extension|Widget/.test(productName)) continue;
    const team = settings.DEVELOPMENT_TEAM?.replaceAll?.('"', '');
    if (team) return team;
  }
  return undefined;
}

function findNativeTarget(
  project: any,
  targetName: string
): { uuid: string; pbxNativeTarget: any } | null {
  const targets = project.pbxNativeTargetSection();
  let match: { uuid: string; pbxNativeTarget: any } | null = null;
  for (const uuid of Object.keys(targets)) {
    if (uuid.endsWith('_comment')) continue;
    const target = targets[uuid];
    const name = target?.name?.replaceAll?.('"', '');
    if (name !== targetName) continue;
    if (match) {
      throw new Error(
        `[react-native-share-content] Multiple Xcode targets normalize to ${targetName}; refusing ambiguous reconciliation.`
      );
    }
    match = { uuid, pbxNativeTarget: target };
  }
  return match;
}

/** Prefer a real application target; never fall back to the first target blindly. */
function findHostApplicationTarget(
  project: any,
  expectedBundleIdentifier: string
): { uuid: string; pbxNativeTarget: any } | null {
  const targets = project.pbxNativeTargetSection();
  const applications: { uuid: string; pbxNativeTarget: any }[] = [];
  for (const uuid of Object.keys(targets)) {
    if (uuid.endsWith('_comment')) continue;
    const target = targets[uuid];
    if (!target) continue;
    const productType = unquote(target.productType);
    if (productType === 'com.apple.product-type.application') {
      applications.push({ uuid, pbxNativeTarget: target });
    }
  }
  if (applications.length === 1) return applications[0]!;
  if (applications.length === 0) return null;

  const configurations = project.pbxXCBuildConfigurationSection();
  const configurationLists = project.pbxXCConfigurationList();
  const matching = applications.filter(({ pbxNativeTarget }) => {
    const list = configurationLists[pbxNativeTarget.buildConfigurationList];
    return (list?.buildConfigurations ?? []).some((entry: any) => {
      const bundleId = unquote(
        configurations[entry.value]?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER
      );
      return bundleId === expectedBundleIdentifier;
    });
  });
  return matching.length === 1 ? matching[0]! : null;
}

function unquote(value: unknown): string {
  return typeof value === 'string' ? value.replaceAll('"', '') : '';
}

/** Quote the generated React Native bundle-script path before executing it. */
export function fixReactNativeBundleScriptForPathsWithSpaces(project: any): void {
  const phases = project.hash?.project?.objects?.PBXShellScriptBuildPhase ?? {};
  for (const [uuid, phase] of Object.entries<any>(phases)) {
    if (uuid.endsWith('_comment') || !phase || typeof phase.shellScript !== 'string') continue;
    if (!unquote(phase.name).includes('Bundle React Native code and images')) continue;

    let script = phase.shellScript;
    let encoded = false;
    try {
      script = JSON.parse(script);
      encoded = true;
    } catch {
      // Some xcode package versions expose an already-decoded string.
    }
    if (script.includes('REACT_NATIVE_XCODE_SCRIPT=')) continue;

    const unsafe = /`"\$NODE_BINARY" --print "([^"\n]*react-native-xcode\.sh[^"\n]*)"`/;
    const fixed = script.replace(unsafe, (_match: string, expression: string) => {
      return [
        `REACT_NATIVE_XCODE_SCRIPT="$("$NODE_BINARY" --print "${expression}")"`,
        '"$REACT_NATIVE_XCODE_SCRIPT"',
      ].join('\n');
    });
    if (fixed === script) continue;
    phase.shellScript = encoded ? JSON.stringify(fixed) : fixed;
  }
}

export function assertCompatibleExtensionTarget(
  project: any,
  target: { uuid: string; pbxNativeTarget: any },
  targetName: string
): void {
  const productType = unquote(target.pbxNativeTarget.productType);
  if (productType !== 'com.apple.product-type.app-extension') {
    throw new Error(
      `[react-native-share-content] Xcode target ${targetName} already exists but is not an app extension.`
    );
  }

  const productReferenceUuid = target.pbxNativeTarget.productReference;
  const productReference = project.hash.project.objects.PBXFileReference?.[productReferenceUuid];
  const fileType = unquote(
    productReference?.explicitFileType ?? productReference?.lastKnownFileType
  );
  if (!productReference || fileType !== 'wrapper.app-extension') {
    throw new Error(
      `[react-native-share-content] Xcode target ${targetName} has an incompatible product reference.`
    );
  }

  const productPath = unquote(productReference.path ?? productReference.name);
  if (productPath && productPath !== `${targetName}.appex`) {
    throw new Error(
      `[react-native-share-content] Xcode target ${targetName} product reference path ${productPath} does not match ${targetName}.appex.`
    );
  }

  const nativeTargets = project.hash.project.objects.PBXNativeTarget ?? {};
  for (const uuid of Object.keys(nativeTargets)) {
    if (uuid.endsWith('_comment') || uuid === target.uuid) continue;
    const other = nativeTargets[uuid];
    if (other?.productReference === productReferenceUuid) {
      throw new Error(
        `[react-native-share-content] Xcode target ${targetName} reuses a product reference owned by another target.`
      );
    }
  }
}

export function ensureTargetMembership(
  project: any,
  target: { uuid: string; pbxNativeTarget: any },
  productBasename: string
): void {
  const objects = project.hash.project.objects;
  const projectIds = Object.keys(objects.PBXProject ?? {}).filter(
    (key) => !key.endsWith('_comment')
  );
  if (projectIds.length !== 1) {
    throw new Error('[react-native-share-content] Cannot reconcile an ambiguous PBXProject root.');
  }
  const root = objects.PBXProject[projectIds[0]!];
  root.targets ||= [];
  if (!root.targets.some((entry: any) => entry.value === target.uuid)) {
    root.targets.push({ value: target.uuid, comment: unquote(target.pbxNativeTarget.name) });
  }

  const products = findGroup(project, 'Products');
  if (!products) {
    throw new Error('[react-native-share-content] Cannot resolve the Xcode Products group.');
  }
  const productReference = target.pbxNativeTarget.productReference;
  if (!products.group.children.some((entry: any) => entry.value === productReference)) {
    products.group.children.push({ value: productReference, comment: productBasename });
  }
}

/**
 * Ensure the host target owns an Embed App Extensions / Copy Files phase and
 * embeds the extension product exactly once. Never fall back to a global/foreign
 * PBXCopyFilesBuildPhase looked up only by comment name.
 */
export function ensureHostEmbedPhase(
  project: any,
  hostTargetUuid: string,
  productReferenceUuid: string,
  productBasename: string
): void {
  const objects = project.hash.project.objects;
  objects.PBXCopyFilesBuildPhase ||= {};
  objects.PBXBuildFile ||= {};

  const hostNativeTarget = objects.PBXNativeTarget[hostTargetUuid];
  if (!hostNativeTarget) {
    throw new Error(
      `[react-native-share-content] Cannot resolve host Xcode target ${hostTargetUuid}`
    );
  }

  const copySection = objects.PBXCopyFilesBuildPhase;
  let phaseUuid: string | undefined;
  let phase: any | undefined;

  for (const entry of hostNativeTarget.buildPhases ?? []) {
    const candidate = copySection[entry.value];
    if (!candidate) continue;
    const isEmbedExtensions = Number(candidate.dstSubfolderSpec) === 13;
    if (!isEmbedExtensions) continue;
    phaseUuid = entry.value;
    phase = candidate;
    break;
  }

  if (!phase || !phaseUuid) {
    const created = project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      hostTargetUuid,
      'app_extension'
    );
    phase = created.buildPhase;
    phaseUuid =
      created.uuid ??
      Object.keys(copySection).find(
        (uuid) => !uuid.endsWith('_comment') && copySection[uuid] === phase
      );
    if (!phaseUuid) {
      throw new Error(
        '[react-native-share-content] Failed to create host Embed App Extensions phase.'
      );
    }
  }

  phase.files ||= [];
  phase.dstSubfolderSpec = 13;
  phase.name = '"Embed App Extensions"';
  const buildFiles = objects.PBXBuildFile;

  // Remove foreign/double embeds of this product from every host-owned copy phase,
  // then retain at most one entry in the canonical PlugIns phase.
  let retainedBuildFileUuid: string | undefined;
  for (const entry of hostNativeTarget.buildPhases ?? []) {
    const candidate = copySection[entry.value];
    if (!candidate?.files) continue;
    candidate.files = candidate.files.filter((file: any) => {
      const buildFile = buildFiles[file.value];
      if (buildFile?.fileRef !== productReferenceUuid) return true;
      if (entry.value === phaseUuid && !retainedBuildFileUuid) {
        retainedBuildFileUuid = file.value;
        return true;
      }
      return false;
    });
  }
  if (retainedBuildFileUuid) return;

  const buildFileUuid = project.generateUuid();
  const comment = `${productBasename} in Embed App Extensions`;
  buildFiles[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: productReferenceUuid,
    fileRef_comment: productBasename,
    settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
  };
  buildFiles[`${buildFileUuid}_comment`] = comment;
  phase.files.push({ value: buildFileUuid, comment });
}

function findGroup(project: any, groupName: string): { uuid: string; group: any } | null {
  const groups = project.hash.project.objects.PBXGroup;
  for (const uuid of Object.keys(groups)) {
    if (uuid.endsWith('_comment')) continue;
    const group = groups[uuid];
    if (unquote(group?.name ?? groups[`${uuid}_comment`]) === groupName) {
      return { uuid, group };
    }
  }
  return null;
}

function buildFileIsUsed(project: any, buildFileUuid: string): boolean {
  const objects = project.hash.project.objects;
  return Object.keys(objects).some((sectionName) => {
    if (!sectionName.endsWith('BuildPhase')) return false;
    return Object.entries(objects[sectionName] ?? {}).some(([key, phase]: [string, any]) => {
      return (
        !key.endsWith('_comment') &&
        phase?.files?.some((entry: any) => entry.value === buildFileUuid)
      );
    });
  });
}

function addFileReference(project: any, group: any, fileName: string): string {
  const fileReferenceUuid = project.generateUuid();
  const fileReferences = project.hash.project.objects.PBXFileReference;
  const extension = path.extname(fileName).toLowerCase();
  fileReferences[fileReferenceUuid] = {
    isa: 'PBXFileReference',
    fileEncoding: 4,
    lastKnownFileType: extension === '.swift' ? 'sourcecode.swift' : 'text.xml',
    name: fileName,
    path: fileName,
    sourceTree: '"<group>"',
  };
  fileReferences[`${fileReferenceUuid}_comment`] = fileName;
  group.children.push({ value: fileReferenceUuid, comment: fileName });
  return fileReferenceUuid;
}

export function ensureTargetBuildPhase(
  project: any,
  targetUuid: string,
  groupName: string,
  phaseType: string,
  phaseName: string,
  fileNames: string[]
): void {
  const objects = project.hash.project.objects;
  objects[phaseType] ||= {};
  objects.PBXBuildFile ||= {};
  objects.PBXFileReference ||= {};

  const nativeTarget = objects.PBXNativeTarget[targetUuid];
  if (!nativeTarget) {
    throw new Error(`[react-native-share-content] Cannot resolve Xcode target ${targetUuid}`);
  }

  const phaseReference = nativeTarget.buildPhases.find((entry: any) => {
    return unquote(entry.comment) === phaseName && objects[phaseType][entry.value];
  });
  const phase =
    (phaseReference && objects[phaseType][phaseReference.value]) ??
    project.addBuildPhase([], phaseType, phaseName, targetUuid).buildPhase;

  if (fileNames.length === 0) return;
  const groupEntry = findGroup(project, groupName);
  if (!groupEntry) {
    throw new Error(`[react-native-share-content] Cannot resolve Xcode group ${groupName}`);
  }

  const buildFiles = objects.PBXBuildFile;
  for (const fileName of fileNames) {
    const child = groupEntry.group.children.find(
      (entry: any) => unquote(entry.comment) === fileName
    );
    const fileReferenceUuid = child?.value ?? addFileReference(project, groupEntry.group, fileName);
    const alreadyIncluded = phase.files.some((entry: any) => {
      return buildFiles[entry.value]?.fileRef === fileReferenceUuid;
    });
    if (alreadyIncluded) continue;

    const reusableBuildFileUuid = Object.keys(buildFiles).find((uuid) => {
      return (
        !uuid.endsWith('_comment') &&
        buildFiles[uuid]?.fileRef === fileReferenceUuid &&
        !buildFileIsUsed(project, uuid)
      );
    });
    const buildFileUuid = reusableBuildFileUuid ?? project.generateUuid();
    const comment = `${fileName} in ${phaseName}`;
    if (!reusableBuildFileUuid) {
      buildFiles[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: fileReferenceUuid,
        fileRef_comment: fileName,
      };
      buildFiles[`${buildFileUuid}_comment`] = comment;
    }
    phase.files.push({ value: buildFileUuid, comment });
  }
}

export function addExtensionTarget(
  project: any,
  identifiers: IosIdentifiers,
  options: ResolvedPluginOptions,
  version: string,
  buildNumber: string,
  hostBundleIdentifier: string
): void {
  const sourceFiles = [SWIFT_FILE];
  const resourceFiles = [PRIVACY_FILE];
  const allFiles = [...sourceFiles, ...resourceFiles, INFO_PLIST_FILE, ENTITLEMENTS_FILE];
  if (!project.pbxGroupByName(identifiers.targetName)) {
    // Start with an empty group. Adding bare filenames through xcode.addPbxGroup can
    // globally reuse an unrelated host file reference with the same basename.
    const created = project.addPbxGroup([], identifiers.targetName, identifiers.targetName);
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      const candidate = groups[key];
      if (
        typeof candidate === 'object' &&
        candidate &&
        candidate.name === undefined &&
        candidate.path === undefined
      ) {
        project.addToPbxGroup(created.uuid, key);
      }
    }
    const groupEntry = findGroup(project, identifiers.targetName);
    if (!groupEntry) {
      throw new Error(
        `[react-native-share-content] Cannot create Xcode group ${identifiers.targetName}`
      );
    }
    for (const fileName of allFiles) addFileReference(project, groupEntry.group, fileName);
  }

  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ||= {};
  objects.PBXContainerItemProxy ||= {};

  const target =
    findNativeTarget(project, identifiers.targetName) ??
    project.addTarget(identifiers.targetName, 'app_extension', identifiers.targetName);

  if (!target.uuid) {
    throw new Error(
      `[react-native-share-content] Cannot resolve Xcode target ${identifiers.targetName}`
    );
  }
  assertCompatibleExtensionTarget(project, target, identifiers.targetName);
  ensureTargetMembership(project, target, `${identifiers.targetName}.appex`);

  ensureTargetBuildPhase(
    project,
    target.uuid,
    identifiers.targetName,
    'PBXSourcesBuildPhase',
    'Sources',
    sourceFiles
  );
  ensureTargetBuildPhase(
    project,
    target.uuid,
    identifiers.targetName,
    'PBXResourcesBuildPhase',
    'Resources',
    resourceFiles
  );
  ensureTargetBuildPhase(
    project,
    target.uuid,
    identifiers.targetName,
    'PBXFrameworksBuildPhase',
    'Frameworks',
    []
  );

  const hostTarget = findHostApplicationTarget(project, hostBundleIdentifier);
  if (!hostTarget) {
    throw new Error(
      '[react-native-share-content] Could not find the host application target to embed the Share Extension.'
    );
  }
  const hostNativeTarget = project.pbxNativeTargetSection()[hostTarget.uuid];
  if (!hostNativeTarget) {
    throw new Error(
      '[react-native-share-content] Host application target is missing from the Xcode project.'
    );
  }
  const dependencySection = objects.PBXTargetDependency;
  let retainedDependency = false;
  hostNativeTarget.dependencies = (hostNativeTarget.dependencies ?? []).filter(
    (dependency: any) => {
      if (dependencySection[dependency.value]?.target !== target.uuid) return true;
      if (!retainedDependency) {
        retainedDependency = true;
        return true;
      }
      return false;
    }
  );
  if (!retainedDependency) {
    project.addTargetDependency(hostTarget.uuid, [target.uuid]);
  }

  ensureHostEmbedPhase(
    project,
    hostTarget.uuid,
    target.pbxNativeTarget.productReference,
    `${identifiers.targetName}.appex`
  );

  const developmentTeam = detectDevelopmentTeam(project);
  const configurations = project.pbxXCBuildConfigurationSection();
  const configurationList =
    project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
  const targetConfigurationIds = new Set(
    configurationList.buildConfigurations.map((item: any) => item.value)
  );
  for (const key of Object.keys(configurations)) {
    if (!targetConfigurationIds.has(key)) continue;
    const settings = configurations[key]?.buildSettings;
    if (!settings) continue;

    settings.APPLICATION_EXTENSION_API_ONLY = 'YES';
    settings.CODE_SIGN_ENTITLEMENTS = `"${identifiers.targetName}/${ENTITLEMENTS_FILE}"`;
    settings.CODE_SIGN_STYLE = 'Automatic';
    settings.CURRENT_PROJECT_VERSION = `"${buildNumber}"`;
    settings.GENERATE_INFOPLIST_FILE = 'NO';
    settings.INFOPLIST_FILE = `"${identifiers.targetName}/${INFO_PLIST_FILE}"`;
    settings.IPHONEOS_DEPLOYMENT_TARGET = options.iosDeploymentTarget;
    settings.MARKETING_VERSION = `"${version}"`;
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${identifiers.bundleIdentifier}"`;
    settings.PRODUCT_NAME = `"${identifiers.targetName}"`;
    settings.SKIP_INSTALL = 'YES';
    settings.SWIFT_VERSION = '5.0';
    settings.TARGETED_DEVICE_FAMILY = '"1,2"';
    if (developmentTeam) settings.DEVELOPMENT_TEAM = developmentTeam;
  }

  if (developmentTeam) {
    project.addTargetAttribute('DevelopmentTeam', developmentTeam, target);
  }
}

function withEasExtensionConfig(
  config: Parameters<ConfigPlugin>[0],
  identifiers: IosIdentifiers
): Parameters<ConfigPlugin>[0] {
  config.extra ??= {};
  const extra = config.extra as Record<string, any>;
  extra.eas ??= {};
  extra.eas.build ??= {};
  extra.eas.build.experimental ??= {};
  extra.eas.build.experimental.ios ??= {};
  extra.eas.build.experimental.ios.appExtensions ??= [];

  const extensions = extra.eas.build.experimental.ios.appExtensions as any[];
  const extension = extensions.find((item) => item.targetName === identifiers.targetName);
  const value = {
    targetName: identifiers.targetName,
    bundleIdentifier: identifiers.bundleIdentifier,
    entitlements: {
      'com.apple.security.application-groups': [identifiers.appGroupIdentifier],
    },
  };
  if (extension) Object.assign(extension, value);
  else extensions.push(value);
  return config;
}

export const withIosShareContent: ConfigPlugin<ResolvedPluginOptions> = (config, options) => {
  const identifiers = getIdentity(config, options);
  const hostOpenURL = resolveHostOpenURL(config.scheme, options);
  withEasExtensionConfig(config, identifiers);

  config = withInfoPlist(config, (infoConfig) => {
    infoConfig.modResults.ExpoShareContentAppGroup = identifiers.appGroupIdentifier;
    if (hostOpenURL) {
      registerHostUrlScheme(
        infoConfig.modResults,
        hostOpenURL,
        config.ios?.bundleIdentifier ?? identifiers.bundleIdentifier
      );
    }
    return infoConfig;
  });

  config = withEntitlementsPlist(config, (entitlementsConfig) => {
    entitlementsConfig.modResults['com.apple.security.application-groups'] = appendUnique(
      entitlementsConfig.modResults['com.apple.security.application-groups'],
      identifiers.appGroupIdentifier
    );
    return entitlementsConfig;
  });

  // Paths containing spaces break Expo EXConstants' bash -l -c script phase.
  // Keep a Podfile post_install fix across prebuild regenerations.
  config = withExConstantsPathSpaceFix(config);

  return withXcodeProject(config, async (projectConfig) => {
    await writeExtensionFiles(
      projectConfig.modRequest.platformProjectRoot,
      identifiers,
      options,
      hostOpenURL
    );
    fixReactNativeBundleScriptForPathsWithSpaces(projectConfig.modResults);
    addExtensionTarget(
      projectConfig.modResults,
      identifiers,
      options,
      config.version ?? '1.0.0',
      config.ios?.buildNumber ?? '1',
      config.ios?.bundleIdentifier ?? ''
    );
    return projectConfig;
  });
};

const EXCONSTANTS_FIX_MARKER = 'fix_exconstants_script_phase_for_paths_with_spaces';

const EXCONSTANTS_FIX_METHOD = `
def fix_exconstants_script_phase_for_paths_with_spaces!(installer)
  # Expo EXConstants defaults to bash -l -c "$PODS_TARGET_SRCROOT/...".
  # Paths with spaces split under bash -c. Invoke the script with a quoted path.
  # CocoaPods often prefixes the phase name with "[CP-User] ".
  installer.pods_project.targets.each do |target|
    next unless target.name == 'EXConstants'
    target.build_phases.each do |phase|
      next unless phase.respond_to?(:name) && phase.name
      next unless phase.name.to_s.include?('Generate app.config for prebuilt Constants.manifest')
      phase.shell_script = "\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"\\n"
    end
  end
  installer.pods_project.save
end
`.trim();

const withExConstantsPathSpaceFix: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      let contents = await fs.readFile(podfilePath, 'utf8');

      if (!contents.includes(EXCONSTANTS_FIX_METHOD.split('\n')[0]!)) {
        // Insert helper before the first target/post_install if possible.
        const insertAt = contents.indexOf('post_install do |installer|');
        if (insertAt === -1) {
          contents = `${contents.trimEnd()}\n\n${EXCONSTANTS_FIX_METHOD}\n`;
        } else {
          contents = `${contents.slice(0, insertAt)}${EXCONSTANTS_FIX_METHOD}\n\n${contents.slice(insertAt)}`;
        }
      }

      if (contents.includes('post_install do |installer|')) {
        contents = contents.replace(
          /post_install do \|installer\|([\s\S]*?)\n  end/,
          (match, body: string) => {
            if (body.includes(EXCONSTANTS_FIX_MARKER)) return match;
            const indentedCall = `\n    ${EXCONSTANTS_FIX_MARKER}!(installer)`;
            return `post_install do |installer|${body}${indentedCall}\n  end`;
          }
        );
      } else {
        contents += `\n\npost_install do |installer|\n  ${EXCONSTANTS_FIX_MARKER}!(installer)\nend\n`;
      }

      await fs.writeFile(podfilePath, contents);
      return modConfig;
    },
  ]);
};
