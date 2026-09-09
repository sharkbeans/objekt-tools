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
export function capture(block: StoredBlock): Promise<Entry> {
  return transaction("readwrite", (store, done) => {
    const key = messageKey(block.author, block.body);
    const request = store.get(key);
    request.onsuccess = () => {
      const existing: Entry | undefined = request.result;
      if (existing) {
        if (
          block.time &&
          (!existing.block.time ||
            Date.parse(block.time) > Date.parse(existing.block.time))
        ) {
          existing.block.time = block.time;
          existing.parsed.time = parseMessageTime(block.time);
          store.put(existing);
        }
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
