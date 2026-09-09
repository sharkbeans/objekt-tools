import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const firefox = process.argv.includes("--firefox");
const output = firefox ? "dist-firefox" : "dist";
await mkdir(new URL(`${output}/`, root), { recursive: true });
await build({
  entryPoints: ["content", "background", "popup"].map(
    (name) => new URL(`src/${name}.ts`, root).pathname,
  ),
  outdir: new URL(`${output}/`, root).pathname,
  bundle: true,
  platform: "browser",
  target: firefox ? "firefox128" : "chrome120",
  format: "iife",
  tsconfig: "tsconfig.json",
});
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);
if (firefox) {
  manifest.background = { scripts: ["background.js"] };
  manifest.browser_specific_settings = {
    gecko: { id: "discord-capture@objekt.my", strict_min_version: "128.0" },
  };
}
await writeFile(
  new URL(`${output}/manifest.json`, root),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await copyFile(
  new URL("popup.html", root),
  new URL(`${output}/popup.html`, root),
);
