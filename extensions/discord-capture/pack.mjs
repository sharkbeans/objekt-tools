/**
 * Build both stores' packages, from a clean build each time.
 *
 * Uploading the wrong folder is a mistake with a cost measured in review days:
 * the Chrome package must not carry Firefox's manifest, the Firefox one must
 * not carry Chrome's, and neither may contain anything left over from an
 * earlier build. So both are rebuilt from scratch here rather than zipped from
 * whatever happens to be on disk.
 *
 * The zip is written by hand rather than by a dependency: it is a hundred
 * lines of a very stable format, against a build-time dependency in an
 * extension whose whole pitch is that it is small and self-contained.
 */

import { execFileSync } from "node:child_process";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = new URL("./", import.meta.url).pathname;
const out = join(root, "packages");

const CRC = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return (buffer) => {
    let c = -1;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

/** Every file under `dir`, as store-relative paths with forward slashes. */
async function walk(dir, base = dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, base)));
    else found.push(relative(base, path).split("\\").join("/"));
  }
  return found.sort();
}

/**
 * A zip whose entries carry a fixed timestamp.
 *
 * Two builds of the same source then produce byte-identical packages, which is
 * what makes "is this the build I reviewed" answerable at all.
 */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  // 1980-01-01, the earliest the format can express.
  const time = 0;
  const date = 33;
  for (const { name, body } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(body, { level: 9 });
    // Compression that made the file bigger is not compression.
    const stored = deflated.length >= body.length;
    const data = stored ? body : deflated;
    const crc = CRC(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(body.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(0o644 << 16, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

async function pack(label, args) {
  const dir = join(root, label === "firefox" ? "dist-firefox" : "dist");
  await rm(dir, { recursive: true, force: true });
  execFileSync(process.execPath, [join(root, "build.mjs"), ...args], {
    stdio: "inherit",
  });
  const manifest = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  );
  // The build stamp is for local debugging; it does not belong in a package,
  // where it would make every upload a different file for no reason.
  delete manifest.version_name;
  await writeFile(
    join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const names = await walk(dir);
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      body: await readFile(join(dir, name)),
    })),
  );
  const path = join(out, `objekt-capture-${label}-${manifest.version}.zip`);
  await writeFile(path, zip(files));
  const { size } = await stat(path);
  console.log(
    `${path}\n  ${files.length} files, ${(size / 1024).toFixed(0)} KB\n  ${names.join("\n  ")}`,
  );
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await pack("chrome", []);
await pack("firefox", ["--firefox"]);
console.log(
  "\nNext: upload the Chrome zip at https://chrome.google.com/webstore/devconsole and the Firefox zip at https://addons.mozilla.org/developers/ — the answers both dashboards ask for are in STORE.md.",
);
