import assert from "node:assert/strict";
import { test } from "node:test";
import { componentBoundary } from "../dist/qwik-hmr.js";
const source =
  'import {component$} from "@qwik.dev/core"; /** Props */ export interface Props { label: string } export const Card = component$<Props>((props) => { return <button>{props.label}</button>; });';
test("component body and event-handler edits use native HMR", () => {
  assert.equal(
    componentBoundary(source),
    componentBoundary(
      source.replace(
        "<button>",
        '<button onClick$={() => console.log("new")}>',
      ),
    ),
  );
});
test("Props, docs and module exports retain Storybook updates", () => {
  for (const changed of [
    source.replace("label: string", "label?: string"),
    source.replace("/** Props */", "/** Changed */"),
    source + 'export const label="new";',
  ])
    assert.notEqual(componentBoundary(source), componentBoundary(changed));
  assert.equal(componentBoundary("export const value = <div/>;"), undefined);
});
