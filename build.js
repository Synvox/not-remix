//@ts-check
import * as esbuild from "esbuild";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { removeExports } from "./remove-exports.js";
import { routes } from "./routes.js";

/**
 * @param {boolean} [build]
 * @returns {Promise<Record<string, string>>}
 */
export async function getEntryPoints(build = true) {
  if (!build) {
    const existingManifest = await fs
      .readFile("public/dist/manifest.json", "utf8")
      .catch(() => null);
    if (existingManifest) return JSON.parse(existingManifest);
    else throw new Error("Manifest not found, did you forget to build?");
  }

  const entryPoints = [
    "client-entry.js",
    ...Object.values(routes).map((x) => join(`./routes/`, x)),
  ];

  const { metafile } = await esbuild.build({
    bundle: true,
    entryPoints,
    format: "esm",
    metafile: true,
    outdir: "public/dist",
    platform: "browser",
    plugins: [removeLoaderAction()],
    sourcemap: true,
    splitting: true,
    target: "esnext",
  });

  const manifest = Object.fromEntries(
    entryPoints.map((input) => {
      const output = Object.entries(metafile.outputs).filter(
        ([_, value]) => value.entryPoint === input
      )?.[0]?.[0];

      return [input, output];
    })
  );

  await fs.writeFile(
    join("public/dist", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getEntryPoints()
    .then(() => {
      console.log("Built entry points");
      process.exit(0);
    })
    .catch(console.error);
}

function removeLoaderAction() {
  return {
    name: "transform-file",

    setup(build) {
      const fileRegex = /\/routes\//;
      build.onLoad({ filter: fileRegex }, async (args) => {
        const contents = await fs.readFile(args.path, "utf8");

        const transformed = removeExports(contents, ["loader", "action"]).code;

        return {
          contents: transformed,
          loader: "default", // Adjust the loader if necessary
        };
      });
    },
  };
}
