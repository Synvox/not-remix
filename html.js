//@ts-check
import htm from "htm";
import { Fragment, createElement as h } from "preact";

export { h };

const htmInner = htm.bind(h);

/**
 * htm will return Node or Node[] and we always want
 * to return a single Node from our components
 * @param {Parameters<typeof htmInner>} args
 */
export const html = (...args) => h(Fragment, null, htmInner(...args));
