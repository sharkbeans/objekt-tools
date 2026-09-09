// Persistence for the pasted transcript, in IndexedDB, gzipped.
//
// This used to be one accumulated string in `localStorage`, which ran out of
// room fast: browsers bill localStorage per UTF-16 code unit at 2 bytes each,
// so a single day of a busy trade channel (2,900 messages) spent 3.5 MB of the
// 5 MB origin budget. Two changes fix that, and they compound:
//
//   * dedupe before storing (see `mergeBlocks`) — 53% of a real day's export
//     is reposts, and overlapping pastes duplicate them again
//   * gzip via `CompressionStream`, kept as a Blob in IndexedDB
//
// IndexedDB rather than localStorage because it stores real bytes — no UTF-16
// doubling, and no base64/base32768 tax to get compressed output into a string.
// Together that takes the same corpus from 3.51 MB to ~0.22 MB, against a quota
// that is a share of free disk rather than a hard 5 MB.
//
// Compression is async, which is the whole reason this module exists rather
// than a pair of synchronous helpers.

import { mergeBlocks, type StoredBlock } from "./transcript-blocks";

const DB_NAME = "objekt-match";
const STORE_NAME = "kv";
const BLOCKS_KEY = "match:blocks:v2";
// Superseded by the IndexedDB store above; read once on load, then dropped.
const LEGACY_RAW_KEY = "match:raw:v1";

export interface StoredPayload {
  /** False when the browser has no CompressionStream and the JSON went in raw. */
  gz: boolean;
  data: Blob;
}

// ---------------------------------------------------------------- IndexedDB

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  // A failed open must not be cached, or a transient error disables storage
  // for the rest of the session.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

// ------------------------------------------------------------------- codec

function canCompress(): boolean {
  return (
    typeof CompressionStream === "function" &&
    typeof DecompressionStream === "function"
  );
}

/** Compress blocks for storage. Exported for testing. */
export async function encodeBlocks(
  blocks: StoredBlock[],
): Promise<StoredPayload> {
  const json = new Blob([JSON.stringify(blocks)], {
    type: "application/json",
  });
  if (!canCompress()) return { gz: false, data: json };
  const compressed = json.stream().pipeThrough(new CompressionStream("gzip"));
  return { gz: true, data: await new Response(compressed).blob() };
}

/**
 * Read a stored payload back. Anything that is not what we wrote — a corrupt
 * entry, a shape from a future version — reads as empty rather than throwing.
 *
 * Exported for testing.
 */
export async function decodeBlocks(payload: unknown): Promise<StoredBlock[]> {
  if (!isPayload(payload)) return [];
  let parsed: unknown;
  try {
    if (payload.gz) {
      const plain = payload.data
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      parsed = await new Response(plain).json();
    } else {
      parsed = JSON.parse(await payload.data.text());
    }
  } catch {
    return [];
  }
  return Array.isArray(parsed) && parsed.every(isBlock) ? parsed : [];
}

function isBlock(value: unknown): value is StoredBlock {
  if (typeof value !== "object" || value === null) return false;
  if (!("author" in value) || !("body" in value) || !("time" in value)) {
    return false;
  }
  return (
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    (value.time === null || typeof value.time === "string")
  );
}

function isPayload(value: unknown): value is StoredPayload {
  if (typeof value !== "object" || value === null) return false;
  if (!("gz" in value) || !("data" in value)) return false;
  return typeof value.gz === "boolean" && value.data instanceof Blob;
}

// ------------------------------------------------------------------ legacy

function readLegacyRaw(): string {
  try {
    return localStorage.getItem(LEGACY_RAW_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearLegacyRaw(): void {
  try {
    localStorage.removeItem(LEGACY_RAW_KEY);
  } catch {
    /* Nothing to reclaim if the store is unreachable. */
  }
}

// ------------------------------------------------------------------ public

/**
 * Read the stored transcript, migrating anything left in `localStorage`.
 *
 * Never throws: a blocked, corrupt or absent store yields an empty list, which
 * leaves the page usable and lets the next paste start a fresh store.
 */
export async function loadBlocks(): Promise<StoredBlock[]> {
  let blocks: StoredBlock[] = [];
  try {
    blocks = await decodeBlocks(
      await runTransaction<unknown>("readonly", (store) =>
        store.get(BLOCKS_KEY),
      ),
    );
  } catch {
    // Storage disabled (private mode, blocked cookies) or a half-written
    // entry — fall through to the legacy read and start from what we can.
  }

  const legacy = readLegacyRaw();
  if (legacy) {
    blocks = mergeBlocks(blocks, legacy);
    clearLegacyRaw();
    void saveBlocks(blocks);
  }
  return blocks;
}

// Writes are serialised: two quick pastes must not race, and the last one to be
// requested has to be the one that lands.
let queue: Promise<unknown> = Promise.resolve();
let persistRequested = false;

// Ask once for storage that survives eviction. Safari drops origin data after
// seven days of no visits, which would silently lose a user's pastes.
function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    const pending = navigator.storage?.persist?.();
    if (pending) void pending.catch(() => {});
  } catch {
    /* Not supported — eviction stays possible, which is the status quo. */
  }
}

/**
 * Persist the blocks, replacing whatever was stored.
 *
 * Resolves false when the write could not be made, so the caller can tell the
 * user their paste is session-only. Safe to ignore otherwise.
 */
export function saveBlocks(blocks: StoredBlock[]): Promise<boolean> {
  const done = queue.then(async () => {
    try {
      requestPersistence();
      // Encode before opening the transaction: an IndexedDB transaction closes
      // as soon as it yields to the microtask queue, so awaiting inside the
      // callback would abort the write.
      const payload = await encodeBlocks(blocks);
      await runTransaction("readwrite", (store) =>
        store.put(payload, BLOCKS_KEY),
      );
      return true;
    } catch {
      return false;
    }
  });
  // Keep the chain alive even if a caller ignores the result.
  queue = done.catch(() => false);
  return done;
}

/** Drop everything this module stores, including the legacy key. */
export function clearBlocks(): Promise<void> {
  const done = queue.then(async () => {
    try {
      await runTransaction("readwrite", (store) => store.delete(BLOCKS_KEY));
    } catch {
      /* Already unreachable — nothing to clear. */
    }
  });
  queue = done;
  clearLegacyRaw();
  return done;
}
