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

// The origin the built extension points at — where it delivers posts, fetches
// card art, and looks up inventory. Mirrors `rootUrl()` in `src/lib/sections.ts`
// exactly (default included), so setting the one variable the app itself
// already reads for its own root URL is enough to build against a local dev
// server instead of production:
//
//   NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run extension:build
//
// Duplicated rather than imported: this script runs under plain Node, not a
// TypeScript loader, so it cannot `import` a `.ts` file the way the bundled
// extension source can (`src/app-origin.ts` imports the real thing, and every
// URL the extension builds comes from there, not from a literal).
const appOrigin = (
  process.env.NEXT_PUBLIC_APP_URL || "https://objekt.my"
).replace(/\/+$/, "");
// Where Open in match delivers — a local dev server until /match ships. Mirrors
// `MATCH_ORIGIN` in `src/app-origin.ts`, which says when to change it.
const matchOrigin = (
  process.env.EXTENSION_MATCH_URL ||
  (process.env.NEXT_PUBLIC_APP_URL ? appOrigin : "http://localhost:3000")
).replace(/\/+$/, "");
// Mirrors `hostPattern()` there: no port, because Firefox rejects a match
// pattern that has one and Chrome reads one without it as any port.
const hostPattern = (origin) => {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
};

await mkdir(new URL(`${output}/`, root), { recursive: true });
await build({
  entryPoints: ["content", "background", "panel"].map(
    (name) => new URL(`src/${name}.ts`, root).pathname,
  ),
  outdir: new URL(`${output}/`, root).pathname,
  bundle: true,
  platform: "browser",
  target: firefox ? "firefox128" : "chrome116",
  format: "iife",
  tsconfig: "tsconfig.json",
  // `src/app-origin.ts` reads these through the app's own `rootUrl()`, which
  // is shared with server and client code that has a real `process.env` —
  // the browser bundle here has none, so esbuild inlines the values this
  // script read instead of leaving a `process` reference that would throw.
  define: {
    "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(
      process.env.NEXT_PUBLIC_APP_URL || "",
    ),
    "process.env.NEXT_PUBLIC_ROOT_DOMAIN": JSON.stringify(
      process.env.NEXT_PUBLIC_ROOT_DOMAIN || "",
    ),
    "process.env.EXTENSION_MATCH_URL": JSON.stringify(
      process.env.EXTENSION_MATCH_URL || "",
    ),
  },
});
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);
// The host permissions that let the extension actually reach `appOrigin` and
// `matchOrigin`, in place of the checked-in objekt.my one, so the env vars
// above are enough on their own — nobody has to remember a second place to
// grant access.
manifest.host_permissions = [
  ...new Set(
    manifest.host_permissions.flatMap((pattern) =>
      pattern === "https://objekt.my/*"
        ? [hostPattern(appOrigin), hostPattern(matchOrigin)]
        : [pattern],
    ),
  ),
];
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
  new URL("panel.html", root),
  new URL(`${output}/panel.html`, root),
);
await mkdir(new URL(`${output}/icons/`, root), { recursive: true });
for (const icon of await readdir(new URL("icons/", root)))
  if (icon.endsWith(".png"))
    await copyFile(
      new URL(`icons/${icon}`, root),
      new URL(`${output}/icons/${icon}`, root),
    );

console.log(
  `Load the built extension from ${new URL(`${output}/manifest.json`, root).pathname}\n  Open in match → ${matchOrigin}/match\n  card art and inventory → ${appOrigin}`,
);
