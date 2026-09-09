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
}
export function openIndex(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("objekt-discord-capture", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("posts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openIndex();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", mode);
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Storage failed"));
    };
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
export function capture(block: StoredBlock, id: string): Promise<Entry> {
  return transaction("readwrite", (store, done) => {
    const key = id;
    const request = store.get(key);
    request.onsuccess = () => {
      const existing: Entry | undefined = request.result;
      if (existing) {
        let changed = false;
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
      const entry = { key, block, parsed };
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
export function count(): Promise<number> {
  return transaction("readonly", (store, done) => {
    const req = store.count();
    req.onsuccess = () => done(req.result);
  });
}
