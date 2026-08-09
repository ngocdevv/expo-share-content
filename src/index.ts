// Reexport the native module. On web, it will be resolved to ExpoShareContentModule.web.ts
// and on native platforms to ExpoShareContentModule.ts
export { default } from './ExpoShareContentModule';
export * from './ExpoShareContent.types';
