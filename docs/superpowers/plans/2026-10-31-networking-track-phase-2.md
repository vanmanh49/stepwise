# Networking Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 7 Transport lessons live on one real TCP with Reno, adding link queues and the `ladder` and `chart` views.

**Architecture:** `sim.ts` gains link rates, queues and MTUs, all optional. New `tcp.ts` holds one host's connections and talks to the network through a small port the host provides. `devices.ts` exposes it, `router.ts` learns MTU handling, and `steps.ts` gains `ladderView` and `roundSteps` for the new views.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-31-networking-track-phase-2-design.md`

## Global Constraints

- Branch `networking-phase-2` (the spec is committed). No worktrees.
- `src/networking/` contains no React; all lesson content lives in `src/lessons/networking/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Unusable input gives one step through `refusal(title, why, EMPTY)`.
- Phase 1 behaviour must not change: `npx vitest run src/networking` keeps passing after every task.
- Limits: `MAX_STEPS = 200` plus one summary; `MAX_EVENTS = 2000` unless a scenario sets `maxEvents`; at most 3 panels per step; at most 6 nodes.
- Values: MSS 1000, initial `cwnd` 1 MSS, default `ssthresh` 64 MSS, RTO 1000 ms initial and 200 ms minimum, 5 retries, `TIME_WAIT` 2000 ms, sequence numbers from 1000 and 5000, client ports from 49152, receive buffer 64,000 bytes.
- Copy: plain, short sentences with the actual values. Each lesson's last `concept` paragraph contains "on a real machine" and the spec's tool. Each lesson states its round numbers and what it leaves out.
- Lessons go live in curriculum order.
- Commit messages carry no AI attribution. Prefix: `Networking:`.

## Plan-level rulings (refine the spec)

- `SimEvent.queues` keys are `${linkIndex}:${fromDevice}`, one per direction with a rate.
- A segment's IP length is `40 + tcp.length`. A UDP datagram's is `28 + bytes`.
- `Reliable Delivery`'s fixed window is counted in segments, and `lost` of a segment past the run's length is refused with one step.
- The `Paused reader` scene and any read rate of 0 read again at 2000 ms, at the rate 200 bytes/ms, so runs end.
- `lost: ACK 1` means the first data ACK.

## Review Focus

1. Reliable Delivery with `lost: Segment 8` and only 3 segments: one refusal step naming the valid range, not a silent clean run. Test in Task 10.
2. Flow Control with read rate 0 and the smallest buffer: the run ends with every byte read and stays within the cap. Test in Task 11.
3. Congestion Control at queue 2 and `ssthresh` 2: the transfer still finishes, with `cut` false. Test in Task 12.
4. MTU & MSS at 1500 on Fragmentation Needed or Black hole: nothing is too big, so the last step says so and no error appears. Test in Task 14.
5. Ports & UDP on `Closed port` with port 53 or 7: the program answers normally, with no Port Unreachable. Test in Task 8.

---

### Task 1: Packets and link queues

**Files:**
- Modify: `src/networking/packet.ts`, `src/networking/sim.ts`
- Test: `src/networking/sim.test.ts`

**Interfaces:**
- Produces, in `packet.ts`: `Tcp { kind: 'tcp'; srcPort; dstPort; seq; ack; flags: ('SYN'|'ACK'|'FIN'|'RST')[]; window; length; mss?: number }`; `IpPacket` gains `length?`, `df?`, `offset?`, `more?`, and `payload: Icmp | Udp | Tcp`; `Icmp['type']` gains `port-unreachable` and `frag-needed`, and `Icmp` gains `mtu?: number`; `ipLength(packet: IpPacket): number` (`length ?? 40`).
- Produces, in `sim.ts`: `Link` gains `rate?`, `queueBytes?`, `mtu?`; `Ctx.mtu(port): number | undefined`; `Scenario` gains `maxEvents?` and `watch?: string[]`; `SimEvent.queues: Record<string, number>`.

- [ ] **Step 1: Add tests to `sim.test.ts`:** two 1000-byte frames on `rate: 100` arrive 10 ms apart, then `ms` later; a frame that would pass `queueBytes` by 1 byte is dropped with action `queue-drop` and a lost hop, and one that exactly fills it is kept; the two directions of a link queue separately; `queues` falls back to 0 once drained; a link with no `rate` has the same arrival times as before; `maxEvents: 3` cuts at 3; `watch: ['a']` leaves other devices out of `tables`; `ctx.mtu` returns the link's value.
- [ ] **Step 2: Run** `npx vitest run src/networking/sim.test.ts`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.** A per-direction `freeAt` and `queued` beside the link list. Serialisation is `Math.ceil(ipLength ÷ rate)`. ARP frames count as 40 bytes.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add link rates, queues and MTUs`.

### Task 2: TCP open and close

**Files:**
- Create: `src/networking/tcp.ts`, `src/networking/tcp.test.ts`
- Modify: `src/networking/devices.ts`

**Interfaces:**
- Produces:

```ts
export type TcpState = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RCVD' | 'ESTABLISHED' | 'FIN_WAIT_1' | 'FIN_WAIT_2' | 'CLOSE_WAIT' | 'LAST_ACK' | 'TIME_WAIT';
export interface TcpOptions { ssthreshMss?: number; fixedWindow?: number; bufferBytes?: number; readRate?: number; onData?: (bytes: number) => void }
export interface Conn { id: string; state: TcpState; cwnd: number; ssthresh: number; inFlight: number; sent: number; acked: number; peerWindow: number; rto: number }
export interface TcpHost { ip(): number; mss(): number; transmit(ctx: Ctx, dst: number, tcp: Tcp, note: Note): void }
export function createTcp(host: TcpHost): {
  listen(port: number, options?: TcpOptions): void;
  connect(ctx: Ctx, dst: number, port: number, options?: TcpOptions): Conn;
  write(ctx: Ctx, conn: Conn, bytes: number): void;
  close(ctx: Ctx, conn: Conn): void;
  receive(ctx: Ctx, src: number, tcp: Tcp): void;
  lowerMss(ctx: Ctx, dst: number, mtu: number): void;
  connections(): Conn[];
  table(): TableSnapshot;
};
```

- `Host` gains `listen`, `connect`, `write` and `close`, with the signatures above. `tables()` index 2 is the Connections table (`Connection`, `State`, `Sent`, `Acked`, `Window`).
- Actions: `tcp-syn`, `tcp-syn-ack`, `tcp-established`, `tcp-rst`, `tcp-fin`, `tcp-ack`, `time-wait`, `tcp-closed`. Later tasks add `tcp-data`, `tcp-dup-ack`, `tcp-hold`, `timeout`, `fast-retransmit`, `abort`, `zero-window`, `probe`, `window-update`.

- [ ] **Step 1: Write tests** with two hosts on one link: the three segments carry `SYN seq=1000`, `SYN ACK seq=5000 ack=1001`, `ACK seq=1001 ack=5001`, with `ESTABLISHED` on both; a client close walks `FIN_WAIT_1`, `FIN_WAIT_2`, `TIME_WAIT`, `CLOSED` at +2000 ms while the server walks `CLOSE_WAIT`, `LAST_ACK`, `CLOSED`; a server close mirrors it; a SYN to a closed port gets `RST` and the client ends `CLOSED`; a second client connection uses port 49153; both sides advertise `mss` and use the smaller.
- [ ] **Step 2: Run** `npx vitest run src/networking/tcp.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** states in `tcp.ts`, and a `transmit` in the host that wraps a `Tcp` in an `IpPacket` with `length` and `df: true`, through the existing ARP path.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add TCP connections`.

### Task 3: Reliable delivery

**Files:** Modify `src/networking/tcp.ts`, test `src/networking/tcp.test.ts`.

- [ ] **Step 1: Write tests:** with `fixedWindow: 4`, `write` of 4000 bytes sends seq 1001, 2001, 3001, 4001 and ACKs reach 5001; losing the second gives ACK 2001 three more times and action `fast-retransmit` before any `timeout`; losing the last gives `timeout` at 1000 ms, then 2000 ms on a second loss (backoff); a retransmitted segment gives no RTT sample; a lost ACK is covered by the next, with no retransmit; 5 retries with no progress give `abort` and `RST`.
- [ ] **Step 2: Add the delivery property test:** for seeds 1–50, `rng` from `data-structures/random.testutil` drops 20% of matching frames both ways through `dropPacket` faults built up front, and `onData` totals exactly the bytes written, in order, or the connection aborted.
- [ ] **Step 3: Run** `npx vitest run src/networking/tcp.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the send queue, cumulative ACKs, out-of-order hold, the RFC 6298 timer with one retransmission timer per connection, and fast retransmit on the third duplicate.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `Networking: add TCP retransmission`.

### Task 4: Flow control and Reno

**Files:** Modify `src/networking/tcp.ts`, test `src/networking/tcp.test.ts`.

- [ ] **Step 1: Write tests.** Reno trace with exact values, in MSS: slow start 1, 2, 4, 8 by round; at `ssthresh` 8, `cwnd` grows by 1 per round; on 3 duplicate ACKs with 10 in flight, `ssthresh` 5 and `cwnd` 8, then 5 on the new ACK; on timeout, `cwnd` 1. Flow control: the advertised window equals free buffer; a sender stops at the peer's window; read rate 0 gives window 0, a 1-byte `probe` at each RTO, then a `window-update` once 1 MSS is free. `fixedWindow` leaves `cwnd` unused.
- [ ] **Step 2: Run** `npx vitest run src/networking/tcp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The app reads through `ctx.after`, in 10 ms ticks, stopping when the buffer is empty.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add flow control and Reno`.

### Task 5: Ports, MTU and fragments

**Files:** Modify `src/networking/devices.ts`, `src/networking/router.ts`; tests in `devices.test.ts`, `router.test.ts`.

**Interfaces:**
- Produces: `Host.bindUdp(port: number, label: string): void`; `Host` sends `size` with `udp(ctx, dst, srcPort, dstPort, text, { size?, df? })`; `HostConfig.mtu?: number`, and MSS is `mtu − 40`, else 1000. Actions: `port-unreachable`, `frag-needed`, `fragment`, `reassembled`, `black-hole`.

- [ ] **Step 1: Write tests:** a datagram to an unbound port gets Port Unreachable and to a bound one is delivered to that label; an `echo` host still answers on any port; a packet of exactly `mtu` passes and `mtu + 1` doesn't; `df` gets `frag-needed` with the link's `mtu`, and a `silent` router drops with `black-hole`; without `df`, 1400 bytes over MTU 1000 gives fragments of payload 976 and the rest, `more` then not, offsets multiples of 8; the host reassembles once, in either order; `frag-needed` calls `lowerMss` and the resend fits.
- [ ] **Step 2: Run** `npx vitest run src/networking`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.** The MTU check sits in `forward`, just before the send.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add ports, MTU and fragments`.

### Task 6: `ladder` and `chart` views

**Files:**
- Create: `src/components/visualization/renderers/LadderRenderer.tsx`, `ChartRenderer.tsx`, `chartPath.ts`, `chartPath.test.ts`
- Modify: `src/types/visualization.ts`, `src/components/visualization/roles.ts`, `renderers/index.tsx`, `renderers/ClusterParts.tsx`

**Interfaces:** Produces `LadderView` and `ChartView`, exactly as in the spec, and `sparkPath(points: number[], width: number, height: number, top: number): string`.

- [ ] **Step 1: Load the `dataviz` skill**, then write `chartPath.test.ts`: `sparkPath([0, 1], 100, 10, 1)` runs from bottom left to top right, one point doesn't divide by zero, an empty list gives `''`, and zero-valued points give no `NaN`.
- [ ] **Step 2: Run** `npx vitest run src/components/visualization/renderers/chartPath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `sparkPath`,** and use it in `TrafficStrip`.
- [ ] **Step 4: Add the view types, renderers and cases.** `rolesInView` returns ladder row roles and chart line roles. The second chart line is dashed. `aria-label` on the chart states each line's value at `now`. Ladder rows use stable ids.
- [ ] **Step 5: Run** `npx vitest run src/components && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `Networking: add the ladder and chart views`.

### Task 7: Step builders and topologies

**Files:** Modify `src/networking/steps.ts`, `steps.test.ts`, `scenarios/topology.ts`.

**Interfaces:**
- Produces: `ladderView(result: SimResult, upTo: number, columns: { id: string; label: string }[]): LadderView`; `TraceOptions.ladder?: { id: string; label: string }[]` (replaces the Network panel); `roundSteps(result, code, lines, { series: (event: SimEvent) => { label: string; value: number }[]; title: string; yLabel: string; threshold?: (event: SimEvent) => { value: number; label: string } | undefined; watchTable: string }): Step[]`; `tcpPath({ rate?, queue?, ms?, options? }): { client: Host; server: Host; devices; links; bottleneck: number }`; `mtuPath({ mtu, silent? }): { client; server; devices; links }`.

- [ ] **Step 1: Write tests in `steps.test.ts`:** a ladder keeps the newest 12 rows with `earlier` counting the rest; a ladder row for a lost hop has `lost`; column `state` follows the connection; `roundSteps` gives a step for each loss event, stays within `MAX_STEPS + 1`, and its chart's `now` rises by step; a step has at most 3 panels; `packetGrid` lists `Seq`, `Ack`, `Flags`, `Window`, and `Length` for TCP.
- [ ] **Step 2: Run** `npx vitest run src/networking/steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `tcpPath` defaults: `rate` 104 bytes/ms and `ms` 20 on Router→Server, so 10 ms per segment, with `queue` in packets × 1040 bytes.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add the ladder steps and round steps`.

### Lesson recipe (Tasks 8–14)

Each lesson follows phase 1's recipe: (a) `src/networking/scenarios/<id>.test.ts`, run it and watch it fail; (b) `scenarios/<id>.ts` exporting `fooCode`, option lists and `fooSteps(values)`; (c) metadata in `meta/networking.ts`, difficulty `intermediate`, group `Transport`, no `complexity`; (d) `src/lessons/networking/<id>.ts` with a 4-question quiz of at least 3 types, a `predict-next` from a real step whose view doesn't show the answer, options whose answer isn't the longest by far; (e) the id in `EXPECTED_IDS`, and +1 on the count in `static-pages.test.ts`; (f) number fields in `RANGES` of `contract.test.ts`; (g) `npx vitest run src/networking src/lessons src/components/visualization/renderers scripts` and `npx oxlint --deny-warnings src/networking src/lessons/networking` pass; (h) commit `Networking: add the <title> lesson`.

Delete `node_modules/.vitest-cache` if a test says "No content module for <id>". `hide` drops ARP and routing noise, as in `QUIET`.

### Task 8: Ports & UDP

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Port picks the program`, `Two programs`, `Closed port`, `Lost datagram`), `port` (1–65535, default 53). Server binds 53 as `dns` and 7 as `echo`. Prerequisites: none.
- Teaching moments: port 53 reaches `dns`; `Two programs` reaches both; `Closed port` at 9999 gets Port Unreachable; `Closed port` at 53 and at 7 gets none; `Lost datagram` ends with nobody told.

### Task 9: TCP Connections

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`Handshake and close`, `Refused`, `Lost SYN`), `closer` (`Client`, `Server`). Presets add `Server closes first`. Uses a ladder. Prerequisite `ports-udp`.
- Teaching moments: 3 handshake rows; `TIME_WAIT` on the closer only; `Refused` ends with `RST`; `Lost SYN` resends at 1000 ms.

### Task 10: Reliable Delivery

- [ ] **Step 1: Follow the recipe.** Fields: `segments` (1–8, default 6), `window` (`1`, `4`), `lost` (`None`, `Segment 1`…`Segment 8`, `ACK 1`). Presets `No loss`, `Timeout`, `Fast retransmit`, `Lost ACK`. Uses a ladder, with `fixedWindow`. Prerequisite `tcp-connections`.
- Teaching moments: the last segment lost needs the timer; an early one at window 4 fast-retransmits before the timer; `ACK 1` causes no resend at window 4; window 1 takes longer than window 4 with no loss; `lost: Segment 8` with 3 segments gives one step.

### Task 11: Flow Control

- [ ] **Step 1: Follow the recipe.** Fields: `buffer` (2000–64000, default 8000), `rate` (0–200, default 200). Presets `Fast reader`, `Slow reader` (rate 20), `Paused reader` (rate 0). Uses a ladder, with `fixedWindow`. Prerequisite `reliable-delivery`.
- Teaching moments: `Fast reader`'s window stays near the buffer; `Slow reader`'s shrinks; `Paused reader` reaches 0, probes, and resumes at 2000 ms; buffer 2000 at rate 0 finishes with every byte read.

### Task 12: Congestion Control

- [ ] **Step 1: Follow the recipe.** Fields: `queue` (2–40, default 10), `ssthresh` (2–64, default 64). Presets `Slow start`, `Sawtooth`, `Timeout` (queue 2). Uses `roundSteps`, `watch`, `maxEvents: 20000`, a 250-segment transfer. Chart: `cwnd` and a threshold for `ssthresh`. Prerequisite `reliable-delivery`.
- Teaching moments: `cwnd` doubles per round before the first loss; at least 2 halvings in `Sawtooth`; `Timeout` returns to 1; queue 2 at `ssthresh` 2 finishes with `cut` false. The lesson text says real stacks start at 10 and use CUBIC or BBR.

### Task 13: Queues & Bufferbloat

- [ ] **Step 1: Follow the recipe.** Fields: `buffer` (`5`, `20`, `100`). Presets `Small buffer`, `Big buffer`, `Huge buffer`. Uses `roundSteps`, with a chart of round-trip time and queue depth. Prerequisite `congestion-control`.
- Teaching moments: the highest round-trip time at 100 is over 3 times that at 5; throughput within 20%. If the defaults miss either figure, tune `tcpPath` values in the scenario, and ledger it. Keep the rule.

### Task 14: MTU & MSS

- [ ] **Step 1: Follow the recipe.** Fields: `scene` (`MSS agreed`, `Fragmented datagram`, `Fragmentation Needed`, `Black hole`), `mtu` (`576`, `1000`, `1500`, default 1000). Uses `mtuPath` and a ladder. Prerequisite `tcp-connections`.
- Teaching moments: client 1500 and server 1400 agree on MSS 1360; 1400 bytes without `df` is split and reassembled; `frag-needed` at 1000 lowers MSS to 960 and the data arrives; `Black hole` completes the handshake, then aborts after 5 retries; `mtu` 1500 on `Fragmentation Needed` or `Black hole` ends by saying nothing was too big.

### Task 15: Docs and final checks

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1: Update the text.** README: 193 lessons, Networking 15 of 23 live, the new tests. `CLAUDE.md`: `View` has 20 kinds including `ladder` and `chart`, the `src/networking/` entry covers `tcp.ts`, link queues, MTU and `roundSteps`, and the contract entry stays true.
- [ ] **Step 2: Run everything.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, under 600 kB.
- [ ] **Step 3: Measure the slowest lesson in a browser.** Expected: under 200 ms to generate. If not, narrow `watch`.
- [ ] **Step 4: Check in a browser** at 375 and 1024 px in both themes: step every preset, and read the ladder and chart in each state. If 2 chart lines don't read at 375 px, use one line per panel.
- [ ] **Step 5: Commit** `Networking: document the Transport lessons`.
