//@ts-check
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { html } from "./html.js";

/**
 * @type {import('preact').Context<{
 *  loaderData: any
 * }>}
 */
const context = createContext(/** @type {any} */ (null));

/**
 * @template T
 * @returns {Awaited<ReturnType<T>>} loaderData
 */
export function useLoaderData() {
  return useContext(context).loaderData;
}

export function ContextProvider({ loaderData, children }) {
  return html` <${context.Provider} value=${{ loaderData }}> ${children} <//> `;
}
