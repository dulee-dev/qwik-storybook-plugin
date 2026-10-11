import type { Plugin } from "vite";
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";

// Native Qwik HMR replaces component closures. Changes to module exports,
// imports, or Props/docs must still reach Storybook's ordinary module updates.
export function componentBoundary(source: string): string | undefined {
  const file = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const bodies: { start: number; end: number }[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "component$"
    ) {
      const callback = node.arguments[0];
      if (
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        bodies.push({
          start: callback.body.getStart(file),
          end: callback.body.end,
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!bodies.length) return;
  for (const body of bodies.reverse())
    source =
      source.slice(0, body.start) + "__QWIK_BODY__" + source.slice(body.end);
  return source;
}

export function qwikStorybookHmr(): Plugin {
  const boundaries = new Map<string, string | undefined>();
  return {
    name: "storybook:qwik-hmr",
    apply: "serve",
    enforce: "pre",
    transform(_source, id) {
      if (/\.tsx$/.test(id) && !/\.(stories|story|test|spec)\.tsx$/.test(id)) {
        // The optimizer may run before this hook; compare authored source.
        if (existsSync(id))
          boundaries.set(id, componentBoundary(readFileSync(id, "utf8")));
      }
    },
    hotUpdate: {
      order: "post",
      async handler(ctx) {
        if (this.environment.name !== "client") return;
        const previous = boundaries.get(ctx.file);
        if (previous === undefined) return;
        const next = componentBoundary(await ctx.read());
        boundaries.set(ctx.file, next);
        if (next !== previous) return;
        const files = ctx.modules
          .filter((module) => module.type === "js")
          .map((module) => module.url.split("?")[0]);
        if (!files.length) return;
        for (const module of ctx.modules)
          this.environment.moduleGraph.invalidateModule(module);
        this.environment.hot.send({
          type: "custom",
          event: "qwik:hmr",
          data: { files, t: ctx.timestamp },
        });
        return [];
      },
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: "/@id/@qwik-hmr-bridge" },
          injectTo: "head",
        },
      ];
    },
  };
}
