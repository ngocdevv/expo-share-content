# expo-share-content documentation

This directory contains the Docusaurus website for `expo-share-content`.

## Local development

```bash
cd docs
npm install
npm start
```

The development server opens at `http://localhost:3000/expo-share-content/`.

## Production build

```bash
npm run typecheck
npm run build
npm run serve
```

The static output is written to `docs/build/` and is configured for GitHub Pages at
`https://ngocdevv.github.io/expo-share-content/`.

## Deployment

`.github/workflows/deploy-docs.yml` validates pull requests, then builds and deploys the production
artifact when a documentation change reaches `main`. In the repository settings, configure
**Pages → Build and deployment → Source** to **GitHub Actions** before the first deployment.

Documentation source lives in `docs/docs/`. The custom landing page is implemented in
`src/pages/index.tsx`; global design tokens and Docusaurus overrides live in
`src/css/custom.css`.
