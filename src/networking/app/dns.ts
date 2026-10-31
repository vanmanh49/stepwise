import { formatIp, ipv4 } from '../address';
import type { Host } from '../devices';
import type { Dns, DnsRecord, Udp } from '../packet';
import { formatTime, type Ctx, type Note, type TableSnapshot } from '../sim';

export const DNS_PORT = 53;
export const DNS_RETRY_MS = 1000;
const QUERY_BYTES = 100;
const ANSWER_BYTES = 200;
const RETRIES = 2;
const CACHE_TABLE = 4;
const FIRST_STUB_PORT = 52000;

const message = (id: number, name: string, over: Partial<Dns> = {}): Dns => ({ proto: 'dns', id, name, response: false, rcode: 'NOERROR', answers: [], authority: [], ...over });
const inZone = (name: string, zone: string) => name === zone || name.endsWith(`.${zone}`);
const dnsIn = ({ data }: Udp) => (typeof data === 'object' && 'proto' in data && data.proto === 'dns' ? data : undefined);

/** Answers from its own records. An `NS` record means "that part of the tree is delegated": it comes back with its address. */
export function dnsServer(host: Host, records: DnsRecord[]) {
  host.bindUdp(DNS_PORT, 'DNS', (ctx, src, udp) => {
    const dns = dnsIn(udp);
    if (!dns || dns.response) return;
    const reply = (over: Partial<Dns>, note: Note) => host.udp(ctx, src, DNS_PORT, udp.srcPort, message(dns.id, dns.name, { response: true, ...over }), { size: ANSWER_BYTES, note });
    const answers = records.filter(({ name, type }) => type === 'A' && name === dns.name);
    const delegation = records.find(({ name, type }) => type === 'NS' && inZone(dns.name, name));
    const address = delegation && records.find(({ name, type }) => type === 'A' && name === delegation.value);
    if (answers.length > 0) {
      reply({ answers }, { action: 'dns-answer', title: `${host.label} answers: ${dns.name} is ${answers[0]!.value}`, why: `This server holds the name itself, so its answer is final. The record may be kept for ${answers[0]!.ttl} s.` });
    } else if (delegation && address) {
      reply({ authority: [delegation, address] }, { action: 'dns-referral', title: `${host.label} refers it to ${delegation.value}`, why: `It doesn't know ${dns.name}, but it knows who runs ${delegation.name}, and sends that server's name and address.` });
    } else {
      reply({ rcode: 'NXDOMAIN' }, { action: 'dns-nxdomain', title: `${host.label} says ${dns.name} doesn't exist`, why: 'NXDOMAIN is a real answer, not a failure of the network: the server for this zone says there is no such name.' });
    }
  });
}

interface Asker {
  src: number;
  port: number;
  id: number;
}

interface Walk {
  name: string;
  askers: Asker[];
  id: number;
  tries: number;
  server: number;
  serverName: string;
}

/** A recursive resolver with a TTL cache. `seed` records never expire, as if it had always known them. */
export function dnsResolver(host: Host, root: number, seed: DnsRecord[] = []) {
  const cache = new Map<string, { record: DnsRecord; expiresAt: number }>(seed.map((record) => [`${record.name} ${record.type}`, { record, expiresAt: Infinity }]));
  const walks = new Map<string, Walk>();
  let nextId = 1;

  const keep = (ctx: Ctx, record: DnsRecord) => cache.set(`${record.name} ${record.type}`, { record, expiresAt: ctx.now + record.ttl * 1000 });

  function held(ctx: Ctx, key: string) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt <= ctx.now) cache.delete(key);
    return cache.get(key)?.record;
  }

  const rowOf = (key: string) => ({ index: CACHE_TABLE, row: [...cache.keys()].indexOf(key) });

  /** The closest known server for a name: the longest zone in the cache, else the root. */
  function nearest(ctx: Ctx, name: string): { server: number; serverName: string } {
    const zones = [...cache.keys()]
      .flatMap((key) => {
        const record = held(ctx, key);
        const address = record?.type === 'NS' && inZone(name, record.name) ? held(ctx, `${record.value} A`) : undefined;
        return record && address ? [{ zone: record.name, server: ipv4(address.value), serverName: record.value }] : [];
      })
      .toSorted((a, b) => b.zone.length - a.zone.length);
    return zones[0] ?? { server: root, serverName: 'the root' };
  }

  function send(ctx: Ctx, walk: Walk, note: Note) {
    const { id, tries } = walk;
    host.udp(ctx, walk.server, DNS_PORT, DNS_PORT, message(id, walk.name), { size: QUERY_BYTES, note });
    ctx.after(DNS_RETRY_MS, () => {
      if (walks.get(walk.name) !== walk || walk.id !== id || walk.tries !== tries) return;
      if (walk.tries === RETRIES) {
        walks.delete(walk.name);
        ctx.note({ action: 'dns-failed', title: `${host.label} gives up on ${walk.name}`, why: `${RETRIES} retries got no answer, so the resolver stops trying.` });
        return;
      }
      walk.tries++;
      send(ctx, walk, { action: 'dns-retry', title: `No answer from ${walk.serverName}, so ${host.label} asks again`, why: `UDP tells nobody about a lost datagram. After ${formatTime(DNS_RETRY_MS)} of silence the resolver simply asks again.` });
    });
  }

  function ask(ctx: Ctx, walk: Walk, server: number, serverName: string) {
    Object.assign(walk, { server, serverName, id: nextId++, tries: 0 });
    send(ctx, walk, { action: 'dns-query', title: `${host.label} asks ${serverName} about ${walk.name}`, why: `It sends the whole name to ${formatIp(server)} on UDP port ${DNS_PORT}, and that server answers or says who to ask next.` });
  }

  function answer(ctx: Ctx, asker: Asker, name: string, over: Partial<Dns>, note: Note) {
    host.udp(ctx, asker.src, DNS_PORT, asker.port, message(asker.id, name, { response: true, ...over }), { size: ANSWER_BYTES, note });
  }

  function onQuery(ctx: Ctx, src: number, port: number, dns: Dns) {
    const asker = { src, port, id: dns.id };
    const key = `${dns.name} A`;
    const record = held(ctx, key);
    if (record) {
      answer(ctx, asker, dns.name, { answers: [record] }, { action: 'dns-cached', title: `${host.label} already knows ${dns.name}`, why: `The answer is still in its cache, so nothing goes past the resolver. It expires ${formatTime(cache.get(key)!.expiresAt)} into this run.`, table: rowOf(key) });
      return;
    }
    const going = walks.get(dns.name);
    if (going) {
      if (!going.askers.some((each) => each.src === src && each.port === port)) going.askers.push(asker);
      return;
    }
    const walk: Walk = { name: dns.name, askers: [asker], id: 0, tries: 0, server: 0, serverName: '' };
    walks.set(dns.name, walk);
    const { server, serverName } = nearest(ctx, dns.name);
    ask(ctx, walk, server, serverName);
  }

  function onReply(ctx: Ctx, dns: Dns) {
    const walk = walks.get(dns.name);
    if (walk?.id !== dns.id) return;
    const [delegation, address] = dns.authority;
    if (dns.answers.length === 0 && dns.rcode === 'NOERROR' && delegation && address) {
      keep(ctx, delegation);
      keep(ctx, address);
      ask(ctx, walk, ipv4(address.value), delegation.value);
      return;
    }
    walks.delete(walk.name);
    if (dns.rcode === 'NXDOMAIN') {
      // Real resolvers cache this too (negative caching); here a failed name is asked again each time.
      for (const asker of walk.askers) answer(ctx, asker, walk.name, { rcode: 'NXDOMAIN' }, { action: 'dns-nxdomain', title: `${host.label} passes on NXDOMAIN`, why: `${walk.name} doesn't exist, and the client hears that. Failed names aren't cached here.` });
      return;
    }
    for (const record of dns.answers) keep(ctx, record);
    for (const asker of walk.askers) answer(ctx, asker, walk.name, { answers: dns.answers }, { action: 'dns-answer', title: `${host.label} answers the client`, why: `The walk is over, and the answer stays in the cache for ${dns.answers[0]?.ttl} s.` });
  }

  host.bindUdp(DNS_PORT, 'Resolver', (ctx, src, udp) => {
    const dns = dnsIn(udp);
    if (dns?.response) onReply(ctx, dns);
    else if (dns) onQuery(ctx, src, udp.srcPort, dns);
  });
  host.addTable((): TableSnapshot => ({
    title: 'Resolver cache',
    columns: ['Name', 'Type', 'Value', 'Expires'],
    rows: [...cache.values()].map(({ record, expiresAt }) => [record.name, record.type, record.value, expiresAt === Infinity ? 'never' : formatTime(expiresAt)]),
  }));
}

const stubPorts = new WeakMap<Host, number>();

/** The stub on the client: one question to the resolver, repeated if nothing comes back. */
export function lookup(ctx: Ctx, host: Host, resolver: number, name: string, done: (address: string | undefined) => void) {
  const port = stubPorts.get(host) ?? FIRST_STUB_PORT;
  stubPorts.set(host, port + 1);
  let finished = false;

  const send = (tries: number, note: Note) => {
    host.udp(ctx, resolver, port, DNS_PORT, message(port, name), { size: QUERY_BYTES, note });
    ctx.after(DNS_RETRY_MS, () => {
      if (finished) return;
      if (tries === RETRIES) {
        finished = true;
        ctx.note({ action: 'dns-failed', title: `${host.label} gives up on ${name}`, why: `${RETRIES} retries got no answer, so the program is told the lookup failed.` });
        done(undefined);
        return;
      }
      send(tries + 1, { action: 'dns-retry', title: `No answer yet, so ${host.label} asks again`, why: `UDP tells nobody about a lost datagram. After ${formatTime(DNS_RETRY_MS)} of silence the client simply asks again.` });
    });
  };

  host.bindUdp(port, 'DNS stub', (_, __, udp) => {
    const dns = dnsIn(udp);
    if (!dns?.response || finished) return;
    finished = true;
    done(dns.answers[0]?.value);
  });
  send(0, { action: 'dns-query', title: `${host.label} asks the resolver for ${name}`, why: `A program needs an address, and the stub on this machine asks one question: what is ${name}? The resolver does the rest.` });
}
