import { type ConfigPlugin, createRunOncePlugin, withPlugins } from '@expo/config-plugins';

import { withAndroidShareContent } from './android';
import { withIosShareContent } from './ios';
import { type ExpoShareContentPluginOptions, resolvePluginOptions } from './options';

const withExpoShareContent: ConfigPlugin<ExpoShareContentPluginOptions | void> = (
  config,
  rawOptions
) => {
  const options = resolvePluginOptions(rawOptions ?? {});
  return withPlugins(config, [
    [withAndroidShareContent, options],
    [withIosShareContent, options],
  ]);
};

export { resolvePluginOptions } from './options';
export type { ExpoShareContentPluginOptions } from './options';

export default createRunOncePlugin(withExpoShareContent, 'react-native-share-content', '0.1.0');
