import {
  collect,
  messageKey,
  parseMessageTime,
  type TranscriptMessage,
} from "@/lib/discord/transcript";
import type { StoredBlock } from "@/lib/match/transcript-blocks";
export interface Entry {
  key: string;
  block: StoredBlock;
  parsed: TranscriptMessage;
  /**
   * The search run that produced this post, when one did.
   *
   * The index is cumulative and holds everything ever captured, channel
   * browsing included — so "what did this search find" is not answerable from a
   * total. Absent on posts collected by browsing a channel.
   */
  run?: string;
}
/**
 * The open database, kept for as long as the worker lives.
 *
 * Opening and closing per operation was fine while a capture was something
 * that happened as a person scrolled. A search run captures a page of
 * twenty-five posts at a time, and each one was paying for a fresh connection
 * — an open, an upgrade check and a close — before it could write a single
 * row. The worker is torn down when it goes idle, which closes this with it,
 * so there is nothing to clean up by hand.
 */
let connection: Promise<IDBDatabase> | null = null;

export function openIndex(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("objekt-discord-capture", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("posts", { keyPath: "key" });
    request.onsuccess = () => {
      const db = request.result;
      // Anything that closes the connection under us — an eviction, a version
      // change from another context, the browser reclaiming it — must not
      // leave a dead handle cached for the next write.
      db.onclose = () => {
        if (connection) connection = null;
      };
      db.onversionchange = () => {
        connection = null;
        db.close();
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = null;
      reject(request.error);
    };
  });
  // A failed open must not be remembered as the connection.
  connection.catch(() => {
    connection = null;
  });
  return connection;
}
export async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openIndex();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction("posts", mode);
    } catch (error) {
      // The handle went stale between being handed out and being used, which
      // is recoverable: drop it so the next call opens a fresh one.
      connection = null;
      reject(error);
      return;
    }
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("Storage failed"));
    work(tx.objectStore("posts"), (result) => {
      value = result;
    });
  });
}
/**
 * Store one post, keyed by Discord's message id.
 *
 * Keying on the content hash duplicated posts instead: Discord appends a server
 * tag to the rendered author as the row hydrates, so the same message was read
 * as "pbrihu" and "pbrihuWAV" and hashed to two different keys. The message id
 * does not change.
 */
export function capture(
  block: StoredBlock,
  id: string,
  run?: string,
): Promise<Entry> {
  return transaction("readwrite", (store, done) => {
    const key = id;
    const request = store.get(key);
    request.onsuccess = () => {
      const existing: Entry | undefined = request.result;
      if (existing) {
        let changed = false;
        // A post this search surfaced again belongs to this search, whenever it
        // was first seen.
        if (run && existing.run !== run) {
          existing.run = run;
          changed = true;
        }
        if (
          block.time &&
          (!existing.block.time ||
            Date.parse(block.time) > Date.parse(existing.block.time))
        ) {
          existing.block.time = block.time;
          existing.parsed.time = parseMessageTime(block.time);
          changed = true;
        }
        // Prefer the shorter reading: the tag is appended to the display name,
        // so the shorter one is the name without it.
        if (block.author.length < existing.block.author.length) {
          existing.block.author = block.author;
          existing.parsed.author = block.author;
          existing.parsed.key = messageKey(block.author, block.body);
          changed = true;
        }
        if (changed) store.put(existing);
        done(existing);
        return;
      }
      const parsed = collect([
        { ...block, time: block.time ? parseMessageTime(block.time) : null },
      ])[0];
      const entry: Entry = run
        ? { key, block, parsed, run }
        : { key, block, parsed };
      store.add(entry);
      done(entry);
    };
  });
}
export function entries(): Promise<Entry[]> {
  return transaction("readonly", (store, done) => {
    const req = store.getAll();
    req.onsuccess = () => done(req.result);
  });
}
export function clear(): Promise<void> {
  return transaction("readwrite", (store, done) => {
    store.clear();
    done();
  });
}
/** Posts stored, or just the ones a given search run produced. */
export function count(run?: string): Promise<number> {
  return transaction("readonly", (store, done) => {
    if (!run) {
      const req = store.count();
      req.onsuccess = () => done(req.result);
      return;
    }
    // No index on `run`: the store holds thousands at most, and this only runs
    // while the popup is open.
    const req = store.getAll();
    req.onsuccess = () =>
      done(req.result.filter((entry: Entry) => entry.run === run).length);
  });
}
