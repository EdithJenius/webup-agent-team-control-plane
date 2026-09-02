# Contributing

Thank you for helping improve Webup. Contributions should preserve the core
principle that repository state is auditable and production authority remains
explicit.

## Before Opening a Pull Request

1. Open an issue for changes to schemas, invariants, role authority, or release
   policy so the behavioral contract can be discussed first.
2. Keep fixtures synthetic. Do not contribute client data, credentials, private
   URLs, browser state, copyrighted media, or production secrets.
3. Add a regression test for every invariant or validator change.
4. Run the complete checks:

```bash
npm ci
npm test
npm run validate:team
```

## Pull Request Expectations

- Explain the problem and the invariant being added or changed.
- Identify compatibility impact on existing project records.
- Include migration guidance when a schema change is not backward compatible.
- Keep generated files and local project instances out of the pull request.
- Do not weaken human approval, independent review, rights, security, or
  rollback gates merely to make a fixture pass.

By contributing, you agree that your contribution is licensed under Apache-2.0.
