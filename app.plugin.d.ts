import type { ConfigPlugin } from '@expo/config-plugins';
import type { ExpoShareContentPluginOptions } from './plugin/build/options';

declare const plugin: ConfigPlugin<ExpoShareContentPluginOptions>;
export = plugin;
