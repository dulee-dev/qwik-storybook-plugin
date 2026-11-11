import { mergeConfig, Plugin } from "vite";
import { QWIK_LOADER } from "@qwik.dev/core/loader";
import { qwikStorybookHmr } from "./qwik-hmr.js";
import { qwikDocgen } from "./docs/qwik-docgen.js";
import { StorybookConfig } from "./types.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export const core: StorybookConfig["core"] = {
  builder: import.meta.resolve("@storybook/builder-vite"),
};

export const viteFinal: StorybookConfig["viteFinal"] = async (
  defaultConfig,
) => {
  const config = mergeConfig(defaultConfig, {
    base: defaultConfig.base === "./" ? "/" : defaultConfig.base,
    build: { target: "es2020" },
  });

  if (
    !config.plugins.some(
      (plugin: Plugin) => plugin.name === "storybook:qwik-docgen-plugin",
    )
  )
    config.plugins.push(qwikDocgen());

  // Router middleware owns application URLs and must not intercept Storybook.
  // Keep the Qwik optimizer, which supplies the native v2 HMR bridge module.
  const storybookPlugins = (plugins: any[]): any[] =>
    plugins.flatMap((plugin) => {
      if (Array.isArray(plugin)) return storybookPlugins(plugin);
      return plugin?.name?.startsWith("vite-plugin-qwik-router") ||
        plugin?.name === "vite-plugin-qwik-city"
        ? []
        : [plugin];
    });
  config.plugins = storybookPlugins(config.plugins);
  config.plugins.push({
    name: "storybook:qwik-router-mock-config",
    resolveId(id: string) {
      if (id === "@qwik-router-config") return "\0storybook:qwik-router-config";
    },
    load(id: string) {
      if (id === "\0storybook:qwik-router-config") {
        return "export const routes = []; export const serverPlugins = []; export const menus = []; export const basePathname = '/'; export const trailingSlash = true; export const cacheModules = false; export const serviceWorkerUrl = '';";
      }
    },
  });
  config.plugins.push(qwikStorybookHmr());

  return config;
};

export const previewAnnotations: StorybookConfig["previewAnnotations"] = (
  entry = [],
) => [...entry, require.resolve("./preview.js")];

export const previewHead = (head: string) => {
  return `${head} <script>${QWIK_LOADER}</script>`;
};
