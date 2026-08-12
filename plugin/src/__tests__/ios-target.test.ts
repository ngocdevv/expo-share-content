import {
  assertCompatibleExtensionTarget,
  ensureHostEmbedPhase,
  ensureTargetBuildPhase,
  fixReactNativeBundleScriptForPathsWithSpaces,
} from '../ios';

function createProject(hasExtensionPhase: boolean) {
  const extensionBuildPhases = hasExtensionPhase
    ? [{ value: 'EXT_SOURCES', comment: 'Sources' }]
    : [];
  const objects: Record<string, any> = {
    PBXNativeTarget: {
      EXT: { buildPhases: extensionBuildPhases },
    },
    PBXSourcesBuildPhase: {
      HOST_SOURCES: { isa: 'PBXSourcesBuildPhase', files: [] },
      HOST_SOURCES_comment: 'Sources',
      ...(hasExtensionPhase
        ? {
            EXT_SOURCES: { isa: 'PBXSourcesBuildPhase', files: [] },
            EXT_SOURCES_comment: 'Sources',
          }
        : {}),
    },
    PBXGroup: {
      GROUP: {
        isa: 'PBXGroup',
        children: [{ value: 'SWIFT_REF', comment: 'ShareViewController.swift' }],
        name: 'ExampleShare',
        path: 'ExampleShare',
      },
      GROUP_comment: 'ExampleShare',
    },
    PBXFileReference: {
      SWIFT_REF: {
        isa: 'PBXFileReference',
        path: 'ShareViewController.swift',
        sourceTree: '"<group>"',
      },
      SWIFT_REF_comment: 'ShareViewController.swift',
    },
    PBXBuildFile: {},
  };

  const project = {
    hash: { project: { objects } },
    generateUuid: jest.fn(() => 'GENERATED_BUILD_FILE'),
    addBuildPhase: jest.fn((files: string[], type: string, comment: string, targetUuid: string) => {
      expect(targetUuid).toBe('EXT');
      expect(type).toBe('PBXSourcesBuildPhase');
      const buildPhase = {
        isa: type,
        files: files.map((file) => ({ value: `BUILD_${file}`, comment: `${file} in Sources` })),
      };
      objects.PBXSourcesBuildPhase.EXT_SOURCES = buildPhase;
      objects.PBXSourcesBuildPhase.EXT_SOURCES_comment = comment;
      objects.PBXNativeTarget.EXT.buildPhases.push({ value: 'EXT_SOURCES', comment });
      return { uuid: 'EXT_SOURCES', buildPhase };
    }),
  };

  return { objects, project };
}

describe('iOS target build phase reconciliation', () => {
  it('creates a target-scoped phase even when the host has a phase with the same name', () => {
    const { project } = createProject(false);

    ensureTargetBuildPhase(project, 'EXT', 'ExampleShare', 'PBXSourcesBuildPhase', 'Sources', [
      'ShareViewController.swift',
    ]);

    expect(project.addBuildPhase).toHaveBeenCalledTimes(1);
  });

  it('repairs missing file membership without duplicating it on rerun', () => {
    const { objects, project } = createProject(true);

    for (let index = 0; index < 2; index += 1) {
      ensureTargetBuildPhase(project, 'EXT', 'ExampleShare', 'PBXSourcesBuildPhase', 'Sources', [
        'ShareViewController.swift',
      ]);
    }

    expect(project.addBuildPhase).not.toHaveBeenCalled();
    expect(objects.PBXSourcesBuildPhase.EXT_SOURCES.files).toHaveLength(1);
    const buildFile = objects.PBXBuildFile.GENERATED_BUILD_FILE;
    expect(buildFile.fileRef).toBe('SWIFT_REF');
  });

  it('rejects a target-name collision with a non-extension product', () => {
    const project = {
      hash: {
        project: {
          objects: {
            PBXFileReference: {
              APP_PRODUCT: {
                explicitFileType: 'wrapper.application',
              },
            },
            PBXNativeTarget: {
              APP_TARGET: {
                productReference: 'APP_PRODUCT',
                productType: 'com.apple.product-type.application',
              },
            },
          },
        },
      },
    };
    const target = {
      uuid: 'APP_TARGET',
      pbxNativeTarget: {
        productReference: 'APP_PRODUCT',
        productType: 'com.apple.product-type.application',
      },
    };

    expect(() => assertCompatibleExtensionTarget(project, target, 'ExampleShare')).toThrow(
      'already exists but is not an app extension'
    );
  });

  it('rejects an extension product reference owned by another target', () => {
    const project = {
      hash: {
        project: {
          objects: {
            PBXFileReference: {
              OTHER_APPEX: {
                explicitFileType: 'wrapper.app-extension',
                path: 'OtherExtension.appex',
              },
            },
            PBXNativeTarget: {
              OTHER: {
                name: 'OtherExtension',
                productReference: 'OTHER_APPEX',
                productType: 'com.apple.product-type.app-extension',
              },
              EXT: {
                name: 'ExampleShare',
                productReference: 'OTHER_APPEX',
                productType: 'com.apple.product-type.app-extension',
              },
            },
          },
        },
      },
    };
    const target = {
      uuid: 'EXT',
      pbxNativeTarget: project.hash.project.objects.PBXNativeTarget.EXT,
    };

    expect(() => assertCompatibleExtensionTarget(project, target, 'ExampleShare')).toThrow(
      'product reference'
    );
  });

  it('restores a host-owned embed phase instead of a foreign Copy Files phase', () => {
    const objects: Record<string, any> = {
      PBXNativeTarget: {
        HOST: {
          name: 'Host',
          buildPhases: [],
          dependencies: [],
        },
        EXT: {
          name: 'ExampleShare',
          productReference: 'EXT_PRODUCT',
          productType: 'com.apple.product-type.app-extension',
          buildPhases: [],
        },
      },
      PBXCopyFilesBuildPhase: {
        FOREIGN: {
          isa: 'PBXCopyFilesBuildPhase',
          buildActionMask: 2147483647,
          dstPath: '""',
          dstSubfolderSpec: 13,
          files: [],
          name: '"Copy Files"',
          runOnlyForDeploymentPostprocessing: 0,
        },
        FOREIGN_comment: 'Copy Files',
      },
      PBXBuildFile: {},
      PBXFileReference: {
        EXT_PRODUCT: {
          explicitFileType: 'wrapper.app-extension',
          path: 'ExampleShare.appex',
        },
      },
      PBXTargetDependency: {},
      PBXContainerItemProxy: {},
    };

    let generated = 0;
    const project = {
      hash: { project: { objects } },
      generateUuid: jest.fn(() => `UUID_${++generated}`),
      getFirstTarget: () => ({ uuid: 'HOST' }),
      pbxNativeTargetSection: () => objects.PBXNativeTarget,
      pbxBuildFileSection: () => objects.PBXBuildFile,
      addBuildPhase: jest.fn(
        (_files: string[], type: string, comment: string, targetUuid: string, options?: string) => {
          expect(targetUuid).toBe('HOST');
          expect(type).toBe('PBXCopyFilesBuildPhase');
          expect(options).toBe('app_extension');
          const uuid = 'HOST_EMBED';
          const buildPhase = {
            isa: type,
            buildActionMask: 2147483647,
            dstPath: '""',
            dstSubfolderSpec: 13,
            files: [] as { value: string; comment?: string }[],
            name: `"${comment}"`,
            runOnlyForDeploymentPostprocessing: 0,
          };
          objects.PBXCopyFilesBuildPhase[uuid] = buildPhase;
          objects.PBXCopyFilesBuildPhase[`${uuid}_comment`] = comment;
          objects.PBXNativeTarget.HOST.buildPhases.push({ value: uuid, comment });
          return { uuid, buildPhase };
        }
      ),
      addToPbxBuildFileSection: jest.fn((file: any) => {
        objects.PBXBuildFile[file.uuid] = {
          isa: 'PBXBuildFile',
          fileRef: file.fileRef,
        };
      }),
      addToPbxCopyfilesBuildPhase: jest.fn(),
      pbxCopyfilesBuildPhaseObj: jest.fn(() => objects.PBXCopyFilesBuildPhase.FOREIGN),
    };

    for (let index = 0; index < 2; index += 1) {
      ensureHostEmbedPhase(project, 'HOST', 'EXT_PRODUCT', 'ExampleShare.appex');
    }

    expect(project.addBuildPhase).toHaveBeenCalledTimes(1);
    expect(objects.PBXNativeTarget.HOST.buildPhases).toHaveLength(1);
    expect(objects.PBXCopyFilesBuildPhase.HOST_EMBED.files).toHaveLength(1);
    expect(objects.PBXCopyFilesBuildPhase.FOREIGN.files).toHaveLength(0);
    expect(project.pbxCopyfilesBuildPhaseObj).not.toHaveBeenCalled();
  });

  it('quotes the generated React Native bundle script path idempotently', () => {
    const original = [
      'export PROJECT_ROOT="$PROJECT_DIR"/..',
      "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\"`",
    ].join('\n');
    const phase = {
      name: '"Bundle React Native code and images"',
      shellScript: JSON.stringify(original),
    };
    const project = {
      hash: {
        project: {
          objects: {
            PBXShellScriptBuildPhase: { BUNDLE: phase },
          },
        },
      },
    };

    fixReactNativeBundleScriptForPathsWithSpaces(project);
    fixReactNativeBundleScriptForPathsWithSpaces(project);

    const fixed = JSON.parse(phase.shellScript);
    expect(fixed).toContain('REACT_NATIVE_XCODE_SCRIPT=');
    expect(fixed).toContain('"$REACT_NATIVE_XCODE_SCRIPT"');
    expect(fixed).not.toContain('`"$NODE_BINARY"');
    expect(fixed.match(/REACT_NATIVE_XCODE_SCRIPT=/g)).toHaveLength(1);
  });
});
