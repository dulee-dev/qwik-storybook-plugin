import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createDocgenProject,
  isDocgenComponent,
  qwikDocgen,
} from "../dist/docs/qwik-docgen.js";

test("only authored component modules are analyzed", () => {
  assert.equal(isDocgenComponent("/app/src/card.tsx"), true);
  for (const file of [
    ".storybook/preview.tsx",
    ".storybook/decorators.tsx",
    "card.stories.tsx",
    "card.spec.tsx",
    "card.test.tsx",
    "card.generated.tsx",
    "node_modules/lib/card.tsx",
    "dist/card.tsx",
    "styled-system/card.tsx",
    "__tests__/card.tsx",
    "card.tsx?qwik",
    "\0virtual.tsx",
    "card.ts",
  ]) {
    assert.equal(isDocgenComponent(`/app/${file}`), false, file);
  }
});

test("project aliases, cached extraction and imported Props edits remain accurate", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qwik-docgen-"));
  const component = path.join(root, "card.tsx");
  const props = path.join(root, "props.ts");
  const other = path.join(root, "other.tsx");
  writeFileSync(
    other,
    "export function Other(props: { value: string }) { return null; }",
  );
  const config = path.join(root, "tsconfig.json");
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        jsx: "preserve",
        paths: { "@props": ["./props.ts"] },
        strict: true,
      },
      include: ["*.tsx", "*.ts"],
    }),
  );
  writeFileSync(
    props,
    "/** Shared properties. */ export interface Props {\n/** The visible label. */\nlabel: string; }",
  );
  writeFileSync(
    component,
    'import type { Props } from "@props"; export function Card(props: Props) { return null; }',
  );
  const project = createDocgenProject(root);
  try {
    const first = project.parse(component);
    const otherDocs = project.parse(other);
    assert.equal(first.length, 1);
    assert.equal(first[0].props.label.type.name, "string");
    assert.equal(first[0].props.label.description, "The visible label.");
    assert.strictEqual(
      project.parse(component),
      first,
      "unchanged modules reuse extracted docs",
    );
    writeFileSync(
      props,
      "export interface Props {\n/** Updated count. */\ncount: number; }",
    );
    assert.deepEqual(project.invalidate(props), [component]);
    assert.strictEqual(
      project.parse(other),
      otherDocs,
      "unrelated components stay cached",
    );
    const updated = project.parse(component);
    assert.equal(updated[0].props.label, undefined);
    assert.equal(updated[0].props.count.type.name, "number");
    assert.equal(updated[0].props.count.description, "Updated count.");
    writeFileSync(
      path.join(root, "alternate.ts"),
      "export interface Props { enabled: boolean; }",
    );
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: {
          jsx: "preserve",
          paths: { "@props": ["./alternate.ts"] },
          strict: true,
        },
        include: ["*.tsx", "*.ts"],
      }),
    );
    project.invalidate(config);
    assert.equal(
      project.parse(component)[0].props.enabled.type.name,
      "boolean",
    );
  } finally {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test("type-only edits invalidate component transforms outside the runtime module graph", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qwik-docgen-hmr-"));
  const file = path.join(root, "card.tsx");
  writeFileSync(
    path.join(root, "props.ts"),
    "export interface Props { label: string; }",
  );
  writeFileSync(
    path.join(root, "barrel.ts"),
    'export type { Props } from "./props";',
  );
  writeFileSync(
    file,
    'import type { Props } from "./barrel"; export function Card(props: Props) { return null; }',
  );
  const plugin = qwikDocgen();
  plugin.configResolved({ root });
  try {
    assert.match(
      plugin.transform("export const placeholder = 1;", file).code,
      /__STORYBOOK_COMPONENT_DOC__/,
    );
    const componentModule = { id: file };
    const invalidated = [];
    const result = plugin.handleHotUpdate({
      file: path.join(root, "props.ts"),
      modules: [],
      server: {
        moduleGraph: {
          getModulesByFile: (id) =>
            id === file ? new Set([componentModule]) : undefined,
          invalidateModule: (module) => invalidated.push(module),
        },
      },
    });
    assert.deepEqual(result, [componentModule]);
    assert.deepEqual(invalidated, [componentModule]);
  } finally {
    plugin.closeBundle();
    rmSync(root, { recursive: true, force: true });
  }
});

test("global declarations, augmentations and imported declaration modules remain available", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qwik-docgen-ambient-"));
  const file = path.join(root, "card.tsx");
  writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "preserve" }, include: ["*"] }),
  );
  writeFileSync(
    path.join(root, "global.d.ts"),
    "interface GlobalLabel { label: string }",
  );
  writeFileSync(
    path.join(root, "augment.d.ts"),
    "export {}; declare global { interface GlobalLabel { count: number } }",
  );
  writeFileSync(
    path.join(root, "props.d.ts"),
    "export interface Props extends GlobalLabel { enabled: boolean }",
  );
  writeFileSync(
    file,
    'import type { Props } from "./props"; export function Card(props: Props) { return null; }',
  );
  const project = createDocgenProject(root);
  try {
    const props = project.parse(file)[0].props;
    assert.equal(props.label.type.name, "string");
    assert.equal(props.count.type.name, "number");
    assert.equal(props.enabled.type.name, "boolean");
  } finally {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
