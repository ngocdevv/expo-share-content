# npm publishing setup

The workflow in `workflows/publish-npm.yml` publishes only after a pull request:

1. targets `main`;
2. has a current approval from an allowed npm approver;
3. is merged;
4. passes tests, lint, build, CommonJS verification, and generated-output checks; and
5. contains a package version that does not already exist on npm.

## Required repository secret

Create an npm granular access token with read/write access to `expo-share-content`, then add it as this GitHub Actions repository secret:

```text
NPM_TOKEN
```

Use an expiring granular token and enable the npm option that permits CI publishing when the account requires two-factor authentication. Never commit the token or place it in a repository variable.

For the first publication, npm may require a manual publish before package-scoped granular permissions or Trusted Publishing can be configured. After the package exists, prefer configuring npm Trusted Publishing for this repository/workflow and removing the long-lived token.

## Allowed approvers

By default, only the GitHub repository owner can authorize npm publishing. To allow additional maintainers, create a repository variable named `NPM_APPROVERS` containing comma-separated GitHub logins:

```text
ngocdevv,another-maintainer
```

The pull-request author cannot authorize their own release.

## Versioning

Every release must increment `package.json#version`. If the version already exists on npm, the workflow succeeds without publishing again.
