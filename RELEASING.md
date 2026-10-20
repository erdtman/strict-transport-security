# Releasing

Releases go through npm's [staged publishing](https://docs.npmjs.com/staged-publishing),
so no release reaches the registry without a human approving it.

1. Bump the version in `package.json` and merge it.
2. Tag and create a GitHub Release. That triggers
   `.github/workflows/publish.yml`, which checks the tag against
   `package.json`, runs the tests, and submits the tarball with
   `npm stage publish`.
3. Approve it with 2FA, either from the **Staged Packages** tab on npmjs.com
   or with `npm stage approve <stage-id>`. Until then the version is staged
   and not installable.

The workflow authenticates by OIDC as a trusted publisher, so there is no npm
token in CI. Its npm permissions are limited to staging, meaning a direct
`npm publish` from the workflow is rejected.
[Provenance](https://docs.npmjs.com/generating-provenance-statements) is
generated automatically for trusted publishes from a public repository, which
links the published tarball to the commit and workflow that built it.

Before reviewing a staged release you can inspect it with
`npm stage view <stage-id>` or `npm stage download <stage-id>`.
