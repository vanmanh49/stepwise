# Networking Track, Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last 8 Networking lessons live as real runs: DNS, HTTP/1.1, HTTP/2, QUIC & HTTP/3, WebSockets, CDNs & Anycast, BGP and From URL to Page.

**Architecture:** Reno moves to a shared `reno.ts`. TCP gains marks on its byte stream, so `src/networking/app/` can run DNS, TLS, HTTP and WebSockets on the existing hosts. New `quic.ts` is a second transport on UDP, and new `app/bgp.ts` is a device. Steps reuse `ladder`, `grid` and the `spans` waterfall in `services`.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-31-networking-track-phase-3-design.md`

## Global Constraints

- Branch `networking-phase-3` (the spec is committed). No worktrees.
- `src/networking/` contains no React; all lesson content lives in `src/lessons/networking/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Unusable input gives one step through `refusal(title, why, EMPTY)`.
- Phases 1 and 2 must not change: `npx vitest run src/networking` keeps passing after every task, with phase 2's exact traces unedited.
- `View` stays at 20 kinds.
- Limits: `MAX_STEPS = 200` plus one summary; `MAX_EVENTS = 2000` unless a scenario sets `maxEvents`; at most 3 panels per step; at most 6 nodes.
- Values: MSS 1000, initial window 1 segment, QUIC timer as TCP's (1000 ms initial, 200 ms minimum, doubled, 5 retries); ClientHello 300, ServerHello with certificate 3000, Finished 100 bytes; DNS TTL 60 s, DNS retry 1000 ms, 2 retries; page 2000 bytes, resources 8000 bytes; HTTP/2 DATA frames 1000 bytes; 6 connections per host; WebSocket ping every 1000 ms, closed after 2 missed pongs.
- Copy: plain, short sentences with the actual values. Each lesson's last `concept` paragraph contains "on a real machine" and the spec's tool. Each lesson states its round numbers and what it leaves out. Lessons that use TLS say nothing is encrypted and link `certificates-tls` by name.
- Lessons go live in curriculum order.
- Commit messages carry no AI attribution. Prefix: `Networking:`.

## Plan-level rulings (refine the spec)

- Apps surface state through `Host.addTable(table: () => TableSnapshot)`, appended after index 3, because step builders can only read event snapshots.
- `Conn` gains `gap: boolean` (out-of-order bytes are held). A stream is `stalled` when it is unfinished and its transport has a gap: on TCP the whole connection, on QUIC that stream only.
- A QUIC data packet is 1040 bytes on the wire, the same as a TCP segment, so the comparison is fair.
- WebSockets get their own file, `app/websocket.ts`, because `http.ts` would otherwise hold two jobs.
- `Resource` gains `delayMs`, so HTTP/1.1 can show one slow response blocking the rest.
- Marks ignore `readRate`: no app sets one. Leave a `shortcut:` comment.
- BGP peer failure is a scenario command, `as.peerDown(ctx, port)`, standing for the hold timer, because links don't notify devices.
- The resolver doesn't cache `NXDOMAIN`, so negative caching stays out of scope.

## Review Focus

1. From URL to Page, `Lost packet` with HTTP/1.1 and cold DNS: the page finishes, `cut` is false, and the waterfall shows the delay. Test in Task 19.
2. HTTP/1.1 with 1 resource and 6 connections: one connection opens, with no idle extras. Test in Task 13.
3. DNS `Cached` with `nothing.example.com`: the second lookup asks again and the last step says failed names aren't cached here. Test in Task 12.
4. QUIC `Returning` with `Packet 1` lost: the response recovers, and the first byte still beats a first visit. Test in Task 15.
5. CDN `Edge fails` when no connection is open: the next request reaches the other edge as a miss, with no `RST`. Test in Task 17.

---

### Task 1: Shared Reno

**Files:** Create `src/networking/reno.ts`, `reno.test.ts`. Modify `src/networking/tcp.ts`.

**Interfaces:**
- Produces, in `reno.ts`: `interface Reno { cwnd: number; ssthresh: number; dupAcks: number; recovering: boolean }`; `startReno(state: Reno, mss: number, ssthreshMss?: number): void` (default 64); `renoNewAck(state, mss): void`; `renoDupAck(state, mss, flight): boolean`, true on exactly the third; `renoTimeout(state, mss, flight): void`.

- [ ] **Step 1: Write `reno.test.ts`:** slow start adds 1 MSS; at `ssthresh` each ACK adds `MSS × MSS ÷ cwnd`; the third duplicate with 10000 in flight gives `ssthresh` 5000, `cwnd` 8000 and returns true, the second and fourth return false, the fourth adds 1000; the next new ACK sets `cwnd` to `ssthresh`; a timeout with 8000 in flight gives `cwnd` 1000 and `ssthresh` 4000; `ssthresh` never falls below 2 MSS.
- [ ] **Step 2: Run** `npx vitest run src/networking/reno.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement,** moving the rules out of `tcp.ts`. `Socket` satisfies `Reno` structurally, so `Conn` keeps its fields.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS, with `tcp.test.ts` unedited.
- [ ] **Step 5: Commit** `Networking: move Reno to its own file`.

### Task 2: Marks and server writes

**Files:** Modify `src/networking/tcp.ts`, `packet.ts`, `devices.ts`; test `tcp.test.ts`.

**Interfaces:**
- Produces: `Tcp.marks?: { end: number; mark: unknown }[]`; `write(ctx, conn, bytes, mark?: unknown)` on TCP and `Host`; `TcpOptions.onData?: (bytes: number, marks: unknown[]) => void`; `TcpOptions.onConnection?: (ctx: Ctx, conn: Conn) => void`, fired on `ESTABLISHED` on the server; `TcpOptions.onClosed?: (ctx: Ctx, conn: Conn) => void`; `Conn.gap: boolean`.

- [ ] **Step 1: Write tests:** a mark on the last of 3 segments reaches `onData` once, with the last bytes; with that segment's predecessor lost, the mark waits for the retransmission; two writes give two marks, in order; a retransmitted segment repeats its mark but `onData` gives it once; a mark split across segments comes with its last byte; `onConnection` fires once; a server writing on its connection delivers to the client's `onData`; `gap` is true only while bytes are held.
- [ ] **Step 2: Extend the seeded delivery test:** seeds 1–50, both sides write and each message's mark arrives once and in order, or the connection aborted. Its byte count still comes from what crossed the wire.
- [ ] **Step 3: Run** `npx vitest run src/networking/tcp.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** The sender keeps `{ end, mark }[]`, and each emitted range includes those ending inside it. The receiver keeps them until `rcvNxt` passes `end`.
- [ ] **Step 5: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 6: Commit** `Networking: add marks and server writes to TCP`.

### Task 3: Packets and host hooks

**Files:** Modify `src/networking/packet.ts`, `sim.ts`, `devices.ts`, `steps.ts`, `src/types/visualization.ts`, `renderers/ServicesRenderer.tsx`; test `devices.test.ts`, `renderers.test.tsx`.

**Interfaces:**
- Produces, in `packet.ts`: `DnsRecord { name: string; type: 'A' | 'NS'; value: string; ttl: number }`; `Dns { proto: 'dns'; id: number; name: string; response: boolean; rcode: 'NOERROR' | 'NXDOMAIN'; answers: DnsRecord[]; authority: DnsRecord[] }`; `Quic { proto: 'quic'; number: number; space: 'initial' | 'handshake' | '0rtt' | '1rtt'; frames: QuicFrame[]; acks: [from: number, to: number][] }`; `QuicFrame { stream: number; offset: number; length: number; fin?: boolean; marks?: { end: number; mark: unknown }[] }`; `Bgp { kind: 'bgp'; type: 'UPDATE' | 'WITHDRAW' | 'PROBE'; network: number; prefix: number; path: number[]; dst?: number }`; `Udp.data: string | Dhcp | Dns | Quic`; `Frame.payload: Arp | IpPacket | Bgp`.
- Produces, on `Host`: `udp` takes `data: string | Dns | Quic`; `bindUdp(port, label, handler?: (ctx: Ctx, src: number, udp: Udp) => void)`; `addTable(table: () => TableSnapshot): void`, in `tables()` from index 4. `Device['type']` and the `services` node type gain `dns` and `as`.

- [ ] **Step 1: Write tests:** a handler receives a datagram and suppresses the default `udp-received` note; `addTable` shows at index 4; a DHCP run behaves as before; a `Dns` datagram's `frameLabel` reads `DNS www.example.com` and `DNS answer`; `packetGrid` lists the DNS and QUIC fields; `services` draws nodes of type `dns` and `as` with no `undefined`.
- [ ] **Step 2: Run** `npx vitest run src/networking src/components`. Expected: FAIL.
- [ ] **Step 3: Implement.** `receiveIp` sends strings and `proto` data to `receiveUdp`, and the rest to DHCP. `ipLength` gives `Bgp` 40.
- [ ] **Step 4: Run** the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add DNS, QUIC and BGP packets and host hooks`.

### Task 4: DNS

**Files:** Create `src/networking/app/dns.ts`, `dns.test.ts`.

**Interfaces:**
- Produces: `dnsServer(host: Host, records: DnsRecord[]): void`; `dnsResolver(host: Host, root: number, seed?: DnsRecord[]): void`, with a TTL cache in a table titled `Resolver cache`; `lookup(ctx: Ctx, host: Host, resolver: number, name: string, done: (address: string | undefined) => void): void`. Actions: `dns-query`, `dns-referral`, `dns-answer`, `dns-cached`, `dns-nxdomain`, `dns-retry`, `dns-failed`.

- [ ] **Step 1: Write tests** on Client, Resolver, Root, TLD, Authoritative: a cold lookup visits root, TLD and authoritative in order; a second inside 60 s sends no query past the resolver; one after 60 s walks again; an unknown name returns `NXDOMAIN` and `undefined`; a query lost once is resent at +1000 ms; lost 3 times gives `dns-failed`; a `seed` skips root and TLD.
- [ ] **Step 2: Run** `npx vitest run src/networking/app/dns.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Datagrams are 28 + 100 bytes for a query and 28 + 200 for an answer.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add DNS`.

### Task 5: TLS and HTTP/1.1

**Files:** Create `src/networking/app/tls.ts`, `http.ts`, `http.test.ts`.

**Interfaces:**
- Produces, in `tls.ts`: `TLS_SIZES`, `tlsClient(ctx, host, conn, done: (ctx: Ctx) => void)`, `tlsServer(ctx, host, conn)`, and `tlsMark(mark): boolean` for routing marks. Actions: `tls-client-hello`, `tls-server-hello`, `tls-finished`.
- Produces, in `http.ts`: `HttpVersion = 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3'`; `Resource { path: string; bytes: number; delayMs?: number }`; `Fetch { path: string; startedAt: number; firstByteAt?: number; doneAt?: number; status: number; bytes: number; stream?: number }`; `httpServer(host: Host, options: { port: number; resources: Resource[]; version: HttpVersion; tls?: boolean; edge?: { origin: number; ttlS: number } }): void`; `httpClient(host: Host, options: { server: number; port: number; version: HttpVersion; tls?: boolean; keepAlive?: boolean; connections?: number }): { get(ctx: Ctx, paths: string[]): void; fetches: Fetch[]; opened: () => number }`. Tables: `Streams` (`Stream`, `Path`, `Bytes`, `State`). Actions: `http-request`, `http-first-byte`, `http-done`, `http-close`, `cache-hit`, `cache-miss`.

- [ ] **Step 1: Write tests:** one GET on TLS shows hello, hello, finished, then request, with TLS costing 1 round trip more than none; with `keepAlive: false`, 3 resources open 3 connections, and with it, 1; requests on one connection never overlap; at 6 connections, 3 resources open 3; a `delayMs` of 100 on the first resource delays everything behind it on 1 connection and only itself on 6; a 404 for an unknown path; an edge misses, fetches from its origin, and hits next time with `Age` set and no origin traffic.
- [ ] **Step 2: Run** `npx vitest run src/networking/app/http.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Request 400 bytes, response headers 200, marks carrying `{ type: 'request' | 'response', path, headers }` with real header fields.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add TLS and HTTP/1.1`.

### Task 6: HTTP/2

**Files:** Modify `src/networking/app/http.ts`; test `http.test.ts`.

- [ ] **Step 1: Write tests:** 4 resources share 1 connection; DATA frames take turns across streams, 1000 bytes each; the second request's headers are smaller than the first's, and a repeated header costs 2 bytes; a lost response segment gives `Streams` rows all `stalled` at the moment it is missing, for every unfinished stream; all streams finish after the retransmission.
- [ ] **Step 2: Add `dropResponse(server: Host, n: number): Fault`:** the nth packet from the server carrying response data, first sends only, skipping TLS. Test that it picks the same place at HTTP/1.1 and HTTP/2.
- [ ] **Step 3: Run** the same test file. Expected: FAIL.
- [ ] **Step 4: Implement** round-robin frames and the header table.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `Networking: add HTTP/2`.

### Task 7: QUIC

**Files:** Create `src/networking/quic.ts`, `quic.test.ts`.

**Interfaces:**
- Produces: `QuicConn { id: string; state: 'INITIAL' | 'HANDSHAKE' | 'ESTABLISHED' | 'CLOSED'; cwnd: number; ssthresh: number; rto: number; gaps: number[] }`, with `gaps` the stream ids holding bytes behind a gap; `createQuic(host: Host): { listen(port: number, options?: QuicOptions): void; connect(ctx: Ctx, dst: number, port: number, options?: QuicOptions): QuicConn; send(ctx: Ctx, conn: QuicConn, stream: number, bytes: number, mark?: unknown): void; connections(): QuicConn[]; table(): TableSnapshot }`; `QuicOptions { returning?: boolean; onData?: (ctx: Ctx, conn: QuicConn, stream: number, bytes: number, marks: unknown[]) => void; onConnection?: (ctx: Ctx, conn: QuicConn) => void }`. Actions: `quic-initial`, `quic-handshake`, `quic-0rtt`, `quic-data`, `quic-ack`, `quic-lost`, `quic-timeout`, `quic-abort`.

- [ ] **Step 1: Write tests:** a first connection's request leaves after 1 round trip; `returning` puts it in the first packet; a resent range has a new packet number; a packet is `quic-lost` once 3 later ones are acknowledged; the last packet lost needs the timer; a loss on stream 4 leaves `gaps` as `[4]`, and streams 0 and 8 keep delivering; ACK ranges cover a gap correctly; `cwnd` follows `reno.ts`; 5 retries give `quic-abort`.
- [ ] **Step 2: Add the delivery property:** seeds 1–50, 20% loss both ways, on 3 streams: each stream gets every byte once and in order, or the connection aborted. Count what crossed the wire.
- [ ] **Step 3: Run** `npx vitest run src/networking/quic.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Datagrams carry 1012 bytes of QUIC, so 1040 on the wire. Handshake flights are 1200, 3000 and 100 bytes. Use `bindUdp` handlers; nothing in `devices.ts` changes.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `Networking: add QUIC`.

### Task 8: HTTP/3

**Files:** Modify `src/networking/app/http.ts`; test `http.test.ts`.

- [ ] **Step 1: Write tests:** first byte at HTTP/3 comes about 1 round trip before HTTP/2 on TLS, on the same path; `returning` comes 1 round trip sooner again; header table as HTTP/2; `dropResponse` picks the same place as at HTTP/2; on that loss exactly 1 row is `stalled`, while HTTP/2 stalls them all.
- [ ] **Step 2: Run** the same test file. Expected: FAIL.
- [ ] **Step 3: Implement** the version over `createQuic`, sharing frames with HTTP/2.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add HTTP/3`.

### Task 9: WebSockets

**Files:** Create `src/networking/app/websocket.ts`, `websocket.test.ts`.

**Interfaces:**
- Produces: `wsServer(host: Host, port: number, onOpen: (ctx: Ctx, socket: WebSocketEnd) => void): void`; `wsClient(ctx: Ctx, host: Host, server: number, port: number, onOpen: (ctx: Ctx, socket: WebSocketEnd) => void): void`; `WebSocketEnd { send(ctx: Ctx, text: string, bytes: number): void; close(ctx: Ctx): void; received: string[] }`. Actions: `ws-upgrade`, `ws-switching`, `ws-frame`, `ws-ping`, `ws-pong`, `ws-dead`, `ws-close`.

- [ ] **Step 1: Write tests:** an `Upgrade` request gets `101` with a real `Sec-WebSocket-Accept` field; frames go both ways on one connection; a stopped peer gets `ws-dead` after 2 missed pongs at 1000 ms each; a clean close exchanges close frames.
- [ ] **Step 2: Run** `npx vitest run src/networking/app/websocket.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The accept value is a fixed example string, with a `shortcut:` comment, since nothing here is hashed.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add WebSockets`.

### Task 10: BGP

**Files:** Create `src/networking/app/bgp.ts`, `bgp.test.ts`.

**Interfaces:**
- Produces: `Relation = 'customer' | 'peer' | 'provider'`; `AsConfig { id: string; label: string; column: number; asn: number; neighbours: { port: string; relation: Relation; prepend?: number }[] }`; `createAs(config: AsConfig): AsRouter`; `AsRouter extends Device { announce(ctx: Ctx, network: number, prefix: number): void; withdraw(ctx: Ctx, network: number, prefix: number): void; peerDown(ctx: Ctx, port: string): void; probe(ctx: Ctx, dst: number): void; best(network: number, prefix: number): number[] | undefined }`. Local preference: customer 200, peer 150, provider 100. Actions: `bgp-update`, `bgp-withdraw`, `bgp-best`, `bgp-loop`, `bgp-filtered`, `bgp-probe`, `bgp-delivered`.

- [ ] **Step 1: Write tests:** an announcement spreads with `AS_PATH` growing by one AS per hop; a customer route beats a shorter peer route; equal preference takes the shortest path, then the lowest neighbour AS; a route holding this AS is rejected; a peer's route isn't exported to another peer or a provider; `peerDown` withdraws and traffic moves to the backup; prepending moves traffic to the other path; a more-specific prefix captures probes while the original still exists.
- [ ] **Step 2: Run** `npx vitest run src/networking/app/bgp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** A probe forwards hop by hop along the longest matching best route.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add BGP`.

### Task 11: Step builders and topologies

**Files:** Modify `src/networking/steps.ts`, `steps.test.ts`, `scenarios/topology.ts`.

**Interfaces:**
- Produces: `streamGrid(table: TableSnapshot): GridView`; `pageSpans(table: TableSnapshot, nowMs: number, endMs: number): NonNullable<ServicesView['spans']>`; `TraceOptions.spans?: (event: SimEvent) => ServicesView['spans']`; `dnsTree()`, `webPath({ rate?, queue?, ms? })`, `cdnNet()`, `asNet()`, `pagePath()`, each returning its hosts, `devices` and `links`. Each has at most 6 nodes.

- [ ] **Step 1: Write tests:** `streamGrid` gives one row per stream with unique cell ids, and `stalled` uses role `discarded`, `done` `found`, `sending` `active`; `pageSpans` leaves a running phase open; `spans` reaches the Network panel; a step stays within 3 panels; a ladder row reads `DNS www.example.com`.
- [ ] **Step 2: Run** `npx vitest run src/networking/steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** A `Page` table has columns `Phase`, `Start`, `Ms`. `webPath` shares `tcpPath`'s defaults.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add stream, waterfall and web path steps`.

### Lesson recipe (Tasks 12–19)

Each lesson follows phase 2's recipe: (a) `src/networking/scenarios/<id>.test.ts`, run it and watch it fail; (b) `scenarios/<id>.ts` exporting `fooCode`, option lists and `fooSteps(values)`; (c) metadata in `meta/networking.ts`, difficulty `advanced`, group `Web & Internet Scale`, no `complexity`; (d) `src/lessons/networking/<id>.ts` with a 4-question quiz of at least 3 types, a `predict-next` from a real step whose view doesn't show the answer, and options whose answer isn't the longest by far; (e) the id in `EXPECTED_IDS`, and +1 on the count in `static-pages.test.ts`; (f) number fields in `RANGES` of `contract.test.ts`; (g) `npx vitest run src/networking src/lessons src/components/visualization/renderers scripts` and `npx oxlint --deny-warnings src/networking src/lessons/networking` pass; (h) commit `Networking: add the <title> lesson`.

Use `endWith` for closing steps. Long runs hide `tcp-data`, `tcp-ack` and `forward-hop`, so steps are milestones. Delete `node_modules/.vitest-cache` if a test says "No content module for <id>". Check that a quiz's claim is true of the step it shows.

### Task 12: DNS

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Cold lookup`, `Cached`, `No such name`, `Lost query`), `name` (`www.example.com`, `api.example.com`, `nothing.example.com`). Uses `dnsTree`, with a ladder of Resolver, Root, TLD and Authoritative (4 columns is the ladder's limit), and the network map, which shows the Client's own query. Prerequisite `ports-udp`.
- Teaching moments: `Cold lookup` makes 3 referrals or answers; `Cached` sends nothing past the resolver; `No such name` ends with `NXDOMAIN`; `Lost query` resends at 1000 ms; `Cached` with `nothing.example.com` asks twice and says failed names aren't cached here.

### Task 13: HTTP/1.1

- [ ] **Step 1: Follow the recipe.** Fields: `resources` (1–8, default 4), `connections` (`1`, `6`), `keepAlive` (`Yes`, `No`). Presets `New connection each`, `Keep-alive`, `Six connections`. Uses `webPath` with a ladder, no TLS, and a 100 ms `delayMs` on the first resource. Prerequisite `tcp-connections`.
- Teaching moments: `New connection each` has one handshake per resource; `Keep-alive` has 1; `Six connections` finishes before one; 1 resource at 6 connections opens 1.

### Task 14: HTTP/2

- [ ] **Step 1: Follow the recipe.** Fields: `resources` (2–6, default 4), `lost` (`None`, `Segment 1`…`Segment 8`). Presets `Multiplexing`, `Header compression`, `Lost packet` (Segment 3). Uses `webPath`, TLS, `streamGrid`. Prerequisite `http-1-1`.
- Teaching moments: one connection; frames interleave; header size falls; on loss every unfinished stream is `stalled`; a loss on the last data segment still finishes, with the timer.

### Task 15: QUIC & HTTP/3

- [ ] **Step 1: Follow the recipe.** Fields: `visit` (`First`, `Returning`), `resources` (2–6, default 4), `lost` (`None`, `Packet 1`…`Packet 8`). Presets `Fresh connection`, `Returning visit`, `Lost packet` (Packet 3). Uses `webPath`, `streamGrid`. Prerequisites `http-2`, `congestion-control`.
- Teaching moments: first byte beats HTTP/2 by about 1 round trip, compared in the closing step; 0-RTT is sooner again; on loss exactly 1 stream is `stalled`; `Returning` with `Packet 1` lost still beats a first visit.

### Task 16: WebSockets

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Upgrade`, `Server push`, `Polling compared`, `Dead peer`). Uses `webPath` with a ladder. Prerequisite `http-1-1`.
- Teaching moments: `Upgrade` ends in `101`; `Server push` delivers with no request; `Polling compared` states packets and delay for both, polling every 1000 ms against 3 messages at 300, 1700 and 2600 ms; `Dead peer` closes after 2 missed pongs.

### Task 17: CDNs & Anycast

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Cache miss`, `Cache hit`, `Nearest edge`, `Edge fails`). Uses `cdnNet`, `dnsResolver` for the name, and `httpServer` with `edge`. Prerequisites `dns`, `http-1-1`.
- Teaching moments: a miss reaches the origin; a hit doesn't, and has `Age`; the nearer edge wins by metric; an edge failure during a transfer gives `RST` and a retry on the other edge; a failure with nothing open gives a miss and no `RST`.

### Task 18: BGP

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Shortest path`, `Link fails`, `Prepending`, `Hijack`). Uses `asNet` and the network map with an AS routes table. Prerequisite `ip-routing`.
- Teaching moments: the expected `AS_PATH` at each AS; a withdraw reroutes the probe; prepending moves the probe; the hijack's more-specific prefix captures it. The text says real BGP runs on TCP port 179.

### Task 19: From URL to Page

- [ ] **Step 1: Follow the recipe.** Fields: `protocol` (`HTTP/1.1`, `HTTP/2`, `HTTP/3`), `dns` (`Cold`, `Cached`), `lost` (`None`, `Packet 3`). Presets `First visit`, `Cached DNS`, `HTTP/3`, `Lost packet`. Uses `pagePath`, `pageSpans`, a 2000-byte page and 3 resources of 8000 bytes. Prerequisites `dns`, `quic-http-3`.
- Teaching moments: the waterfall has DNS, TCP, TLS and resource rows, and HTTP/3 has no separate TCP row; `Cached DNS` has no DNS row and is faster; HTTP/3 reaches first byte sooner; `Lost packet` at HTTP/1.1 and cold DNS finishes with `cut` false.

### Task 20: Docs and final checks

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1: Update the text.** README: 201 lessons, Networking 23 of 23, the track complete, the new tests. `CLAUDE.md`: the `src/networking/` entry covers `reno.ts`, `quic.ts`, `app/`, marks and `addTable`, and `View` stays at 20 kinds.
- [ ] **Step 2: Run everything.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, under 600 kB.
- [ ] **Step 3: Measure the slowest lesson in a browser.** Expected: under 200 ms to generate. If not, narrow `watch`.
- [ ] **Step 4: Check in a browser** at 375 and 1024 px in both themes, using the app's theme toggle: step every preset, and look at screenshots of the stream grid, waterfall and network maps, since an overflow check can't judge them.
- [ ] **Step 5: Commit** `Networking: document the Web & Internet Scale lessons`.
