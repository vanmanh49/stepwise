export const DUP_ACK_THRESHOLD = 3;
export const INITIAL_RTO_MS = 1000;
export const MAX_RETRIES = 5;
const MIN_RTO_MS = 200;
const DEFAULT_SSTHRESH_MSS = 64;

/** The congestion state both transports share. Bytes, not segments. */
export interface Reno {
  cwnd: number;
  ssthresh: number;
  dupAcks: number;
  recovering: boolean;
}

const halfFlight = (mss: number, flight: number) => Math.max(Math.floor(flight / 2), 2 * mss);

export function startReno(state: Reno, mss: number, ssthreshMss = DEFAULT_SSTHRESH_MSS) {
  state.cwnd = mss;
  state.ssthresh = ssthreshMss * mss;
}

export function renoNewAck(state: Reno, mss: number) {
  state.dupAcks = 0;
  if (state.recovering) state.cwnd = state.ssthresh;
  else state.cwnd += state.cwnd < state.ssthresh ? mss : (mss * mss) / state.cwnd;
  state.recovering = false;
}

/** Returns true on exactly the third duplicate, which is when to resend. */
export function renoDupAck(state: Reno, mss: number, flight: number): boolean {
  state.dupAcks++;
  if (state.recovering) state.cwnd += mss;
  if (state.dupAcks !== DUP_ACK_THRESHOLD) return false;
  renoLoss(state, mss, flight);
  return true;
}

/** A loss seen while packets still flow: halve, and carry on. */
export function renoLoss(state: Reno, mss: number, flight: number) {
  state.ssthresh = halfFlight(mss, flight);
  state.cwnd = state.ssthresh + DUP_ACK_THRESHOLD * mss;
  state.recovering = true;
  // So the duplicates that follow only inflate the window, and can't cut it again.
  state.dupAcks = DUP_ACK_THRESHOLD;
}

export function renoTimeout(state: Reno, mss: number, flight: number) {
  state.ssthresh = halfFlight(mss, flight);
  state.cwnd = mss;
  state.dupAcks = 0;
  state.recovering = false;
}

/** The RFC 6298 timer, shared so both transports wait alike. */
export interface RttState {
  srtt?: number;
  rttvar: number;
  /** The latest round trip measured. */
  rtt: number;
  rto: number;
}

export function sampleRtt(state: RttState, rtt: number) {
  state.rtt = rtt;
  state.rttvar = state.srtt === undefined ? rtt / 2 : 0.75 * state.rttvar + 0.25 * Math.abs(state.srtt - rtt);
  state.srtt = state.srtt === undefined ? rtt : 0.875 * state.srtt + 0.125 * rtt;
  state.rto = Math.max(MIN_RTO_MS, Math.ceil(state.srtt + 4 * state.rttvar));
}
