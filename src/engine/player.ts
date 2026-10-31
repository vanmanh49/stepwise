export const SPEEDS = [0.5, 1, 1.5, 2] as const;

export interface PlayerState {
  index: number;
  playing: boolean;
  speed: number;
  total: number;
}

type PlayerAction =
  | { type: 'play' | 'pause' | 'next' | 'prev' | 'restart' | 'tick' }
  | { type: 'seek'; index: number }
  | { type: 'speed'; speed: number }
  | { type: 'load'; total: number };

export function initialPlayer(total: number): PlayerState {
  return { index: 0, playing: false, speed: 1, total };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  const last = Math.max(0, state.total - 1);
  const clamp = (i: number) => Math.min(last, Math.max(0, i));

  switch (action.type) {
    case 'play':
      if (state.total === 0) return state;
      return { ...state, playing: true, index: state.index >= last ? 0 : state.index };
    case 'pause':
      return { ...state, playing: false };
    case 'tick': {
      const index = clamp(state.index + 1);
      return { ...state, index, playing: state.playing && index < last };
    }
    case 'next':
      return { ...state, playing: false, index: clamp(state.index + 1) };
    case 'prev':
      return { ...state, playing: false, index: clamp(state.index - 1) };
    case 'seek':
      return { ...state, playing: false, index: clamp(action.index) };
    case 'restart':
      return { ...state, playing: false, index: 0 };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'load':
      return { ...state, playing: false, index: 0, total: action.total };
  }
}
