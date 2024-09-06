//@ts-check
import { createRequestListener } from "@mjackson/node-fetch-server";
import { lookup } from "mime-types";
import fs from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { renderToString } from "preact-render-to-string";
import { getEntryPoints } from "./build.js";
import { ContextProvider } from "./context.js";
import { html } from "./html.js";
import { json } from "./responses.js";
import { routes } from "./routes.js";

const clientEntryPoints = await getEntryPoints(
  process.env.NODE_ENV !== "production"
);

const clientEntry = clientEntryPoints["client-entry.js"];

/**
 * @param {string} path
 */
function pathToRegexWithParams(path) {
  const paramNames = [];
  const regexString = path
    .replace(/([.+*?=^$|()[\]{}])/g, "\\$1")
    .replace(/:([a-zA-Z]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });

  const regex = new RegExp(`^${regexString}$`);

  /**
   * @param {string} url
   * @returns {Record<string, string> | null}
   */
  return function match(url) {
    const match = url.match(regex);
    if (!match) return null;

    /**
     * @type {Record<string, string>}
     */
    const params = {};

    paramNames.forEach((paramName, index) => {
      params[paramName] = match[index + 1];
    });

    return params;
  };
}

/**
 * @typedef {{
 *  request: Request,
 *  params: Record<string, string>
 * }} DataFunctionArgs
 */

/**
 * @template Data
 * @typedef {Data | Promise<Data>} MaybePromise<Data>
 */

/**
 * @template LoaderData
 * @template ActionData
 * @typedef {MaybePromise<{
 *  loader?: (args: DataFunctionArgs) => LoaderData,
 *  action?: (args: DataFunctionArgs) => ActionData,
 *  Component?: ({ loaderData }: { loaderData: LoaderData }) => import('react').ReactNode
 * }>} RouteModule<LoaderData, ActionData>
 */

/**
 * @param {Record<string, string>} routes
 */
function createRoutes(routes) {
  const matchers = Object.entries(routes).map(([path, modulePath]) => {
    const match = pathToRegexWithParams(path);
    const routeModule = import(`./routes/${modulePath}`);
    return { match, routeModule, modulePath };
  });

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  return async function handler(request) {
    const pathName = new URL(request.url).pathname;

    if (pathName.startsWith("/public/")) {
      //staticky serve files from this folder
      return fetchFile(pathName);
    }

    /**
     * @param {any} thrown
     */
    function handleThrownResponse(thrown) {
      if (thrown instanceof Response) return thrown;
      else throw new Response("Internal Server Error", { status: 500 });
    }

    for (const { match, routeModule, modulePath } of matchers) {
      const params = match(pathName);

      if (params) {
        const { loader, action, Component } = await routeModule;
        switch (request.method) {
          case "GET": {
            const loaderData = await loader?.({ request, params }).catch(
              handleThrownResponse
            );

            if (loaderData instanceof Response) {
              return loaderData;
            }

            if (Component) {
              const script = clientEntryPoints[join("routes", modulePath)];
              const markup = renderToString(html`
                <head>
                  <script
                    type="application/json"
                    id="loaderData"
                    dangerouslySetInnerHTML=${{
                      __html: JSON.stringify(loaderData),
                    }}
                  />
                  <script
                    type="module"
                    dangerouslySetInnerHTML=${{
                      __html: `
import { hydrate } from ${JSON.stringify(`./${clientEntry}`)};
import { Component } from ${JSON.stringify(`./${script}`)};
hydrate(Component, JSON.parse(document.getElementById("loaderData").textContent));
                  `.trim(),
                    }}
                  />
                </head>
                <body>
                  <div id="app">
                    <${ContextProvider} loaderData=${loaderData}>
                      <${Component} loaderData=${loaderData} />
                    <//>
                  </div>
                </body>
              `);
              return new Response(markup, {
                headers: {
                  "content-type": "text/html",
                },
              });
            }

            return loaderData instanceof Response
              ? loaderData
              : json(loaderData);
          }
          case "POST": {
            if (action) {
              const actionData = await action({ request, params }).catch(
                handleThrownResponse
              );

              if (actionData instanceof Response) return actionData;
              return json(actionData);
            }
            break;
          }
          default: {
            return new Response("Method not allowed", { status: 405 });
          }
        }
      }
    }

    return new Response("Not found", { status: 404 });
  };
}

/**
 * @param {string} filePath
 * @returns {Response}
 */
function fetchFile(filePath, targetFolder = "public") {
  const path = new URL(`.${filePath}`, import.meta.url).pathname;
  if (!path.startsWith(join(process.cwd(), `/${targetFolder}/`)))
    return new Response("Forbidden", { status: 403 });

  if (!fs.existsSync(path)) return new Response("Not found", { status: 404 });

  const fileStream = fs.createReadStream(path);

  const webStream = new ReadableStream({
    async pull(controller) {
      for await (const chunk of fileStream) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(webStream, {
    headers: { "Content-Type": lookup(path) || "application/octet-stream" },
  });
}

createServer(createRequestListener(createRoutes(routes))).listen(4000);
