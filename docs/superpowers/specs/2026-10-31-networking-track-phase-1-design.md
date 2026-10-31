# Networking track, phase 1: link and internet

Date: 2026-10-31
Status: approved design, awaiting spec review

## Goal

Add an eighth category, **Networking**, that explains what happens when you type a URL, one layer at a time, from frames on a wire up to HTTP. Phase 1 builds a packet simulator and makes the 8 **Link & Internet** topics live. The other 15 topics show as Coming soon.

A learner who finishes phase 1 can follow one packet from a host to a distant server, and say which addresses change at each hop, which stay the same, and why.

## Decisions

- **Whole stack, bottom-up** (the user's choice), in three phases: Link & Internet (beginner), Transport (intermediate), Web & Internet Scale (advanced). Each phase has its own spec, plan and PR.
- **Real fields, no bytes** (the user's choice). Headers hold their real fields and devices behave as real ones do, drawn as labelled headers. Bytes appear only in Layers & Encapsulation.
- **A new simulator in `src/networking/`** (approach A, the user's choice). The Microservices simulator works at request level, so ARP, TTL and address rewrites don't fit it.
- **No new view kind in phase 1.** Steps use `services`, `grid` and `panels`. The `ladder` packet timeline waits for phase 2, where TCP needs it.
- **The existing `form` input** drives every lesson, as in the other tracks.
- **Everything runs in the page.** No real network calls. Lesson code is short pseudocode.
- **Every lesson names the real tool.** The last paragraph of `concept` says what to run on a real machine.
- **Existing lessons are linked, not repeated**: `certificates-tls`, `load-balancing`, `service-discovery` and the Kubernetes networking lessons.
- One spec, one plan, one PR on branch `networking-phase-1`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

All 23 topics go into `curriculum.ts` under category `networking` (title "Networking"), with a group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | Link & Internet | `layers-encapsulation`: Layers & Encapsulation · `ethernet-switching`: Ethernet & Switches · `arp`: ARP · `ip-subnets`: IP Addresses & Subnets · `ip-routing`: Routing Tables · `ping-traceroute`: Ping & Traceroute · `dhcp`: DHCP · `nat`: NAT |
| intermediate | Transport | `ports-udp`: Ports & UDP · `tcp-connections`: TCP Connections · `reliable-delivery`: Reliable Delivery · `flow-control`: Flow Control · `congestion-control`: Congestion Control · `queues-bufferbloat`: Queues & Bufferbloat · `mtu-mss`: MTU & MSS |
| advanced | Web & Internet Scale | `dns`: DNS · `http-1-1`: HTTP/1.1 · `http-2`: HTTP/2 · `quic-http-3`: QUIC & HTTP/3 · `websockets`: WebSockets · `cdn-anycast`: CDNs & Anycast · `bgp`: BGP · `url-to-page`: From URL to Page |

None of these ids is used by another category (checked against `curriculum.ts` and `meta/`). Only the 8 Link & Internet topics are registered in phase 1.

## 1. Engine (`src/networking/`)

No React, the same layering as the other tracks. Entry points never throw. Nothing reads the clock or `Math.random`: addresses are fixed, NAT ports count up from 40000, and DHCP hands out the lowest free address, so runs repeat exactly. Phase 1 has no randomness, so `seeded` isn't used. Time is simulated milliseconds.

### Packets (`packet.ts`)

Plain typed objects, nested the way real ones are:

- `Frame`: `srcMac`, `dstMac`, and a payload of `Arp` or `IpPacket`.
- `Arp`: `op` (request or reply), sender and target MAC and IP.
- `IpPacket`: `src`, `dst`, `ttl`, `id`, and a payload of `Icmp` or `Udp`.
- `Icmp`: Echo Request, Echo Reply, Time Exceeded, Destination Unreachable, with `seq`.
- `Udp`: `srcPort`, `dstPort`, and a payload of `Dhcp` or text. Only this much UDP, because DHCP and NAT need ports. Phase 2 teaches it.
- `Dhcp`: Discover, Offer, Request, Ack, with `yourIp`, `leaseS` and `serverIp`.

### Addresses (`address.ts`)

`parseIp`, `parseCidr` (strict: four octets of 0–255, prefix 0–32, returning `{ ok, error }`), `mask`, `networkOf`, `broadcastOf`, `inSubnet` and `formatIp`. Addresses are unsigned 32-bit numbers; bit work goes through `>>> 0` so they stay unsigned.

`/31` has two usable hosts and no broadcast (RFC 3021), and `/32` has one. `broadcastOf` and the lesson handle both.

### Bytes (`bytes.ts`)

`ipv4Header(packet)` returns the 20 bytes of a header, and `checksum(bytes)` computes the RFC 1071 one's-complement sum. Only Layers & Encapsulation uses them. There is no decoding: the receiving step recomputes the checksum over the same bytes.

### Devices (`devices.ts`)

Per-run factories, each with its own state:

- **Host**: IP, mask, gateway and ARP cache. It decides local or via the gateway, asks ARP on a miss while holding the packet, answers ARP and ping, and drops frames for another MAC.
- **Switch**: learns the source MAC per port, forwards to a known port, floods an unknown or broadcast destination everywhere except the arrival port, and ages entries out after `agingS`.
- **Router**: one IP and MAC per interface, an ARP cache per interface, and a routing table of `{ prefix, nextHop?, interface, metric }`. Longest prefix wins, then lowest metric. A route through a down link doesn't count. It decrements TTL, and sends Time Exceeded at 0 and Destination Unreachable with no route or no ARP answer. A `silent` router sends no ICMP errors. Each forward writes new MACs and leaves the IPs alone.
- **NAT router**: the router, plus a table of `{ insideIp, insidePort, publicPort, expiresAt }`. Outbound rewrites the source and keeps the inside port when it's free, otherwise it takes the next from 40000. Inbound matches the table or drops the packet.
- **DHCP server**: a pool, a lease table and a lease time. It answers Discover with the lowest free address, confirms with Ack, and renews a lease on a client's Request. With an empty pool it stays silent. The host side runs Discover → Offer → Request → Ack, renews at half the lease, and falls back to a `169.254.x.x` address after one unanswered retry. The real client retries for longer; the lesson says so.

### Simulator (`sim.ts`)

`simulate(scenario)` takes devices, links, timed actions and faults, and runs them on `EventQueue`, ordered by `(time, sequence)`, with faults first at equal times. Links have a latency, 1 ms by default.

- Actions: `send` (a ping or a UDP datagram), `boot` (start DHCP on a host), `moveHost` (to another switch port).
- Faults: `linkDown`, `dropPacket` (the nth packet matching a test, such as reply 2), `stopDevice`.
- It returns events: `{ time, kind, device, note, packet?, tables }`, one for each delivery or decision, with a clone of every device's tables at that moment.
- A run ends when the queue is empty. Timers for aging, leases and NAT mappings are events, and the scenario sets `endAt` where they matter, so an idle timer can't run forever.
- A TTL of 255 at most, and `MAX_EVENTS = 2000`, stop a loop that a scenario causes.

Phase 2 adds TCP as a state machine in the host. Phase 1 builds no hook for it.

### Steps and scenarios (`steps.ts`, `scenarios/<id>.ts`)

- Each scenario module exports `fooCode` and `fooSteps(values)`, as in the Security track. Topologies are fixed per lesson and at most 6 nodes.
- `traceSteps(events, options)` turns events into steps: one step for each decision, with a flood merged into one step. Runs stay within `MAX_STEPS = 200` plus one summary step.
- Each step is a `panels` view of at most 3 panels, built in `steps.ts`:
  1. **Network**: a `services` view with the packet on its link.
  2. **Packet**: a `grid` with one row per layer (Ethernet, IP, ICMP or UDP) and the fields that changed in this step highlighted.
  3. **Table**: a `grid` of the deciding device's table, with the deciding row highlighted.
- Step `title`s state what happened with real values, `why` explains it, and `next` says what comes next. `codeLine` points into the pseudocode through `lineOf`.

### Invalid input

Bad addresses, out-of-range numbers and unknown choices give one refusal step that names the field and the valid values. Text fields are length-limited before parsing.

## 2. Views

`ServicesView['nodes'][number]['type']` gains `host`, `switch`, `router` and `dhcp`, with names in `TYPE_NAME` (`ServicesRenderer.tsx`). A NAT device is a `router` with the badge `NAT`. The node's label shows its address and the badge shows its state, such as the current TTL.

Traceroute's hop list is a `grid` laid out like real traceroute output. A subnet's bits are a text grid with one row per octet and `|` at the network/host boundary, because 8 cells across scroll on a 341 px stage.

`rolesInView` already handles `services`, `grid` and `panels`, so `roles.ts` doesn't change.

## 3. Lessons

| Lesson | Controls | Presets | What it shows |
|---|---|---|---|
| Layers & Encapsulation | message (text, up to 32 bytes), corrupt (no, yes) | clean, corrupted byte | Headers wrapped going down the stack and unwrapped coming up. The real 20-byte IPv4 header in a 4-column grid, as RFC 791 draws it, with its checksum worked out. A corrupted byte fails the receiver's check |
| Ethernet & Switches | sender, receiver, aging time (s) | first frame, reply, aged out, host moved | 4 hosts and one switch. An unknown destination floods, the reply goes straight there, an aged-out entry floods again, and a moved host is learned on its new port |
| ARP | target IP, cache (empty, already cached) | miss, hit, nobody home | Hosts on one switch. The packet waits while a broadcast request finds the MAC. A hit sends at once. No answer ends in a failed send |
| IP Addresses & Subnets | address/prefix (text), second address (text) | `/24`, `/20`, `/31`, different subnets | Network, broadcast and host range, worked out in bits, then whether the second address is local or goes via the gateway. No simulator run |
| Routing Tables | destination (text), link (up, down) | specific route, default route, no route, backup route, routing loop | Host, 3 routers, server. Longest-prefix match row by row. Each hop rewrites the MACs and lowers the TTL while the IPs stay put. A loop ends in Time Exceeded |
| Ping & Traceroute | mode (ping, traceroute), TTL, drop reply (none, 1, 2, 3), silent router (no, yes) | ping, traceroute, silent router, lost reply | Ping's round-trip times and loss count. Traceroute raises TTL hop by hop, one probe per hop, as `tracert` does with ICMP echo, and the lesson notes that Linux sends UDP by default and repeats each hop 3 times. A silent router shows `* * *` |
| DHCP | lease time (s), pool size | first lease, renewal, pool exhausted, server down | The 4-message exchange from `0.0.0.0`, renewal at half the lease, and a `169.254.x.x` address when no server answers |
| NAT | inside port of host B, mapping timeout (s) | one host, same port on two hosts, unsolicited inbound, mapping expired | Two inside hosts behind one public IP. The source is rewritten going out and restored coming back. Same inside port takes a new public port. Inbound with no mapping is dropped, as is a reply after the mapping expires |

Each lesson has the usual content: overview, concept, how it works, pros and cons, applications, common mistakes, and a 4-question quiz with at least one `predict-next` question built from a real step. Each states what the simulation simplifies.

The last paragraph of `concept` says "on a real machine" and names the tool:

| Lesson | Tool |
|---|---|
| Layers & Encapsulation | `tcpdump`, Wireshark |
| Ethernet & Switches | `bridge fdb show` |
| ARP | `ip neigh`, `arp -a` |
| IP Addresses & Subnets | `ip addr`, `ipcalc` |
| Routing Tables | `ip route` |
| Ping & Traceroute | `ping`, `traceroute`, `mtr` |
| DHCP | `dhclient`, `ipconfig` |
| NAT | `conntrack -L` |

IPv6 gets a paragraph in IP Addresses & Subnets. ARP spoofing gets a mention in ARP's common mistakes.

Prerequisites cover only real dependencies: ARP needs Ethernet & Switches, Routing Tables needs IP Addresses & Subnets, and Ping & Traceroute and NAT need Routing Tables.

## 4. Site changes

- `Category` gains `'networking'`. `CATEGORY_TITLE` and `CATEGORY_INTRO`, `CATEGORY_ICON` (`Network`, in `SearchPalette.tsx`) and `CODE_COPY` (`LessonPage.tsx`) get entries. Routes, progress bars and static pages follow from `CATEGORIES`.
- The site description names networking in `index.html` and `Home.tsx`, and in the README and `CLAUDE.md` intros.
- **Header**: the Security track left about 22 px spare at 1024 px, and a "Networking" link needs about 100. The main nav and the search button's width therefore move from `lg` to `xl`, so the "Sections" strip serves 1024–1279 px. The links must not overflow at 1280 px. If they do, the search button stays icon-only until `2xl`.

## 5. Testing

Vitest, the same pattern as the other tracks:

- `address`: parsing, rejected forms (`1.2.3`, `256.0.0.1`, `1.2.3.4/33`), `/0`, `/31` and `/32`, and addresses at or above `128.0.0.0`, which break signed bit work.
- `bytes`: the RFC 1071 worked example (`00 01 f2 03 f4 f5 f6 f7` sums to `ddf2`), and a known IPv4 header whose checksum is `b861`.
- `devices` and `sim`: the switch learns, floods and ages; longest prefix beats shorter, then lowest metric wins; a forward changes MACs and TTL and keeps the IPs; TTL expiry; NAT rewrite, port clash, inbound drop and expiry; the DHCP exchange, renewal and fallback.
- `src/networking/scenarios/*.test.ts`: each lesson's teaching moment, for example "a TTL of 3 gets Time Exceeded from the third router".
- `src/networking/contract.test.ts`, as in the other tracks: every Networking lesson runs with random, garbage and hostile input. Runs stay within `MAX_STEPS + 1` steps, code lines are valid, runs repeat exactly, a bad value gives exactly one refusal step, and each lesson's last `concept` paragraph says "on a real machine".
- Curriculum tests: `networking` has 23 topics in the order above with three groups, and the 8 Link & Internet lessons are live.
- `scripts/static-pages.test.ts`: the address count becomes `186 + 8 + 1`.
- `renderers.test.tsx` already draws every lesson's first, last and quiz steps. Layout has no DOM tests: the topologies, the hop list, the bit rows and the header are checked by hand in a browser, at 375 px, 1024 px and 1280 px, in both themes.
- `npm run check:bundle` stays under 600 kB (417.7 kB before this work). Simulator code loads with the lesson chunks.

## Touch points

`src/types/lesson.ts`, `src/types/visualization.ts`, `ServicesRenderer.tsx`, `Header.tsx`, `SearchPalette.tsx`, `LessonPage.tsx`, `Home.tsx`, `index.html`, `src/lessons/curriculum.ts`, `labels.ts`, `lessonList.ts`, `src/lessons/meta/networking.ts`, the glob lists in `registry.ts`, `all.testutil.ts` and `split.test.ts`, `src/lessons/lessons.test.ts`, `scripts/static-pages.test.ts`, `src/lessons/networking/*.ts`, `src/networking/**`, and README.md and CLAUDE.md (the track list, a "how to add a lesson" section, and a `src/networking/` architecture entry).

## Out of scope

- Phases 2 and 3, including TCP and the `ladder` view (their own specs).
- Random packet loss, which phase 2 can add if TCP needs it.
- IPv6 packets, VLANs, Wi-Fi, spanning tree and switching loops.
- Dynamic routing protocols in phase 1 (BGP is phase 3; OSPF is not planned).
- IP fragmentation (phase 2's MTU & MSS) and TCP or real HTTP traffic.
- Decoding bytes, and bytes for anything except the IPv4 header.
- Letting learners draw their own topology.
- An ARP spoofing simulation.
