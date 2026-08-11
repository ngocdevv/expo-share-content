import type {Config} from '@docusaurus/types';
import type {Options, ThemeConfig} from '@docusaurus/preset-classic';
import {themes as prismThemes} from 'prism-react-renderer';

const config: Config = {
  title: 'Expo Share Content',
  tagline: 'Receive shared content reliably in Expo apps',
  favicon: 'img/favicon.svg',
  url: 'https://ngocdevv.github.io',
  baseUrl: '/React-Native-Share-Content/',
  organizationName: 'ngocdevv',
  projectName: 'React-Native-Share-Content',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          breadcrumbs: true,
          showLastUpdateTime: false,
          editUrl:
            'https://github.com/ngocdevv/React-Native-Share-Content/edit/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Options,
    ],
  ],
  themeConfig: {
    image: 'img/og-image.svg',
    metadata: [
      {
        name: 'keywords',
        content:
          'expo share intent, react native share extension, receive share expo, ios share extension, android action send',
      },
    ],
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Expo Share Content',
      hideOnScroll: false,
      logo: {
        alt: 'Expo Share Content logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          href: '/React-Native-Share-Content/?section=features',
          label: 'Features',
          position: 'left',
        },
        {
          href: '/React-Native-Share-Content/?section=showcase',
          label: 'Example',
          position: 'left',
        },
        {
          href: '/React-Native-Share-Content/?section=faq',
          label: 'FAQ',
          position: 'left',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          label: 'Docs',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/expo-share-content',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/ngocdevv/React-Native-Share-Content',
          label: 'GitHub',
          position: 'right',
          className: 'navbar-github-link',
        },
        {
          to: '/docs/getting-started',
          label: 'Get started →',
          position: 'right',
          className: 'navbar-get-started',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'Getting started', to: '/docs/getting-started'},
            {label: 'Configuration', to: '/docs/configuration'},
            {label: 'API reference', to: '/docs/api-reference'},
          ],
        },
        {
          title: 'Platforms',
          items: [
            {label: 'Android', to: '/docs/platforms/android'},
            {label: 'iOS', to: '/docs/platforms/ios'},
            {label: 'Web', to: '/docs/platforms/web'},
          ],
        },
        {
          title: 'Package',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/ngocdevv/React-Native-Share-Content',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/expo-share-content',
            },
            {
              label: 'License',
              href: 'https://github.com/ngocdevv/React-Native-Share-Content/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} expo-share-content. MIT licensed.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'swift', 'kotlin'],
    },
  } satisfies ThemeConfig,
};

export default config;
