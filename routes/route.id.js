// @ts-check
import { json } from "../responses.js";

/**
 * @param {import('../index.js').DataFunctionArgs} ctx
 */
export async function loader(ctx) {
  return json({ id: ctx.params.id });
}
