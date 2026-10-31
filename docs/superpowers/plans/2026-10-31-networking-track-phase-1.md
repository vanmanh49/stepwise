# Networking Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Networking category (23 topics) and make its 8 Link & Internet lessons live, on a packet simulator with real header fields.

**Architecture:** New engine folder `src/networking/` (no React): `address` and `bytes` are pure; `packet` holds types; `sim` delivers frames on `EventQueue`; `devices`, `router` and `dhcp` hold device behaviour; `steps` turns events into steps; `scenarios/<id>.ts` builds each `form` lesson. No new view kind: `services` gains node types `host`, `switch`, `router` and `dhcp`.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-31-networking-track-phase-1-design.md`

## Global Constraints

- Branch `networking-phase-1` (the spec is committed). No worktrees.
- `src/networking/` contains no React; all lesson content lives in `src/lessons/networking/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Unusable input gives one step through `refusal(title, why, EMPTY)` from `algorithms/form.ts`.
- Limits: `MAX_STEPS = 200` plus one summary step; `MAX_EVENTS = 2000`; at most 6 nodes in a topology; message up to 32 bytes.
- Copy: plain, short sentences with the actual values. Every lesson's last `concept` paragraph contains "on a real machine" and names the tool from the spec's table.
- Lessons must be added in curriculum order: `lessons.test.ts` requires the live lessons to be the first topics.
- Commit messages carry no AI attribution. Prefix: `Networking:`.

## Plan-level rulings (refine the spec)

- `devices.ts` is split by responsibility: `devices.ts` (ARP helper, host, switch), `router.ts` (router, NAT), `dhcp.ts` (server; the client lives in the host).
- Switch aging and NAT mappings expire lazily, checked at lookup, because neither needs to act on its own. Only DHCP renewal uses timers, and `endAt` bounds it.
- Lessons with several stories gain a `scene` choice field, which is what the presets set.
- `/31` and `/32` get no gateway step: the second address is compared directly.
- Destination `255.255.255.255` or a subnet's broadcast is not forwarded by routers.

## Review Focus

1. A typed address with spaces around it, a leading zero (`010.0.0.1`) or a trailing slash: refused with one step, or trimmed for spaces. Test in Task 2.
2. A Routing Tables destination that is the sender itself, or a router's own interface: the run ends sensibly, with the router answering and no loop. Test in Task 11.
3. Ethernet with the same sender and receiver: one refusal step, not a self-delivery. Test in Task 8.
4. The smallest DHCP lease in the Renewal scene: many renewals stay within the step cap, ending in a summary. Test in Task 13.
5. Aging time 1 s or NAT timeout 1 s: an entry expires exactly as the clock says, at the boundary, and no reply crosses a mapping that has lapsed. Test in Tasks 8 and 14.

---

### Task 1: Category wiring and header

**Files:**
- Modify: `src/types/lesson.ts`, `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/lessonList.ts`, `src/lessons/registry.ts:87`, `src/lessons/all.testutil.ts:9`, `src/lessons/split.test.ts:7,26`, `src/lessons/lessons.test.ts`, `src/components/navigation/SearchPalette.tsx:8`, `src/pages/LessonPage.tsx`, `src/components/layout/Header.tsx`, `scripts/static-pages.test.ts:42`
- Create: `src/lessons/meta/networking.ts`

**Interfaces:**
- Produces: `networkingMeta: LessonMeta[]` (empty for now), category `'networking'`.

- [ ] **Step 1: Add a test `lists the Networking course in order` to `lessons.test.ts`**, modelled on the Security one: all 23 ids from the spec's curriculum table in order, groups `Link & Internet` × 8, `Transport` × 7, `Web & Internet Scale` × 8. Add `expect(lessonsIn('networking').map((l) => l.id)).toEqual(topicsIn('networking').slice(0, lessonsIn('networking').length).map((t) => t.id));` to the registry test. Add `'networking'` to the categories exempt from `complexity` at line 232.
- [ ] **Step 2: Run** `npx vitest run src/lessons/lessons.test.ts`. Expected: FAIL (type or empty topics).
- [ ] **Step 3: Wire it.** `Category` gains `'networking'`, after `'security'`. `CATEGORY_TITLE`: `Networking`. `CATEGORY_INTRO`: `'How a message really crosses the internet, from frames on a wire up to HTTP. Each lesson runs a simulated network on your settings, one packet at a time.'`. `curriculum.ts` gains three `topics('networking', …)` blocks. Meta file exports `networkingMeta`, spread last in `lessonList.ts`. Globs gain `networking`, and `split.test.ts` expects `networking.ts`. `CATEGORY_ICON`: `networking: Globe` (from lucide; Microservices already has `Network`). `CODE_COPY.networking`: same text as `security` with "the steps the network takes". `static-pages.test.ts`: `178 + 8 + 1`.
- [ ] **Step 4: Change the header.** In `Header.tsx`: main nav `lg:flex` → `xl:flex`; Sections nav `lg:hidden` → `xl:hidden`; search `lg:w-auto xl:w-56` → `xl:w-auto 2xl:w-56`; its span and kbd `lg:hidden xl:inline` → `xl:hidden 2xl:inline`.
- [ ] **Step 5: Run** `npx vitest run src/lessons scripts && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Check in a browser** that `document.documentElement.scrollWidth <= innerWidth` at 1024 and 1280 px. If 1280 overflows, make the link padding `px-2.5 2xl:px-3`.
- [ ] **Step 7: Commit** `Networking: add the category and its 23 topics`.

### Task 2: Addresses and bytes

**Files:**
- Create: `src/networking/address.ts`, `src/networking/bytes.ts`
- Test: `src/networking/address.test.ts`, `src/networking/bytes.test.ts`

**Interfaces:**
- Produces: `parseIp(text): Read<number>`, `parseCidr(text): Read<{ ip: number; prefix: number }>` (`Read` from `algorithms/form`), `mask(prefix): number`, `networkOf(ip, prefix): number`, `broadcastOf(ip, prefix): number`, `inSubnet(ip, network, prefix): boolean`, `formatIp(ip): string`; `ipv4Header({ src, dst, ttl, id, protocol, totalLength }): Uint8Array` (20 bytes, flags `0x4000`, version/IHL `0x45`), `checksum(bytes: Uint8Array): number` (returns the one's complement; 0 over a valid header).

- [ ] **Step 1: Write the tests.**

```ts
expect(formatIp(unwrap(parseIp(' 200.1.2.3 ')))).toBe('200.1.2.3');
for (const bad of ['1.2.3', '256.0.0.1', '1.2.3.4.5', '010.0.0.1', '+1.2.3.4', '1.2.3.-4', '']) expect(parseIp(bad).ok).toBe(false);
for (const bad of ['1.2.3.4/33', '1.2.3.4/', '1.2.3.4', '1.2.3.4/-1', '1.2.3.4/1e1']) expect(parseCidr(bad).ok).toBe(false);
expect(mask(0)).toBe(0);
expect(mask(32)).toBe(0xffffffff);
expect(formatIp(networkOf(ip('200.1.2.3'), 20))).toBe('200.1.0.0');
expect(formatIp(broadcastOf(ip('10.0.12.7'), 20))).toBe('10.0.15.255');
expect(inSubnet(ip('200.1.2.3'), ip('200.1.0.0'), 20)).toBe(true);
expect(inSubnet(ip('9.9.9.9'), 0, 0)).toBe(true);
expect(checksum(Uint8Array.of(0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7))).toBe(0x220d);
const header = ipv4Header({ src: ip('192.168.0.1'), dst: ip('192.168.0.199'), ttl: 64, id: 0, protocol: 17, totalLength: 0x73 });
expect((header[10]! << 8) | header[11]!).toBe(0xb861);
expect(checksum(header)).toBe(0);
```

- [ ] **Step 2: Run** `npx vitest run src/networking`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Octet regex `^(0|[1-9]\d{0,2})$`, range 0–255, trim only the outer text. Every bit result goes through `>>> 0`; `mask(0)` must be 0 because JS shifts by 32 are shifts by 0.
- [ ] **Step 4: Run** `npx vitest run src/networking`. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add address maths and the IPv4 checksum`.

### Task 3: Packets and simulator core

**Files:**
- Create: `src/networking/packet.ts`, `src/networking/sim.ts`
- Test: `src/networking/sim.test.ts`

**Interfaces:**
- Produces, in `packet.ts`: `BROADCAST_MAC`; `Arp { kind: 'arp'; op: 'request' | 'reply'; senderMac; senderIp; targetMac; targetIp }`; `Icmp { kind: 'icmp'; type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'unreachable'; seq: number }`; `Dhcp { op: 'discover' | 'offer' | 'request' | 'ack'; yourIp; serverIp; leaseS }`; `Udp { kind: 'udp'; srcPort; dstPort; data: string | Dhcp }`; `IpPacket { kind: 'ip'; src; dst; ttl; id; payload: Icmp | Udp }`; `Frame { srcMac; dstMac; payload: Arp | IpPacket }`. IPs are numbers, MACs are strings.
- Produces, in `sim.ts`:

```ts
export const MAX_EVENTS = 2000;
export interface TableSnapshot { title: string; columns: string[]; rows: string[][] }
export interface Note { action: string; title: string; why: string; before?: Frame; table?: { index: number; row: number } }
export interface Ctx {
  readonly now: number;
  /** Puts a frame on these ports' links, as one event. */
  send(ports: string[], frame: Frame, note: Note): void;
  /** Records a decision with no traffic. */
  note(note: Note, frame?: Frame): void;
  after(ms: number, fire: () => void): void;
  linkUp(port: string): boolean;
}
export interface Device {
  id: string; label: string; type: 'host' | 'switch' | 'router' | 'dhcp'; column: number;
  badge?(): string | undefined;
  receive(ctx: Ctx, frame: Frame, port: string): void;
  tables(): TableSnapshot[];
}
export interface Link { a: [device: string, port: string]; b: [device: string, port: string]; ms?: number }
export type Command = { at: number; device: string; run: (device: Device, ctx: Ctx) => void };
export type Fault =
  | { at: number; kind: 'linkDown'; link: number }
  | { at: number; kind: 'stopDevice'; device: string }
  | { at: number; kind: 'moveLink'; link: number; to: [device: string, port: string] }
  | { kind: 'dropPacket'; matches: (frame: Frame) => boolean; nth: number };
export interface Scenario { devices: Device[]; links: Link[]; commands: Command[]; faults?: Fault[]; endAt?: number }
export interface SimEvent extends Note { time: number; device: string; frame?: Frame; hops: { from: string; to: string; lost?: boolean }[]; tables: Record<string, TableSnapshot[]>; badges: Record<string, string> }
export interface SimResult { events: SimEvent[]; cut: boolean; devices: Device[]; links: Link[] }
export function simulate(scenario: Scenario): SimResult;
```

`Command` keeps the spec's `send`/`boot` as device method calls, which needs no second dispatch. `moveLink` is the spec's `moveHost`.

- [ ] **Step 1: Write the tests** with a stub `Device` that echoes frames: latency orders delivery (a 5 ms link arrives after a 1 ms link started later); faults run before commands at the same time; a down link delivers nothing and `ctx.linkUp` is false; `dropPacket` drops only the nth match and marks the hop `lost`; a stopped device receives nothing; `endAt` discards later events; two devices echoing forever stop with `cut: true` and `events.length <= MAX_EVENTS`; `tables` in an event doesn't change when a later event changes the device's rows.
- [ ] **Step 2: Run** `npx vitest run src/networking/sim.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** on `EventQueue` from `utils/eventQueue.ts`. Push faults first so `sequence` order runs them first. Queue a closure per item. `tables` calls every device's `tables()` per event, and device tables must return fresh arrays.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add the packet types and simulator`.

### Task 4: Hosts, ARP and switches

**Files:**
- Create: `src/networking/devices.ts`
- Test: `src/networking/devices.test.ts`

**Interfaces:**
- Consumes: Task 2 and Task 3.
- Produces:

```ts
export const ARP_TIMEOUT_MS = 1000;
export function createArp(initial?: Record<number, string>): {
  resolve(ctx, port: string, own: { mac: string; ip: number }, target: number, done: (mac: string | undefined) => void): void;
  receive(ctx, port: string, own: { mac: string; ip: number }, arp: Arp): void;
  table(): TableSnapshot;
};
export interface HostConfig { id; label; column; mac: string; ip: number; prefix: number; gateway?: number; arp?: Record<number, string> }
export interface Host extends Device {
  ping(ctx, dst: number, seq: number, ttl?: number): void;
  udp(ctx, dst: number, srcPort: number, dstPort: number, text: string): void;
  boot(ctx): void; // Task 6
  replies: { seq: number; from: number; type: Icmp['type']; rttMs: number }[];
}
export function createHost(config: HostConfig): Host;
export function createSwitch(config: { id; label; column; ports: string[]; agingS: number }): Device;
```

Host port is always `'eth0'`. Hosts send with a TTL of 64 unless told otherwise.

- [ ] **Step 1: Write the tests.** With two hosts on a switch: first ping sends an ARP broadcast, holds the packet, gets the reply and then delivers; a second ping skips ARP; the switch floods an unknown destination to every port except the arrival port, and unicasts once learned; an entry older than `agingS` floods again and one exactly `agingS` old still forwards; a frame for another MAC is dropped with action `not-mine`; a target that never answers gives action `arp-failed` at `ARP_TIMEOUT_MS`; a destination off the subnet ARPs for the gateway; the same frame from a new port moves the MAC table entry.
- [ ] **Step 2: Run** `npx vitest run src/networking/devices.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Action names: `arp-request`, `arp-reply`, `arp-hit`, `arp-failed`, `local`, `via-gateway`, `send`, `not-mine`, `echo-reply`, `reply-received`, `learn`, `flood`, `forward`, `aged-out`. Tables: host shows ARP cache (columns `IP`, `MAC`); switch shows `MAC`, `Port`, `Age`. `title`s and `why`s carry real values.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add hosts, ARP and switches`.

### Task 5: Routers and NAT

**Files:**
- Create: `src/networking/router.ts`
- Test: `src/networking/router.test.ts`

**Interfaces:**
- Consumes: `createArp`, `Host`.
- Produces:

```ts
export interface Route { network: number; prefix: number; nextHop?: number; port: string; metric: number }
export interface Interface { port: string; ip: number; prefix: number; mac: string }
export interface NatConfig { insidePort: string; outsidePort: string; publicIp: number; timeoutS: number }
export interface RouterConfig { id; label; column; interfaces: Interface[]; routes: Route[]; silent?: boolean; nat?: NatConfig }
/** Longest prefix first, then lowest metric, skipping routes on a down port. */
export function lookup(routes: Route[], dst: number, isUp: (port: string) => boolean): Route | undefined;
export function createRouter(config: RouterConfig): Device;
```

Connected routes are added from `interfaces`, with metric 0 and no `nextHop`. Tables: `Routes` (`Network`, `Via`, `Port`), plus `ARP` and, with NAT, `NAT` (`Inside`, `Public port`, `Expires`).

- [ ] **Step 1: Write the tests.** `lookup`: `/24` beats `/8` beats `/0`; equal prefixes take the lower metric; a down port falls back to the next route; nothing matches gives `undefined`. Router: a forward keeps `src` and `dst`, lowers `ttl` by 1, rewrites both MACs, and its event carries `before`; a TTL of 1 sends Time Exceeded from the arrival interface; no route sends `unreachable`; an unanswered next hop sends `unreachable`; a `silent` router sends no error; a ping to a router's own interface gets an echo reply; a broadcast destination is not forwarded. NAT: outbound rewrites source and keeps the inside port; a clash takes 40000, then 40001; a reply is restored; inbound with no mapping drops with action `nat-drop`; a mapping exactly `timeoutS` old has lapsed.
- [ ] **Step 2: Run** `npx vitest run src/networking/router.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Actions: `route-match`, `no-route`, `ttl-expired`, `forward-hop`, `echo-reply`, `nat-out`, `nat-new-port`, `nat-in`, `nat-drop`. Events on a match set `table: { index: 0, row }`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add routers and NAT`.

### Task 6: DHCP

**Files:**
- Create: `src/networking/dhcp.ts`
- Modify: `src/networking/devices.ts` (`boot`, DHCP client states)
- Test: `src/networking/dhcp.test.ts`

**Interfaces:**
- Produces: `createDhcpServer({ id, label, column, mac, ip, pool: number[], leaseS }): Device`, `DHCP_RETRY_MS = 4000`.

`boot` sends Discover from `0.0.0.0` (port 68 → 67) to `255.255.255.255`, retries once after `DHCP_RETRY_MS`, then takes `169.254.<mac byte 5>.<mac byte 6>`. After an Ack it renews by unicast at half the lease.

- [ ] **Step 1: Write the tests.** Discover, Offer, Request and Ack run in order and the host gets the lowest free address; a second client gets the next; with an empty pool the server stays silent and the host falls back to `169.254.0.2` for MAC `aa:00:00:00:00:02`; a stopped server gives the same fallback after exactly one retry; renewal fires at half the lease and keeps the same address; a lease past its end frees the address for another client (checked lazily at the next Discover).
- [ ] **Step 2: Run** `npx vitest run src/networking/dhcp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Actions: `dhcp-discover`, `dhcp-offer`, `dhcp-request`, `dhcp-ack`, `dhcp-silent`, `dhcp-retry`, `dhcp-fallback`, `dhcp-renew`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Networking: add DHCP`.

### Task 7: Layers & Encapsulation, and the lesson recipe

Later lesson tasks repeat this recipe.

**Recipe:** (a) write `src/networking/scenarios/<id>.test.ts` with the task's teaching moments; (b) write `scenarios/<id>.ts` exporting `fooCode`, its option lists and `fooSteps(values)`, reading fields with `readInt`, `readChoice` and `readText`, refusing with `refusal`; (c) add metadata to `meta/networking.ts` with no `complexity`; (d) write `src/lessons/networking/<id>.ts` shaped like `src/lessons/security/key-exchange.ts`: `overview`, `concept` (last paragraph as in Global Constraints, a paragraph stating what the simulation simplifies), `howItWorks`, a `form` visualization with `codeLabel: 'Pseudocode'`, `code`, `prosCons`, `applications`, `commonMistakes`, `summary`, and a 4-question `quiz` with at least one `predict-next` built from a real step; (e) add the id to `EXPECTED_IDS` and raise the first number in `static-pages.test.ts` by one; (f) add number fields to `RANGES` in `contract.test.ts`; (g) `npx vitest run src/networking src/lessons src/components/visualization/renderers scripts` passes; (h) commit `Networking: add the <title> lesson`. Delete `node_modules/.vitest-cache` if a test says "No content module for <id>".

**Files:**
- Create: `src/networking/steps.ts` (`MAX_STEPS`, `EMPTY`), `src/networking/contract.test.ts`, `src/networking/scenarios/layers-encapsulation.ts` + test, `src/lessons/networking/layers-encapsulation.ts`

**Interfaces:**
- Produces: `MAX_STEPS = 200`, `EMPTY: ArrayView`; `describe.each` contract test over every Networking lesson.

- [ ] **Step 1: Copy `security/contract.test.ts` to `src/networking/contract.test.ts`** with: category `networking`; `expect(lesson.concept.at(-1)).toContain('on a real machine')`; step cap `MAX_STEPS + 1`; `HOSTILE = ['1.2.3', '256.1.1.1', '1.1.1.1/99', '0.0.0.0', '255.255.255.255', '0.0.0.0/0', '/', '...', ' ', '٠.٠.٠.٠']`. `describe.each` needs at least one lesson, so write it with this task's lesson.
- [ ] **Step 2: Follow the recipe.** Fields: `message` (text, sample `hello`, read with `readBytes` from `security/steps.ts`, 1–32), `corrupt` (`No`, `Yes`). Presets `Clean`, `Corrupted byte`.
- Teaching moments: wrapping steps run application → UDP → IP → Ethernet and unwrapping runs the reverse; a step shows the header as a 5-row, 4-column `grid` of hex; the `Clean` run's last step has `variables.checksum === 0`; `Yes` flips a bit of the TTL byte and the run ends at the receiver's failed check with no unwrapping above IP; `message` of 33 bytes gives one step; `é` × 17 gives one step (34 bytes).

### Task 8: Step builders, node types and Ethernet & Switches

**Files:**
- Modify: `src/networking/steps.ts`, `src/types/visualization.ts`, `src/components/visualization/renderers/ServicesRenderer.tsx` (`TYPE_NAME`: `host`, `switch`, `router`, `dhcp server`)
- Create: `src/networking/steps.test.ts`, lesson files per the recipe

**Interfaces:**
- Produces:

```ts
export function packetGrid(frame: Frame, before?: Frame): GridView; // one row per field, changed fields role 'active'
export function tableGrid(table: TableSnapshot, device: string, row?: number): GridView;
export function networkView(result: SimResult, event: SimEvent, log: string[]): ServicesView;
/** One step per event; a Note's `action` picks the code line. Past MAX_STEPS the rest fold into one summary step. */
export function traceSteps(result: SimResult, code: string, lines: Record<string, string>): Step[];
```

`lines` maps action to a code snippet for `lineOf`; an action with no entry uses line 1. Messages have `progress: 0.5`, and a `lost` hop uses role `discarded` at `progress: 0.25`. Step `variables`: `time` (`12 ms`) plus the deciding device.

- [ ] **Step 1: Write `steps.test.ts`.** A router forward highlights TTL and both MACs and not the IPs; a step has at most 3 panels; a flood is one step with one message per port; a run of 300 events gives 201 steps ending in a summary that counts what it folded; every message's endpoints are linked.
- [ ] **Step 2: Run** `npx vitest run src/networking/steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** and run again. Expected: PASS. Commit `Networking: add the step builders and node types`.
- [ ] **Step 4: Follow the recipe for `ethernet-switching`.** Hosts A–D at `10.0.0.1`–`.4`, MACs `aa:00:00:00:00:01`–`04`, switch ports `p1`–`p4`. Fields: `scene` (`First frame`, `Reply`, `Aged out`, `Host moved`), `sender`, `receiver` (A–D), `aging` (1–600, default 300). `RANGES`: `aging: [1, 600]`.
- Teaching moments: `First frame` floods to 3 ports; `Reply` unicasts to 1; `Aged out` sends again at `aging + 1` s and floods; `Host moved` learns the MAC on the new port; `aging` = 1 keeps the entry at exactly 1 s; same sender and receiver gives one step.

### Task 9: ARP

**Files:** per the recipe.

- [ ] **Step 1: Follow the recipe.** Same 4 hosts. Fields: `target` (`10.0.0.2`, `10.0.0.3`, `10.0.0.9`), `cache` (`Empty`, `Already cached`). Presets `Cache miss`, `Cache hit`, `Nobody home`. Prerequisite `ethernet-switching`. ARP spoofing goes in `commonMistakes`.
- Teaching moments: a miss broadcasts one request, the reply returns one MAC, then the held packet goes; a hit has no ARP frame; `10.0.0.9` ends with `arp-failed` at 1000 ms.

### Task 10: IP Addresses & Subnets

**Files:** per the recipe; no simulator run.

- [ ] **Step 1: Follow the recipe.** Fields: `address` (text, sample `192.168.1.10/24`), `other` (text, sample `192.168.1.77`). Presets: `/24`, `/20` (`10.0.12.7/20`, `10.0.15.200`), `/31` (`10.0.0.0/31`, `10.0.0.1`), `Different subnets` (`192.168.1.10/24`, `192.168.2.10`). Bit rows are a text grid with one row per octet and `|` at the boundary. IPv6 gets a paragraph in `concept`.
- Teaching moments: `/24` gives network `192.168.1.0`, broadcast `192.168.1.255`, 254 hosts; `/20` gives `10.0.0.0`, `10.0.15.255`, 4094 hosts; `/31` gives 2 hosts and no broadcast; `/32` gives 1 host; `/0` runs; different subnets end "via the gateway"; every view's text row stays under 40 characters.

### Task 11: Routing Tables

**Files:**
- Create: `src/networking/scenarios/topology.ts` (shared with Task 12), plus the recipe's files

**Interfaces:**
- Produces: `threeRouters(options: { web?: boolean; loop?: boolean; backup?: boolean; silent?: boolean }): { devices: Device[]; links: Link[]; host: Host; ... }`. Host `10.1.0.2/24` (gateway `10.1.0.1`), R1 `10.1.0.1`, R1–R2 `10.12.0.0/30`, R2–R3 `10.23.0.0/30`, R3 `10.3.0.1`, server `10.3.0.2`. `web` adds host `192.0.2.10` on R3. `backup` adds R1–R3 `10.13.0.0/30`. R1 routes: `10.3.0.0/24` via R2 metric 1, `10.3.0.0/24` via R3 metric 2 with `backup`, `10.0.0.0/8` via R2, default via R2. R2: both ends, default via R3. R3: no default. `loop` makes R2's default point back to R1.

- [ ] **Step 1: Follow the recipe.** Fields: `destination` (text, sample `10.3.0.2`), `link` (`Up`, `Down`), `routes` (`Correct`, `Loop`). Presets: `Specific route`, `Default route` (`192.0.2.10`), `No route` (`198.51.100.7`), `Backup route` (link `Down`), `Routing loop` (`192.0.2.10`, `Loop`). Host TTL 8. Prerequisite `ip-subnets`.
- Teaching moments: `10.3.0.2` matches the `/24`, not the `/8`; the IPs never change across a run while the MACs change each hop; `No route` ends with `unreachable` from R3; `Down` goes through R3 directly; `Loop` ends in Time Exceeded after 8 hops; destination `10.1.0.2` (the host itself) ends with a local delivery, one step or more and no router; destination `10.12.0.2` (R2) gets R2's echo reply.

### Task 12: Ping & Traceroute

**Files:** per the recipe, using `threeRouters`.

- [ ] **Step 1: Follow the recipe.** Fields: `mode` (`Ping`, `Traceroute`), `ttl` (1–64, default 64), `drop` (`None`, `1`, `2`, `3`), `silent` (`No`, `Yes`). Presets `Ping`, `Traceroute`, `Silent router`, `Lost reply`. Ping sends 3 echoes, one per second. Traceroute sends TTL 1 to 4, one per 2000 ms, and ignores `ttl` and `drop`. The hop list is a `grid` (`Hop`, `Address`, `Time`), `*` for no answer. Prerequisite `ip-routing`. The lesson notes that Linux sends UDP by default and repeats each hop 3 times.
- Teaching moments: `Ping` shows 3 of 3 with RTTs; `Traceroute` lists R1, R2, R3, server in order; `Silent router` shows `*` at R2 and still reaches the server; `drop` = `2` shows 2 of 3; `ttl` = 2 shows Time Exceeded from R2; `ttl` = 1 from R1.

### Task 13: DHCP lesson

**Files:** per the recipe.

- [ ] **Step 1: Follow the recipe.** Laptop, phone, switch, server `10.0.0.1`, pool from `10.0.0.100`. Fields: `scene` (`First lease`, `Renewal`, `Pool exhausted`, `Server down`), `lease` (10–3600, default 60), `pool` (1–4, default 4). `Pool exhausted` boots both clients and sets the pool to 1. `Renewal` runs to `lease * 2.5`. `RANGES`: `lease: [10, 3600]`, `pool: [1, 4]`.
- Teaching moments: `First lease` is Discover, Offer, Request, Ack from `0.0.0.0`; `Renewal` renews at half the lease twice, keeping the address; `Pool exhausted` gives the phone a `169.254.x.x` address; `Server down` gives the laptop one; `lease` = 10 in `Renewal` stays within `MAX_STEPS + 1`.

### Task 14: NAT

**Files:** per the recipe.

- [ ] **Step 1: Follow the recipe.** Hosts A `192.168.1.10`, B `192.168.1.11`, switch, NAT router (public `198.51.100.1`, badge `NAT`), server `203.0.113.5`. Both send UDP to port 7. Fields: `scene` (`One host`, `Same port on two hosts`, `Unsolicited inbound`, `Mapping expired`), `port` (1024–65535, default 5000; host B's inside port), `timeout` (1–300, default 30). `Mapping expired` delays the server's reply until `timeout` seconds have passed. The server echoes. Prerequisite `ip-routing`. Explain ports in two sentences; link to `ports-udp` in the text only. `RANGES`: `port: [1024, 65535]`, `timeout: [1, 300]`.
- Teaching moments: `One host` rewrites the source to `198.51.100.1` and restores it on the reply; `Same port on two hosts` gives B port 40000; a different `port` keeps B's port; `Unsolicited inbound` ends with `nat-drop`; `Mapping expired` drops the reply with `timeout` = 1, at exactly 1 s.

### Task 15: Docs and final checks

**Files:**
- Modify: `index.html:6`, `src/pages/Home.tsx:102`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Update the text.** Site description in `index.html`, `Home.tsx`, README and `CLAUDE.md`: "…Kubernetes, AI, security and networking…". README: a track line with Networking (8 of 23 live), `networking/` in the tree, a "How to add a Networking lesson" section from the Task 7 recipe. `CLAUDE.md`: an architecture entry for `src/networking/`, the `contract.test.ts` entry, and "`networking/`" in the no-React list.
- [ ] **Step 2: Run everything.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, under 600 kB.
- [ ] **Step 3: Check in a browser**, at 375, 1024 and 1280 px in both themes: each topology (above all the triangle with `backup`), the hop list, the bit rows, and the header. Fix what overflows.
- [ ] **Step 4: Commit** `Networking: document the track`.
