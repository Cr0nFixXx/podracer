// ===== Session 14: persistent texture cache (IndexedDB) – later starts skip the procedural synthesis entirely =====
// Two stores: `sets` (key → byte maps) and `meta` (key → time + size) so pruning never has to load the big arrays.
import type { TexBytes } from './texCore';

const DB = 'podracer-textures', SETS = 'sets', META = 'meta', MAX_BYTES = 420 * 1024 * 1024;
let dbP: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbP) return dbP;
  dbP = new Promise(res => {
    try {
      if (typeof indexedDB === 'undefined') { res(null); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(SETS); rq.result.createObjectStore(META); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}
const done = (tx: IDBTransaction) => new Promise<void>(res => { tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res(); });

export async function texGet(keys: string[]): Promise<Map<string, TexBytes>> {
  const out = new Map<string, TexBytes>(); const db = await open(); if (!db || !keys.length) return out;
  try {
    const tx = db.transaction(SETS, 'readonly'), st = tx.objectStore(SETS);
    for (const k of keys) { const rq = st.get(k); rq.onsuccess = () => { const v = rq.result as TexBytes | undefined; if (v && v.map && v.nrm && v.rh) out.set(k, v); }; }
    await done(tx);
  } catch { /* cache unavailable → synthesise */ }
  return out;
}

export async function texPut(entries: [string, TexBytes][]) {
  const db = await open(); if (!db) return;
  try {
    for (const [key, b] of entries) {
      const tx = db.transaction([SETS, META], 'readwrite');
      tx.objectStore(SETS).put(b.em ? { map: b.map, nrm: b.nrm, rh: b.rh, em: b.em } : { map: b.map, nrm: b.nrm, rh: b.rh }, key);
      tx.objectStore(META).put({ t: Date.now(), bytes: b.map.length + b.nrm.length + b.rh.length + (b.em?.length ?? 0) }, key);
      await done(tx);
    }
    // prune: drop the oldest sets until the cache is below MAX_BYTES
    const tx = db.transaction(META, 'readonly'); const metas: { key: string; t: number; bytes: number }[] = [];
    tx.objectStore(META).openCursor().onsuccess = e => { const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result; if (c) { metas.push({ key: String(c.key), ...(c.value as { t: number; bytes: number }) }); c.continue(); } };
    await done(tx);
    let total = metas.reduce((a, m) => a + m.bytes, 0);
    if (total > MAX_BYTES) {
      metas.sort((a, b) => a.t - b.t);
      const del = db.transaction([SETS, META], 'readwrite');
      for (const m of metas) { if (total <= MAX_BYTES) break; del.objectStore(SETS).delete(m.key); del.objectStore(META).delete(m.key); total -= m.bytes; }
      await done(del);
    }
  } catch { /* quota exceeded / private mode → simply not cached */ }
}
