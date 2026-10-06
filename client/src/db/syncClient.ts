import { aiEndpoint } from '../utils/aiCatalog';

// The database is a full SQLite file and only grows with the collection, so
// this needs to comfortably cover a multi-megabyte transfer over mobile WiFi.
const TIMEOUT_MS = 20000;

function withTimeout(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** Reads the ETag, which is how every version comparison in the sync protocol
 *  works. It is NOT a CORS-safelisted response header, so a server missing
 *  `Access-Control-Expose-Headers: ETag` hands us null here. That must be a
 *  hard failure: treating a missing version as a valid one makes every copy
 *  look identical, which silently disables both pulling and conflict
 *  detection rather than reporting anything as broken. */
function readEtag(res: Response): string | null {
  const etag = res.headers.get('etag');
  if (!etag) {
    console.error(
      '[stacks sync] Server response is missing a readable ETag header. If the API is on a ' +
      'different origin it must send Access-Control-Expose-Headers: ETag. Sync is disabled ' +
      'until this is fixed, to avoid overwriting data.'
    );
    return null;
  }
  return etag;
}

export type PullResult =
  | { status: 'ok'; bytes: Uint8Array; etag: string }
  | { status: 'not-found' }
  | { status: 'unreachable' };

export async function pullFromServer(): Promise<PullResult> {
  const { signal, cancel } = withTimeout();
  try {
    const res = await fetch(aiEndpoint('/api/sync/db'), { signal });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'unreachable' };

    const etag = readEtag(res);
    if (etag === null) return { status: 'unreachable' };

    const buf = await res.arrayBuffer();
    return { status: 'ok', bytes: new Uint8Array(buf), etag };
  } catch {
    return { status: 'unreachable' };
  } finally {
    cancel();
  }
}

export type PushResult =
  | { status: 'ok'; etag: string }
  | { status: 'conflict'; serverEtag: string | null }
  | { status: 'unreachable' };

export async function pushToServer(bytes: Uint8Array, ifMatchEtag: string | null): Promise<PushResult> {
  const { signal, cancel } = withTimeout();
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (ifMatchEtag) headers['If-Match'] = ifMatchEtag;

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const res = await fetch(aiEndpoint('/api/sync/db'), { method: 'PUT', headers, body: buffer, signal });
    if (res.status === 409) return { status: 'conflict', serverEtag: res.headers.get('etag') };
    if (!res.ok) return { status: 'unreachable' };

    const etag = readEtag(res);
    if (etag === null) return { status: 'unreachable' };

    return { status: 'ok', etag };
  } catch {
    return { status: 'unreachable' };
  } finally {
    cancel();
  }
}
