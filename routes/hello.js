// @ts-check
import { useLoaderData } from "../context.js";
import { html } from "../html.js";
import { useState } from "preact/hooks";

/**
 * @param {import('../index.js').DataFunctionArgs} ctx
 */
export async function loader(ctx) {
  const url = new URL(ctx.request.url);
  return {
    name: url.searchParams.get("name") || "Derp",
  };
}

export function Component() {
  /**
   * @type {Awaited<ReturnType<typeof loader>>}
   */
  const { name } = useLoaderData();

  return html`
    <div>
      Hello ${name}!
      <br />
      <${Counter} />
    </div>
  `;
}

function Counter() {
  const [count, setCount] = useState(0);
  return html`
    <button onClick=${() => setCount(count + 1)}>Count: ${count}</button>
  `;
}
