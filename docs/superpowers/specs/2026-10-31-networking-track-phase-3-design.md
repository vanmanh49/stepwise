# Networking track, phase 3: web and internet scale

Date: 2026-10-31
Status: approved design, awaiting spec review

## Goal

Make the last 8 **Web & Internet Scale** topics live, finishing the track at 23 of 23. A learner who finishes phase 3 can say what happens between typing a URL and seeing the page, why HTTP/2 and HTTP/3 exist, and how traffic finds its way across the internet.

## Decisions

- **Everything is a real run** (the user's choice). DNS runs over UDP, HTTP/1.1, HTTP/2 and WebSockets over the phase 2 TCP, and QUIC is a new transport over UDP. Head-of-line blocking is a result, not a script. HTTP/2 and QUIC share one Reno, so comparing them is fair.
- **TLS is round trips only** (the user's choice). TLS 1.3 records are real packets with real sizes, nothing is encrypted, and the lessons say so and link to `certificates-tls`.
- **Marks on the byte stream** (the user's choice of approach A). TCP keeps carrying byte counts. HTTP finds message boundaries through marks.
- **No new view kinds.** `View` stays at 20 kinds.
- **BGP has no TCP sessions.** Its messages go directly over links, because a session under every update would bury the path-vector story. The lesson says that real BGP uses TCP port 179.
- **Real fields, no bytes**, as before. HTTP headers are real fields in the panel, and bodies are byte counts. Lessons use no randomness, and only a test uses a seed.
- Phases 1 and 2 keep working unchanged, including their exact TCP traces.
- One spec, one plan, one PR on branch `networking-phase-3`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

The 8 topics are already in `curriculum.ts`, group `Web & Internet Scale`, difficulty `advanced`, in this order: `dns`, `http-1-1`, `http-2`, `quic-http-3`, `websockets`, `cdn-anycast`, `bgp`, `url-to-page`.

## 1. Engine (`src/networking/`)

### TCP (`tcp.ts`)

- `write(ctx, conn, bytes, mark?)` attaches an opaque `mark` to the last byte written.
- `Tcp` gains optional `marks`, the marks whose last byte falls inside a segment. They are worked out from the byte range, so a retransmission carries them with no extra state.
- `onData(bytes, marks)` gives the marks whose last byte has now arrived in order, so a lost segment delays every mark behind it.
- `listen` options gain `onConnection(conn)`, so a server can write back on the connection it accepted.

### Reno (new `reno.ts`)

`cwnd`, `ssthresh` and their rules move out of `tcp.ts` into functions both transports call: `onNewAck`, `onDupAcks`, `onTimeout`, each taking the state and the MSS. Phase 2's exact traces must pass unchanged.

### QUIC (new `quic.ts`)

`createQuic(host)` holds one host's connections, over UDP, and like `tcp.ts` is pure of the network.

- **Packets:** every packet has a new number, and a resent range always goes in a new packet, so an ACK is never ambiguous and there's no Karn problem.
- **Frames:** a stream frame carries stream id, offset and length. Each stream delivers in order on its own, and `onData(stream, bytes, marks)` reports per stream.
- **ACKs:** every data packet gets an ACK at once, listing ranges.
- **Loss:** a packet is lost once 3 later packets are acknowledged, or when the probe timer runs out. The timer uses phase 2's values: 1000 ms initial, 200 ms minimum, doubled per timeout, and the connection aborts after 5 retries.
- **Handshake:** 1 round trip with TLS built in. A returning client sends its request in the first packet (0-RTT).
- **Congestion:** `reno.ts`, with MSS 1000 and initial window 1 segment, as for TCP.
- Stream-level flow control and moving between networks are named in the text only.

### Packets and hosts

- `Udp.data` gains `Dns` and `Quic`, each with a `proto` field. `Dhcp` keeps working unchanged.
- `Frame.payload` gains `Bgp`. `ipLength` counts it as 40 bytes unless it has a `length`.
- `bindUdp(port, label, handler?)`: a handler receives each datagram, so a program can answer. Phase 2 callers keep working.
- `Device['type']` and the `services` node type gain `dns` and `as`.

### Applications (new `src/networking/app/`)

- **`dns.ts`:** a stub on the client, a recursive resolver with a TTL cache, and root, TLD and authoritative servers, all on UDP port 53. Answers are real records (`NS`, `A`) with TTLs. A missing name gets `NXDOMAIN`. A lost query is resent after 1000 ms, up to 2 retries.
- **`tls.ts`:** TLS 1.3 over a TCP connection as sized marks: ClientHello 300 bytes, ServerHello with certificate 3000 bytes, Finished 100 bytes. It adds 1 round trip before the first request.
- **`http.ts`:**
  - **HTTP/1.1:** one request at a time per connection, `Connection: keep-alive` or `close`, and up to 6 connections per host. Pipelining is left out.
  - **HTTP/2:** one connection and many streams, as HEADERS and DATA frames. Streams take turns with 1000-byte DATA frames. Header compression is a small real table: a header seen before costs 2 bytes.
  - **HTTP/3:** the same frames on QUIC streams.
  - **Servers:** a table of resources with sizes. A server may have an origin behind it and cache what it fetches, with `Age` and `X-Cache` headers. That is a CDN edge.
  - **WebSockets:** `Upgrade` and `101 Switching Protocols`, then frames in both directions, with ping every 1000 ms and a close after 2 missed pongs.
- **`bgp.ts`:** `createAs` routers exchange UPDATE and WITHDRAW with a real `AS_PATH`. Best path is highest local preference, then shortest path, then lowest neighbour AS. Export follows customer, peer and provider rules, and a route already holding this AS is ignored, so paths can't loop. A probe packet follows the chosen routes, so a hijack is visible in the traffic.

### Topologies (`scenarios/topology.ts`)

At most 6 nodes each.

- `dnsTree()`: Client, Resolver, Root, TLD, Authoritative.
- `webPath({ rate?, queue?, ms? })`: Client, Router, Server, on `tcpPath`'s values. Used by HTTP, QUIC and WebSockets.
- `cdnNet()`: Client, Router, two edges sharing one anycast address (the nearer by metric wins, using phase 1's `lookup`), and an Origin.
- `asNet()`: 5 or 6 ASes with named customer, peer and provider links.
- `pagePath()`: Client, Resolver, Authoritative, Router, Server. On a cold lookup the Resolver already knows root and TLD, as real ones usually do, so it asks the Authoritative server once. The full walk lives in the DNS lesson.

### Invalid input

As in phases 1 and 2: a bad number or choice gives one refusal step, and a lost packet past the end of a run is refused. DNS names are a choice, not free text, so no text field is used.

## 2. Views

- **Ladder:** DNS, HTTP/1.1, WebSockets and the handshakes.
- **Stream grid:** a `grid` with one row per stream, showing bytes arrived and a state: `waiting`, `sending`, `stalled` or `done`. A `streamGrid` helper in `steps.ts` builds it for HTTP/2 and QUIC.
- **Waterfall:** the `spans` waterfall already in `services`, with one bar per step: DNS, TCP, TLS and each resource. A `pageSpans` helper in `steps.ts` builds it from the run's events.
- **Network map:** `services` with the node types `dns` and `as`, used for the DNS hierarchy, CDN and BGP. A BGP node's badge is its AS number.
- Lesson views stay within 3 panels a step and 6 nodes. `ServicesRenderer` gains the two node labels.

## 3. Lessons

Each has the usual content, with a 4-question quiz of at least 3 types and one `predict-next` built from a real step, says what it simplifies, and ends with "on a real machine" and the tool.

| Lesson | Controls | Presets | What it shows |
|---|---|---|---|
| DNS | scene, name (`www.example.com`, `api.example.com`, `nothing.example.com`) | Cold lookup, Cached, No such name, Lost query | The resolver walks root, TLD and authoritative. A second lookup answers from cache until the TTL ends. `NXDOMAIN` is a real answer. A lost query is resent |
| HTTP/1.1 | resources (1–8), connections (1, 6), keep-alive (Yes, No) | New connection each, Keep-alive, Six connections | Requests and responses with real headers, one at a time per connection. Keep-alive saves handshakes. Six connections beat one, because one slow response blocks the rest |
| HTTP/2 | resources (2–6), lost (None, Segment 1–8) | Multiplexing, Header compression, Lost packet | Streams share one connection, taking turns. Header size falls as the table fills. One lost TCP segment stalls every stream |
| QUIC & HTTP/3 | visit (First, Returning), resources (2–6), lost (None, Packet 1–8) | Fresh connection, Returning visit, Lost packet | First byte 1 round trip sooner than TCP plus TLS, and 0-RTT on return. The same loss stalls one stream only |
| WebSockets | scene | Upgrade, Server push, Polling compared, Dead peer | An HTTP Upgrade, then frames both ways. Push against polling, in packets and delay. Pings find a dead peer |
| CDNs & Anycast | scene | Cache miss, Cache hit, Nearest edge, Edge fails | One address at two edges, and routing picks the nearer. A hit saves the trip to the origin. If an edge fails, routing moves to the other, and an open connection gets `RST` |
| BGP | scene | Shortest path, Link fails, Prepending, Hijack | Paths spread between ASes. Best-path choice and export rules. A withdraw reroutes. Prepending moves traffic. A more-specific prefix steals it |
| From URL to Page | protocol (`HTTP/1.1`, `HTTP/2`, `HTTP/3`), DNS (Cold, Cached), lost (None, Packet 3) | First visit, Cached DNS, HTTP/3, Lost packet | Everything in one run, with a waterfall from DNS to the last resource |

Round numbers, which each lesson states: MSS 1000, a 2000-byte page with resources of 8000 bytes, and TTL 60 s.

A lost `Segment n` or `Packet n` is the nth packet carrying response data from the server, counting only first sends. That makes "the same loss" mean the same thing on HTTP/2 and QUIC. From URL to Page's `Packet 3` counts the same way on all three protocols.

The last paragraph of `concept` names:

| Lesson | Tool |
|---|---|
| DNS | `dig +trace` |
| HTTP/1.1 | `curl -v` |
| HTTP/2 | `curl --http2 -v` |
| QUIC & HTTP/3 | `curl --http3` |
| WebSockets | the browser's Network panel |
| CDNs & Anycast | `curl -I` and `dig` |
| BGP | `traceroute` and a looking glass |
| From URL to Page | the browser's Network waterfall |

Prerequisites: DNS needs Ports & UDP. HTTP/1.1 needs TCP Connections. HTTP/2 and WebSockets need HTTP/1.1. QUIC & HTTP/3 needs HTTP/2 and Congestion Control. CDNs & Anycast needs DNS and HTTP/1.1. BGP needs Routing Tables. From URL to Page needs DNS and QUIC & HTTP/3.

## 4. Site changes

- `meta/networking.ts` gains the 8 lessons. `EXPECTED_IDS` gains the ids, and the count in `scripts/static-pages.test.ts` becomes `201 + 8 + 1`.
- README: 201 lessons, Networking complete at 23 of 23, and the new tests. `CLAUDE.md`: the `src/networking/` entry covers `reno.ts`, `quic.ts`, `app/` and marks.
- No routes, header or category changes.

## 5. Testing

- **Delivery property:** the seeded TCP test also covers data in both directions and marks arriving in order and once. A matching test covers QUIC, per stream.
- **Exact traces:** a DNS walk, each HTTP version's request sequence, the TLS handshake, QUIC's handshake, 0-RTT, and QUIC's loss detection.
- **Reno:** phase 2's traces pass unchanged after the move.
- **BGP:** best path, export rules, loop rejection, withdraw, and longest-prefix capture of a hijack.
- **Each lesson's teaching moment** in `scenarios/*.test.ts`, including:
  - QUIC's first byte arrives 1 round trip before HTTP/2 on TLS.
  - On the same loss, every HTTP/2 stream stalls and only one QUIC stream does.
  - Six connections finish before one.
  - A cache hit makes no trip to the origin.
- `contract.test.ts` covers the new lessons, with `RANGES` for number fields.
- `renderers.test.tsx` draws the new node types. Layout is checked by hand at 375 and 1024 px in both themes, using the app's own theme toggle.
- `npm run check:bundle` stays under 600 kB (427.4 kB before this work).
- The slowest lesson runs in under 200 ms in the browser. If not, narrow `watch`.

## Touch points

`src/networking/tcp.ts`, `packet.ts`, `devices.ts`, `steps.ts`, `scenarios/topology.ts`, new `reno.ts`, `quic.ts` and `app/`, `src/types/visualization.ts`, `renderers/ServicesRenderer.tsx`, `src/lessons/meta/networking.ts`, `src/lessons/networking/*.ts`, `src/lessons/lessons.test.ts`, `scripts/static-pages.test.ts`, `src/networking/contract.test.ts`, README.md and CLAUDE.md.

## Out of scope

- Real encryption, certificates, and session ticket details.
- HTTP pipelining, HTTP/2 server push, stream priorities, and stream-level flow control.
- QUIC connection migration, version negotiation and multipath.
- DNSSEC, DNS over HTTPS or TCP, and truncated answers.
- iBGP, route reflectors, RPKI, and BGP sessions over TCP.
- Page parsing, rendering, JavaScript, and browser caches.
- Two flows sharing a link, as in phase 2.
