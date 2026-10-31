import type { Host } from '../devices';
import type { Ctx } from '../sim';
import type { Conn } from '../tcp';

export const TLS_SIZES = { clientHello: 300, serverHello: 3000, finished: 100 };
/** Segments in the server's flight. A real server's window of 10 covers it, so one of 1 would add a round trip TLS doesn't have. */
export const TLS_FLIGHT_SEGMENTS = 3;

export interface TlsMark {
  type: 'tls';
  step: 'client-hello' | 'server-hello' | 'finished';
  label: string;
}

export const tlsMark = (mark: unknown): mark is TlsMark => (mark as TlsMark | undefined)?.type === 'tls';

/** Starts the handshake, and returns what to call with each TLS mark the server sends. */
export function tlsClient(ctx: Ctx, host: Host, conn: Conn, done: (ctx: Ctx) => void) {
  ctx.note({ action: 'tls-client-hello', title: 'ClientHello', why: `TLS starts once TCP is up. The ${TLS_SIZES.clientHello} bytes offer ciphers and a key share. Nothing here is really encrypted: this run only counts the round trips.` });
  host.write(ctx, conn, TLS_SIZES.clientHello, { type: 'tls', step: 'client-hello', label: 'ClientHello' });
  return (at: Ctx, mark: TlsMark) => {
    if (mark.step !== 'server-hello') return;
    at.note({ action: 'tls-finished', title: 'Finished', why: 'The client has the certificate and the key share, so it can send its Finished and its first request together.' });
    host.write(at, conn, TLS_SIZES.finished, { type: 'tls', step: 'finished', label: 'Finished' });
    done(at);
  };
}

export function tlsServer(ctx: Ctx, host: Host, conn: Conn, mark: TlsMark) {
  if (mark.step !== 'client-hello') return;
  ctx.note({ action: 'tls-server-hello', title: 'ServerHello and certificate', why: `The server answers in one flight of ${TLS_SIZES.serverHello} bytes: its key share, its certificate and its Finished.` });
  host.write(ctx, conn, TLS_SIZES.serverHello, { type: 'tls', step: 'server-hello', label: 'ServerHello' });
}
