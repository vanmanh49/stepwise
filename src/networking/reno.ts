export const DUP_ACK_THRESHOLD = 3;
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
  state.ssthresh = halfFlight(mss, flight);
  state.cwnd = state.ssthresh + DUP_ACK_THRESHOLD * mss;
  state.recovering = true;
  return true;
}

export function renoTimeout(state: Reno, mss: number, flight: number) {
  state.ssthresh = halfFlight(mss, flight);
  state.cwnd = mss;
  state.dupAcks = 0;
  state.recovering = false;
}
