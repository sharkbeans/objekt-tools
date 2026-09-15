/**
 * The source archive Mozilla asks for alongside a bundled/minified submission.
 *
 * This extension is built with esbuild, which AMO's reviewers treat as a
 * bundler regardless of whether the output is readable — so a source upload
 * is required, not optional, every time the Firefox package changes
 * (https://extensionworkshop.com/documentation/publish/source-code-submission/).
 *
 * The extension is not a standalone package: it imports parser and section
 * code from the app's own `src/lib` (see the imports in `src/*.ts`), so the
 * archive a reviewer can actually build from is the whole repository at the
 * commit the package was built from — not just this folder. `git archive`
 * gives that for free: it walks the exact tracked tree of one commit and
 * already respects .gitignore, which a hand-rolled file walk would have to
 * reimplement and would drift from as the ignore rules change.
 *
 * Requires a clean working tree so the archive matches what `git rev-parse`
 * names it after — an archive of uncommitted changes would carry a commit hash
 * that does not describe its own contents.
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname; // repo root
const extDir = new URL("./", import.meta.url).pathname;
const out = join(extDir, "packages");

const manifest = JSON.parse(
  execFileSync(
    "git",
    ["show", "HEAD:extensions/discord-capture/manifest.json"],
    {
      cwd: root,
    },
  ).toString(),
);

const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root })
  .toString()
  .trim();
if (dirty) {
  throw new Error(
    "Working tree is not clean. Commit or stash changes first — the archive is named after HEAD and must match it.",
  );
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root })
  .toString()
  .trim();
const nodeVersion = execFileSync("node", ["--version"]).toString().trim();
const npmVersion = execFileSync("npm", ["--version"]).toString().trim();

const readme = `Objekt Match — source for Mozilla review
=========================================

This archive is the git tree at commit ${commit}, in full — not just the
extension folder. The extension imports parser and routing code from the
app's own \`src/lib\` (see the \`@/lib/...\` imports in
\`extensions/discord-capture/src/*.ts\`), so that code has to be present for
the build below to reproduce the submitted package.

Build environment used for the submitted package
--------------------------------------------------
- OS: Linux (any platform Node supports; nothing in the build is
  platform-specific)
- Node.js: ${nodeVersion} (repo requires >=22)
- npm: ${npmVersion}

Build steps
-----------
From the repository root:

    npm ci
    npm run extension:build:firefox

This writes \`extensions/discord-capture/dist-firefox/\`, whose
\`background.js\`, \`content.js\` and \`panel.js\` are exactly what is in the
submitted .xpi (\`manifest.json\` differs only by the build-time
\`version_name\` stamp, which \`npm run extension:package\` strips before
zipping — that command produces the byte-identical submitted package).

No environment variables need to be set for this build: it defaults to
https://objekt.my for every origin the extension talks to. See
\`extensions/discord-capture/src/app-origin.ts\` if that ever needs to change.

Where to look
--------------
- \`extensions/discord-capture/src/\` — the extension's own source.
- \`extensions/discord-capture/build.mjs\` — the esbuild bundling step.
- \`src/lib/discord/\`, \`src/lib/match/\`, \`src/lib/paste-parser.ts\`,
  \`src/lib/objekt-label.ts\`, \`src/lib/season-prefix.ts\`, \`src/lib/sections.ts\`
  — the app modules the extension bundles in.
`;

await mkdir(out, { recursive: true });
const readmePath = join(out, "SOURCE-README.txt");
await writeFile(readmePath, readme);

const archivePath = join(out, `objekt-capture-source-${manifest.version}.zip`);
// `--add-file` inserts one extra file into the archive tree alongside HEAD's
// tracked files, without needing a real commit — the README describes a build
// it isn't part of.
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    "-o",
    archivePath,
    "--prefix=objekt-tools/",
    "--add-file",
    readmePath,
    "HEAD",
  ],
  { cwd: root },
);

console.log(
  `${archivePath}\n  (git tree at ${commit.slice(0, 12)}, plus SOURCE-README.txt)`,
);
console.log(
  "\nUpload this alongside the .xpi in the same AMO submission — a source archive is required whenever the reviewed build was produced by a bundler (esbuild here), even with readable output.",
);
