# Qwik v2 Storybook fork

This fork preserves the history and MIT metadata of
[literalpie/storybook-framework-qwik](https://github.com/literalpie/storybook-framework-qwik).
The current local integration targets Qwik **2.0.0-rc.2**, Storybook **10.6.1**,
Vite **8.3.4**, and TypeScript **6.0.3**. Qwik v1 is not supported by this branch.

## Local development

```sh
pnpm install
pnpm build
node --test packages/storybook-framework-qwik/tests/*.test.mjs
pnpm storybook
```

A consuming app can link `packages/storybook-framework-qwik`. Rebuild this
package and restart Storybook after changing its preset. App component edits
are handled by the Qwik optimizer without rebuilding this package.

## Behavior

- Storybook retains the app's Qwik optimizer and replaces router middleware
  with an empty router configuration for `QwikCityMockProvider`.
- Component callback body edits use Qwik's native HMR bridge, preserving input
  and Signal state. Changes to Props, imports, module exports, stories, or other
  unsupported boundaries follow the ordinary Storybook update path and may
  remount. Qwik's own bridge provides a reload fallback if it cannot handle an edit.
- Args changes reuse a mounted canvas; story switches and teardown call Qwik cleanup.
- Docgen reuses a project-aware TypeScript language service. Stories, tests,
  generated code, and optimizer query modules are excluded. Imported type changes
  invalidate affected component metadata, including type-only dependencies.
- Qwik v2 requires an absolute base path: Storybook's default `./` is normalized
  to `/`. Set an absolute `/subdirectory/` base for a subdirectory host.

The fixture app uses Qwik v2's router and no longer registers Qwik v1's removed
prefetch service worker. Development HMR and fresh static builds are verified;
static watch-build docgen invalidation is not implemented.

The npm package is `@dulee.dev/storybook-framework-qwik` (fork version 0.1.0).
See the package README for scoped installation and legacy-name alias instructions.
Original upstream automated release and deployment workflows remain restricted
to the upstream repository.
