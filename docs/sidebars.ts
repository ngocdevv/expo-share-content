import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'getting-started',
    {
      type: 'category',
      label: 'Fundamentals',
      items: ['fundamentals/how-it-works', 'fundamentals/delivery-lifecycle'],
    },
    {
      type: 'category',
      label: 'Platforms',
      items: ['platforms/android', 'platforms/ios'],
    },
    'configuration',
    'api-reference',
    'security-and-limits',
    'troubleshooting',
  ],
};

export default sidebars;
