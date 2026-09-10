import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
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
  target: firefox ? "firefox128" : "chrome116",
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
// One manifest per store, rather than one that carries both and draws a
// "unrecognized key" warning wherever it is loaded. Reviewers read these.
if (firefox) {
  // Firefox's MV3 background is an event page; it has no service worker.
  manifest.background = { scripts: ["background.js"] };
  delete manifest.minimum_chrome_version;
} else {
  delete manifest.browser_specific_settings;
}
await writeFile(
  new URL(`${output}/manifest.json`, root),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await copyFile(
  new URL("popup.html", root),
  new URL(`${output}/popup.html`, root),
);
await mkdir(new URL(`${output}/icons/`, root), { recursive: true });
for (const icon of await readdir(new URL("icons/", root)))
  if (icon.endsWith(".png"))
    await copyFile(
      new URL(`icons/${icon}`, root),
      new URL(`${output}/icons/${icon}`, root),
    );

console.log(
  `Load the built extension from ${new URL(`${output}/manifest.json`, root).pathname}`,
);
