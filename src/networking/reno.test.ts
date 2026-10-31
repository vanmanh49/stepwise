import { describe, expect, it } from 'vitest';
import { renoDupAck, renoLoss, renoNewAck, renoTimeout, sampleRtt, startReno, type Reno } from './reno';

const MSS = 1000;
const fresh = (ssthreshMss?: number): Reno => {
  const state: Reno = { cwnd: 0, ssthresh: 0, dupAcks: 0, recovering: false };
  startReno(state, MSS, ssthreshMss);
  return state;
};

describe('reno', () => {
  it('starts at 1 MSS with a threshold of 64 by default', () => {
    expect(fresh()).toMatchObject({ cwnd: 1000, ssthresh: 64000 });
    expect(fresh(4).ssthresh).toBe(4000);
  });

  it('adds 1 MSS per ACK in slow start', () => {
    const state = fresh();
    renoNewAck(state, MSS);
    expect(state.cwnd).toBe(2000);
  });

  it('adds MSS × MSS ÷ cwnd per ACK at the threshold', () => {
    const state = fresh(2);
    state.cwnd = 2000;
    renoNewAck(state, MSS);
    expect(state.cwnd).toBe(2500);
  });

  it('fast retransmits on exactly the third duplicate', () => {
    const state = fresh();
    expect(renoDupAck(state, MSS, 10000)).toBe(false);
    expect(renoDupAck(state, MSS, 10000)).toBe(false);
    expect(renoDupAck(state, MSS, 10000)).toBe(true);
    expect(state).toMatchObject({ ssthresh: 5000, cwnd: 8000, recovering: true });
    expect(renoDupAck(state, MSS, 10000)).toBe(false);
    expect(state.cwnd).toBe(9000);
  });

  it('falls back to ssthresh on the next new ACK', () => {
    const state = fresh();
    for (let i = 0; i < 3; i++) renoDupAck(state, MSS, 10000);
    renoNewAck(state, MSS);
    expect(state).toMatchObject({ cwnd: 5000, recovering: false, dupAcks: 0 });
  });

  it('drops to 1 MSS on a timeout', () => {
    const state = fresh();
    state.cwnd = 8000;
    renoTimeout(state, MSS, 8000);
    expect(state).toMatchObject({ cwnd: 1000, ssthresh: 4000, dupAcks: 0, recovering: false });
  });

  it('treats a detected loss like a third duplicate', () => {
    const state = fresh();
    renoLoss(state, MSS, 10000);
    expect(state).toMatchObject({ ssthresh: 5000, cwnd: 8000, recovering: true });
    for (let i = 0; i < 3; i++) expect(renoDupAck(state, MSS, 10000)).toBe(false);
    expect(state).toMatchObject({ ssthresh: 5000, cwnd: 11000 });
  });

  it('sets the timer from RTT samples, down to the 200 ms minimum', () => {
    const state = { rttvar: 0, rtt: 0, rto: 1000 } as Parameters<typeof sampleRtt>[0];
    sampleRtt(state, 100);
    expect(state.rto).toBe(300);
    sampleRtt(state, 100);
    expect(state.rto).toBe(250);
    for (let i = 0; i < 20; i++) sampleRtt(state, 10);
    expect(state.rto).toBe(200);
  });

  it('never lets ssthresh fall below 2 MSS', () => {
    const state = fresh();
    renoTimeout(state, MSS, 1000);
    expect(state.ssthresh).toBe(2000);
  });
});
