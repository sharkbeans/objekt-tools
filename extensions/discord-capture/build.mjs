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
  target: firefox ? "firefox128" : ["chrome121", "firefox128"],
  format: "iife",
  tsconfig: "tsconfig.json",
});
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);
// Reloading the extension leaves the old content script running in any Discord
// tab that is already open, so "did my change take effect" is not answerable by
// looking at the UI. Stamping the build makes it answerable.
manifest.version_name = `${manifest.version} · built ${new Date()
  .toISOString()
  .slice(0, 16)
  .replace("T", " ")}Z`;
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

console.log(
  `Load the built extension from ${new URL(`${output}/manifest.json`, root).pathname}`,
);
