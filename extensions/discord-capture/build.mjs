import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
await build({
  entryPoints: ["content", "background", "popup"].map(
    (name) => new URL(`src/${name}.ts`, root).pathname,
  ),
  outdir: new URL("dist/", root).pathname,
  bundle: true,
  platform: "browser",
  target: "chrome120",
  format: "iife",
  tsconfig: "tsconfig.json",
});
for (const name of ["manifest.json", "popup.html"])
  await copyFile(new URL(name, root), new URL(`dist/${name}`, root));
