# Storybook for Qwik v2

Public fork of [storybook-framework-qwik](https://github.com/literalpie/storybook-framework-qwik), retaining its MIT license and attribution.

Targets Qwik **2.0.0-rc.2**, Storybook **10.6.1**, Vite **8.3.4**, and Node **22.19+**. Qwik v1 is not supported.

## Install

```sh
pnpm add -D @dulee.dev/storybook-framework-qwik
```

In `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@dulee.dev/storybook-framework-qwik";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@dulee.dev/storybook-framework-qwik",
};
export default config;
```

Keep the Qwik optimizer in the application's Vite config. Import `Meta` and `StoryObj` from this package in stories. The router mock decorator is exported from `@dulee.dev/storybook-framework-qwik/qwik-city-decorator`.

For existing configurations using the upstream name, install an alias instead:

```sh
pnpm add -D storybook-framework-qwik@npm:@dulee.dev/storybook-framework-qwik@0.1.0
```

Features include native Qwik v2 HMR for component callback edits, canvas reuse for args updates, and incremental project-aware docgen. Structural edits can remount components. Static watch-build docgen invalidation is not implemented.

Source and issues: https://github.com/dulee-dev/qwik-storybook-plugin
