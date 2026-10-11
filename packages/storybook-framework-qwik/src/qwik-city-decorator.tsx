import { QwikCityMockProvider } from "@qwik.dev/router";
import { Decorator } from "./types.js";

/** Wraps story in QwikCityMockProvider */
export const qwikCityDecorator: Decorator = (Story) => (
  <QwikCityMockProvider>{Story()}</QwikCityMockProvider>
);
