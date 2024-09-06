//@ts-check
import { hydrate as hydratePreact } from "preact";
import { ContextProvider } from "./context.js";
import { html } from "./html.js";

/**
 * @template T
 * @param {import("preact").ComponentType<{ loaderData: T; }>} Component
 * @param {T} data
 */
export function hydrate(Component, data) {
  const root = document.querySelector("#app");
  if (!root) throw new Error("Root element not found");

  hydratePreact(
    html`
      <${ContextProvider} loaderData=${data}>
        <${Component} loaderData=${data} />
      <//>
    `,
    root
  );
}
