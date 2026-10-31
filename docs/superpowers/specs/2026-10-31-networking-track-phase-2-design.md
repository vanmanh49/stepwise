# Networking track, phase 2: transport

Date: 2026-10-31
Status: approved design, awaiting spec review

## Goal

Make the 7 **Transport** topics live, on a real TCP in the packet simulator. A learner who finishes phase 2 can say how two programs reach each other, how TCP turns lost and out-of-order packets into a clean byte stream, and why a sender slows down when the receiver or the network can't keep up.

## Decisions

- **One real TCP with Reno** (the user's choice): one state machine in the simulated host, used by every TCP lesson. CUBIC and BBR are named in the text only.
- **Approach A for views** (the user's choice): two small new view kinds, `ladder` and `chart`, combined through `panels`.
- **Real fields, no bytes**, as in phase 1. A TCP payload is a byte count, not text.
- **Congestion is real.** Links get a rate and a queue, so loss comes from a queue overflowing. Other losses are scheduled faults. Lessons use no randomness, and only a test uses a seed.
- **Round numbers on purpose**, which each lesson states: MSS 1000 bytes, initial window 1 MSS, `TIME_WAIT` 2 s, initial sequence numbers 1000 and 5000.
- Phase 1's lessons keep working unchanged. New `Link` and packet fields are optional.
- One spec, one plan, one PR on branch `networking-phase-2`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

The 7 topics are already in `curriculum.ts`, group `Transport`, difficulty `intermediate`, in this order: `ports-udp`, `tcp-connections`, `reliable-delivery`, `flow-control`, `congestion-control`, `queues-bufferbloat`, `mtu-mss`.

## 1. Engine (`src/networking/`)

### Packets (`packet.ts`)

- `Tcp`: `kind: 'tcp'`, `srcPort`, `dstPort`, `seq`, `ack`, `flags` (a list of `SYN`, `ACK`, `FIN`, `RST`), `window`, `length`, and `mss` on a SYN.
- `IpPacket` gains optional `length` (total bytes), `df`, `offset` and `more`. A packet with no `length` counts as 40 bytes, so phase 1 runs are unaffected.
- `Icmp` gains the types `port-unreachable` and `frag-needed`, with `mtu` on the second.
- `IpPacket.payload` becomes `Icmp | Udp | Tcp`.

### Links (`sim.ts`)

`Link` gains optional `rate` (bytes per ms), `queueBytes` and `mtu`.

- With a `rate`, each direction has its own queue on the sending side. A frame waits for the frames ahead of it, then takes `ceil(ip length ÷ rate)` ms to send, then the link's `ms`. Times stay whole milliseconds.
- If the bytes waiting plus the frame's would pass `queueBytes`, the frame is dropped (tail drop). The event has action `queue-drop` and a lost hop.
- Events gain `queues: Record<linkIndex, bytes>`, the bytes waiting per link direction that has a rate.
- `Ctx` gains `mtu(port): number | undefined`.
- `Scenario` gains `maxEvents` (default `MAX_EVENTS`) and `watch?: string[]`, the device ids whose tables are snapshotted. With no `watch`, every device is, as now.

### TCP (`tcp.ts`)

`createTcp({ ip, mss, send, ... })` holds one host's connections, keyed by the 4-tuple, and is pure of the network: it gets segments and timers from the host.

- **States:** `CLOSED`, `LISTEN`, `SYN_SENT`, `SYN_RCVD`, `ESTABLISHED`, `FIN_WAIT_1`, `FIN_WAIT_2`, `CLOSE_WAIT`, `LAST_ACK`, `TIME_WAIT`. A simultaneous close is out of scope, so there is no `CLOSING`.
- **Open:** the client's initial sequence number is 1000 and the server's is 5000. Client ports count up from 49152. A SYN to a port with no listener gets `RST`. Both sides send `mss`, and each uses the smaller of the two.
- **Sending:** in flight never passes `min(cwnd, peer window)`, or the fixed window when a lesson sets one.
- **Receiving:** every data segment gets an ACK at once. Segments arriving out of order are held and acknowledged with a duplicate ACK.
- **Timer (RFC 6298):** initial RTO 1000 ms, minimum 200 ms, doubled per timeout. Retransmitted segments give no RTT sample (Karn). After 5 retries with no progress, the connection sends `RST` and aborts.
- **Fast retransmit:** on the third duplicate ACK.
- **Reno (RFC 5681):** `cwnd` starts at 1 MSS and `ssthresh` at the scenario's value, default 64 MSS. Below `ssthresh`, each new ACK adds 1 MSS. At or above it, each adds `MSS × MSS ÷ cwnd`. Three duplicate ACKs set `ssthresh = max(flight ÷ 2, 2 MSS)` and `cwnd = ssthresh + 3 MSS`, each further duplicate adds 1 MSS, and the next new ACK sets `cwnd = ssthresh`. A timeout sets `ssthresh` the same way and `cwnd = 1 MSS`.
- **Flow control:** a receive buffer (default 64,000 bytes) drained at `readRate` bytes per ms, with 0 meaning paused. The advertised window is the free space. When it is 0, the sender sends a 1-byte probe at each RTO. A receiver sends a window update once at least 1 MSS is free.
- **Close:** FIN both ways, then `TIME_WAIT` for 2000 ms on the side that closed first.

### Hosts and routers

- `Host` gains `listen(port, options)`, `connect(ctx, dst, port, options)`, `write(ctx, conn, bytes)`, `close(ctx, conn)`, `bindUdp(port, label)`, and an `onData` option that receives each in-order byte count. A host config may set `mtu`. MSS is then `mtu − 40`, otherwise 1000.
- A datagram to an unbound port gets Port Unreachable. A host config with `echo` keeps working, and counts as bound on every port.
- `tables()` gains a Connections table at index 2, with columns `Connection`, `State`, `Sent`, `Acked`, `Window`.
- Routers check the next link's `mtu`. An oversized packet with `df` gets `frag-needed`, unless the router is `silent`. One without `df` is split into fragments whose payload is a multiple of 8 bytes, and the destination host reassembles them by `id`.
- On `frag-needed`, TCP lowers its MSS to `mtu − 40` and resends.

### Steps (`steps.ts`, `scenarios/`)

- `traceSteps` gains an option that replaces the Network panel with a ladder.
- `ladderView(result, event, columns)` builds a `ladder` from the frames sent so far.
- `roundSteps(result, code, lines, options)` is for long runs. It gives one step per round of acknowledgements and one per loss event (`queue-drop`, `fast-retransmit`, `timeout`), within `MAX_STEPS` plus one summary. Each carries a `chart` of the run so far.
- Topologies are in `topology.ts`: `tcpPath({ rate, queue, ms })` (Client — Router — Server, the Router-to-Server link being the bottleneck, with 10 ms per segment and 20 ms of delay by default), and `mtuPath({ mtu })` (Client — R1 — R2 — Server, the R1–R2 link having the `mtu`, Server's host MTU 1400).
- Long runs set `watch` and `maxEvents: 20000`.

### Invalid input

As in phase 1: a bad number or choice gives one refusal step. Text fields are not used in phase 2.

## 2. Views

```ts
interface LadderView {
  kind: 'ladder';
  columns: { id: string; label: string; state?: string }[];
  rows: { id: string; from: string; to: string; label: string; role: Role; lost?: boolean }[];
  /** Older rows folded away. */
  earlier?: number;
}

interface ChartView {
  kind: 'chart';
  title: string;
  xLabel: string;
  yLabel: string;
  lines: { id: string; label: string; points: number[]; role: Role }[];
  threshold?: { value: number; label: string };
  /** Index of the current point. */
  now?: number;
}
```

- `ladder`: 2 to 4 columns, the newest 12 rows, and a lost packet stops halfway across. Plain HTML and SVG that fits 375 px.
- `chart`: 1 or 2 lines, axis labels, a marker at `now`, and an optional threshold, in SVG. It has `role="img"` and an `aria-label` with the current values. Line colours come from `roles.ts`, and the two lines differ in dash as well as colour, so colour isn't the only cue. Load the `dataviz` skill before writing it.
- `ClusterParts.tsx` and `ChartRenderer` share a `sparkPath` helper. The rest of `chart` is new.
- Both views need a renderer, and cases in `renderers/index.tsx` and `rolesInView`.
- A step has at most 3 panels. Short TCP lessons use Ladder, Packet and Connection. Long runs use Chart, Network and Connection, with queue depth as the bottleneck router's badge.

## 3. Lessons

Each has the usual content, with a 4-question quiz of at least 3 types and one `predict-next` built from a real step, says what it simplifies, and ends with "on a real machine" and the tool.

| Lesson | Controls | Presets | What it shows |
|---|---|---|---|
| Ports & UDP | scene, port (1–65535) | Port picks the program, Two programs, Closed port, Lost datagram | Datagrams to ports 53 and 7 reach different programs on one host. A closed port gets Port Unreachable. A lost datagram stays lost, and nobody is told |
| TCP Connections | scene (Handshake and close, Refused, Lost SYN), who closes (Client, Server) | one per scene, plus Server closes first | Three-way handshake with states on the ladder, FIN close, `TIME_WAIT` on the side that closed first. `RST` on a closed port. A lost SYN is resent after 1000 ms |
| Reliable Delivery | segments (1–8), window (1 or 4), lost (None, Segment 1–8, ACK 1) | No loss, Timeout, Fast retransmit, Lost ACK | Sequence numbers count bytes, ACKs are cumulative. Losing the last segment needs the timer. Losing an early one with window 4 gives 3 duplicate ACKs and a fast retransmit. A lost ACK is covered by the next |
| Flow Control | buffer (bytes: 2000–64000), read rate (bytes/ms: 0–200) | Fast reader, Slow reader, Paused reader | The advertised window tracks free space. A slow reader slows the sender. A paused one gives a zero window and probes until it reads again at 2 s |
| Congestion Control | queue (packets: 2–40), initial `ssthresh` (segments: 2–64) | Slow start, Sawtooth, Timeout | `cwnd` doubles per round trip, then grows by one, and halves on a tail drop. The Timeout preset's queue of 2 drops a burst, and the window restarts from 1 |
| Queues & Bufferbloat | buffer (packets: 5, 20, 100) | Small buffer, Big buffer, Huge buffer | Same link, similar throughput, and round-trip time climbing with the buffer. A chart of round-trip time and queue depth |
| MTU & MSS | scene, middle link MTU (576, 1000, 1500) | MSS agreed, Fragmented datagram, Fragmentation Needed, Black hole | Both sides advertise an MSS and use the smaller. A 1400-byte datagram without `df` is split. TCP with `df` gets `frag-needed` and resends smaller. A silent router makes the handshake work and data vanish, until TCP aborts after 5 retries |

Reliable Delivery and Flow Control set a fixed window, so congestion control can't hide what they teach.

The last paragraph of `concept` names:

| Lesson | Tool |
|---|---|
| Ports & UDP | `nc`, `ss -u` |
| TCP Connections | `ss -t` |
| Reliable Delivery | Wireshark |
| Flow Control | `ss -i` |
| Congestion Control | `ss -i` |
| Queues & Bufferbloat | `ping` during a large download |
| MTU & MSS | `tracepath`, `ping -M do` |

Prerequisites: TCP Connections needs Ports & UDP. Reliable Delivery and MTU & MSS need TCP Connections. Flow Control and Congestion Control need Reliable Delivery. Queues & Bufferbloat needs Congestion Control.

## 4. Site changes

- `meta/networking.ts` gains the 7 lessons. `EXPECTED_IDS` gains the ids, and the count in `scripts/static-pages.test.ts` becomes `193 + 8 + 1`.
- README: the lesson count, Networking 15 of 23 live, and the new tests. `CLAUDE.md`: `View` has 20 kinds, and the `src/networking/` entry covers TCP, link rates and `roundSteps`.
- No routes, header or category changes.

## 5. Testing

- **Delivery property** (`tcp.test.ts`): over seeded drop patterns on both directions, every byte reaches `onData` once and in order, and the connection closes or aborts cleanly. The seed exists only in the test.
- **Exact traces:** hand-checked sequences for the handshake, both closes, a timeout with backoff, fast retransmit, and Reno's `cwnd` and `ssthresh` through slow start, a loss and recovery.
- `sim`: queue order, serialisation time, tail drop at the exact byte, one queue per direction, and no change for a link with no `rate`.
- `router`: `df` and fragmenting at the exact MTU boundary, fragment offsets as multiples of 8, reassembly, and fragments arriving out of order.
- **Each lesson's teaching moment** in `scenarios/*.test.ts`, for example "the third duplicate ACK retransmits before the timer fires" and "Huge buffer's round-trip time is over 3 times Small buffer's, with throughput within 20%".
- `contract.test.ts` covers the new lessons, with `RANGES` for number fields.
- `renderers.test.tsx` draws the new views. Layout has no DOM tests: the ladder, chart, and long-run stepping are checked by hand at 375 and 1024 px in both themes.
- `npm run check:bundle` stays under 600 kB (423.5 kB before this work).
- The slowest lesson runs in under 200 ms in the browser. If not, narrow `watch`.

## Touch points

`src/networking/packet.ts`, `sim.ts`, `devices.ts`, `router.ts`, `steps.ts`, `scenarios/topology.ts`, new `tcp.ts`, `src/types/visualization.ts`, `components/visualization/roles.ts`, `renderers/index.tsx`, new `LadderRenderer` and `ChartRenderer`, `ClusterParts.tsx`, `src/lessons/meta/networking.ts`, `src/lessons/networking/*.ts`, `src/lessons/lessons.test.ts`, `scripts/static-pages.test.ts`, `src/networking/contract.test.ts`, README.md and CLAUDE.md.

## Out of scope

- Phase 3, including HTTP over this TCP (its own spec).
- SACK, delayed ACKs, Nagle, window scaling, timestamps, ECN, CUBIC and BBR (named in text only).
- Two flows sharing a link, and active queue management such as CoDel.
- Packet reordering by the network, and simultaneous open or close.
- Connection pools and the listen backlog.
- Random loss in lessons.
