# npm publishing setup

The workflow in `workflows/publish-npm.yml` publishes only after a pull request:

1. targets `main`;
2. has a current approval from, or is merged by, an allowed npm approver;
3. is merged;
4. passes Jest tests, lint, build, CommonJS verification, and generated-output checks; and
5. contains a package version that does not already exist on npm.

## npm Trusted Publishing

The package uses npm Trusted Publishing with OpenID Connect. No npm token or
GitHub Actions secret is required.

The npm package connection is restricted to:

```text
Provider: GitHub Actions
Repository: ngocdevv/expo-share-content
Workflow: publish-npm.yml
Allowed action: npm publish
```

The workflow grants `id-token: write`, runs on a GitHub-hosted runner, and installs
npm 11.19.0 because Trusted Publishing requires npm 11.5.1 or later with Node
22.14.0 or later. npm 11.19.0 supports Node 22.14.0; npm 12 requires a newer
Node release. The npm package setting disallows bypass-2FA token publishing;
the configured OIDC publisher remains allowed.

## Allowed approvers

By default, only the GitHub repository owner can authorize npm publishing. To allow additional maintainers, create a repository variable named `NPM_APPROVERS` containing comma-separated GitHub logins:

```text
ngocdevv,another-maintainer
```

The pull-request author's own review is never counted. For a solo-maintainer
repository, an allowed npm approver can authorize the release by deliberately
merging the PR; the workflow checks `pull_request.merged_by` against the same
`NPM_APPROVERS` allowlist.

## Versioning

Every release must increment `package.json#version`. If the version already exists on npm, the workflow succeeds without publishing again.
