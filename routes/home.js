// @ts-check
import { html } from "../html.js";
import { redirect } from "../responses.js";

/**
 * @param {import('../index.js').DataFunctionArgs} _ctx
 */
export async function loader(_ctx) {
  return {};
}

/**
 * @param {import('../index.js').DataFunctionArgs} ctx
 */
export async function action(ctx) {
  const name = String((await ctx.request.formData()).get("name") ?? "");
  throw redirect(`/hello?${new URLSearchParams({ name })}`);
}

export function Component() {
  return html`
    <form action="." method="POST">
      <label>
        Name:
        <br />
        <input name="name" />
      </label>
    </form>
  `;
}
