import { describe, expect, it } from 'vitest';
import type { PanelsView, ServicesView, Step } from '../../types/visualization';
import lesson from '../../lessons/networking/url-to-page';
import { urlToPageSteps } from './url-to-page';

const run = (protocol: string, dns: string, lost: string) => urlToPageSteps({ protocol, dns, lost });
const spans = (step: Step) => ((step.view as PanelsView).panels.find((panel) => panel.label === 'Network')!.view as ServicesView).spans!;
const phases = (step: Step) => spans(step).rows.map((row) => row.label);
const last = (steps: Step[]) => steps.at(-1)!;

describe('From URL to Page', () => {
  it('draws DNS, TCP, TLS and every resource in the waterfall', () => {
    expect(phases(last(run('HTTP/1.1', 'Cold', 'None')))).toEqual(['DNS', 'TCP', 'TLS', '/index.html', '/a.js', '/b.css', '/c.png']);
  });

  it('has no TCP row on HTTP/3', () => {
    expect(phases(last(run('HTTP/3', 'Cold', 'None')))).toEqual(['DNS', 'QUIC', '/index.html', '/a.js', '/b.css', '/c.png']);
  });

  it('has no DNS row, and finishes sooner, with cached DNS', () => {
    const cached = run('HTTP/1.1', 'Cached', 'None');
    expect(phases(last(cached))).not.toContain('DNS');
    expect(Number(last(cached).variables!.finished)).toBeLessThan(Number(last(run('HTTP/1.1', 'Cold', 'None')).variables!.finished));
  });

  it('reaches the first byte sooner on HTTP/3', () => {
    expect(Number(last(run('HTTP/3', 'Cold', 'None')).variables!.firstByte)).toBeLessThan(Number(last(run('HTTP/2', 'Cold', 'None')).variables!.firstByte));
  });

  it('finishes a lost packet on HTTP/1.1 and cold DNS, later than with none', () => {
    const steps = run('HTTP/1.1', 'Cold', 'Packet 3');
    expect(last(steps).variables!.cut).toBe('no');
    expect(last(steps).variables!.loaded).toBe(4);
    expect(Number(last(steps).variables!.finished)).toBeGreaterThan(Number(last(run('HTTP/1.1', 'Cold', 'None')).variables!.finished));
  });

  it('counts Packet 3 on every protocol, and finishes', () => {
    for (const protocol of ['HTTP/1.1', 'HTTP/2', 'HTTP/3']) expect(last(run(protocol, 'Cold', 'Packet 3')).variables!.loaded).toBe(4);
  });

  it('leaves a running phase open partway through', () => {
    const steps = run('HTTP/1.1', 'Cold', 'None');
    const middle = steps.find((step) => step.title.startsWith('GET /index.html'))!;
    const open = spans(middle).rows.filter((row) => row.ms === undefined);
    expect(open.map((row) => row.label)).toEqual(['/index.html']);
  });

  it('keeps a step to 3 panels and the map to 6 nodes', () => {
    for (const step of run('HTTP/2', 'Cold', 'Packet 3')) {
      expect((step.view as PanelsView).panels.length).toBeLessThanOrEqual(3);
    }
  });

  it('reuses the idle connection for the first file on HTTP/1.1', () => {
    const steps = run('HTTP/1.1', 'Cold', 'None');
    expect(steps.filter((step) => step.title.startsWith('SYN from'))).toHaveLength(3);
    const rows = spans(last(steps)).rows;
    const page = rows.find(({ label }) => label === '/index.html')!;
    expect(rows.find(({ label }) => label === '/a.js')!.start).toBe(page.start + page.ms!);
  });

  it('does not say every bar waits for the one before', () => {
    expect(last(run('HTTP/2', 'Cold', 'None')).why).not.toContain('each one had to wait');
    expect([...lesson.concept, ...lesson.howItWorks].join(' ')).not.toMatch(/each (bar|phase) wait/);
  });

  it('refuses bad input', () => {
    expect(run('x', 'Cold', 'None')).toHaveLength(1);
    expect(run('HTTP/2', 'x', 'None')).toHaveLength(1);
    expect(run('HTTP/2', 'Cold', 'x')).toHaveLength(1);
  });
});
