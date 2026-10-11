import { jsx } from "@qwik.dev/core/jsx-runtime";
import {
  Fragment,
  createSignal,
  inlinedQrl,
  render as renderQwik,
  type JSXOutput,
  type Signal,
} from "@qwik.dev/core";
import {
  ArgsEnhancer,
  ArgsStoryFn,
  RenderContext,
} from "storybook/internal/types";
import { QwikRenderer } from "./types.js";
import { componentToJSX } from "./component-to-jsx.js";
import {
  addActionsFromArgTypes,
  inferActionsFromArgTypesRegex,
} from "./addArgsHelpers.js";
export { parameters, argTypesEnhancers } from "./docs/config.js";

// returns the Qwik component as a JSX element (</MyComponent>)
// If a story has a custom renderer, it will replace this function.
export const render: ArgsStoryFn<QwikRenderer<unknown>> = (args, context) => {
  const { component } = context;
  if (typeof component === "function") {
    return componentToJSX(component, args);
  }
  return component;
};

interface CanvasRoot {
  storyId: string;
  output: Signal<JSXOutput>;
  cleanup: () => void;
}
const roots = new WeakMap<HTMLElement, CanvasRoot>();

export async function renderToCanvas<T>(
  { storyFn, showMain, forceRemount, id }: RenderContext<QwikRenderer<T>>,
  canvasElement: QwikRenderer<T>["canvasElement"],
) {
  let root = roots.get(canvasElement);
  if (root && (forceRemount || root.storyId !== id)) {
    root.cleanup();
    roots.delete(canvasElement);
    root = undefined;
  }
  if (root) {
    root.output.value = storyFn();
  } else {
    const container = document.createElement("div");
    canvasElement.replaceChildren(container);
    const output = createSignal<JSXOutput>(storyFn());
    const rendered = await renderQwik(
      container,
      jsx(Fragment, { children: output }),
    );
    root = {
      storyId: id,
      output,
      cleanup: () => {
        rendered.cleanup();
        container.remove();
      },
    };
    roots.set(canvasElement, root);
  }
  showMain();
  const mounted = root;
  return () => {
    if (roots.get(canvasElement) === mounted) {
      mounted.cleanup();
      roots.delete(canvasElement);
    }
  };
}

const actionsArgsEnhancers: ArgsEnhancer[] = [
  addActionsFromArgTypes,
  inferActionsFromArgTypesRegex,
];

export const argsEnhancers: ArgsEnhancer[] =
  // use the argsEnhancers from addon-actions, then wrap the actions in Qwik's inlinedQrl function so things work.
  actionsArgsEnhancers.map((actionsEnhancer: ArgsEnhancer) => {
    return ((context) => {
      const argsWithActions = actionsEnhancer(context);
      let finalArgs: any = {};
      Object.keys(argsWithActions).forEach((key) => {
        finalArgs[key] = inlinedQrl(argsWithActions[key], key);
      });
      return finalArgs;
    }) as ArgsEnhancer;
  });
