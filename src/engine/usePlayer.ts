import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Step } from '../types/visualization';
import { initialPlayer, playerReducer, type PlayerState } from './player';

export interface Player extends PlayerState {
  step: Step | undefined;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  restart(): void;
  seek(index: number): void;
  setSpeed(speed: number): void;
  /** Changes whenever a new Step[] is loaded; use it to key per-run rendering. */
  runId: number;
}

export function usePlayer(steps: Step[], options: { autoPlay?: boolean; loop?: boolean } = {}): Player {
  const { autoPlay = false, loop = false } = options;
  const [state, dispatch] = useReducer(playerReducer, steps.length, initialPlayer);

  // New steps (new input or operation) always start from the beginning. Resetting
  // during render means no frame ever shows the new run at the old position.
  const [loaded, setLoaded] = useState(steps);
  const [runId, setRunId] = useState(0);
  if (loaded !== steps) {
    setLoaded(steps);
    setRunId(runId + 1);
    dispatch({ type: 'load', total: steps.length });
    if (autoPlay) dispatch({ type: 'play' });
  }

  // Later runs are started by the reset above; this covers the first mount only.
  const [autoPlayOnMount] = useState(autoPlay);
  useEffect(() => {
    if (autoPlayOnMount) dispatch({ type: 'play' });
  }, [autoPlayOnMount]);

  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000 / state.speed);
    return () => clearInterval(id);
  }, [state.playing, state.speed]);

  const atEnd = state.total > 0 && state.index === state.total - 1;
  useEffect(() => {
    if (!loop || !atEnd || state.playing) return;
    const id = setTimeout(() => dispatch({ type: 'play' }), 2000);
    return () => clearTimeout(id);
  }, [loop, atEnd, state.playing]);

  const actions = useMemo(
    () => ({
      play: () => dispatch({ type: 'play' }),
      pause: () => dispatch({ type: 'pause' }),
      next: () => dispatch({ type: 'next' }),
      prev: () => dispatch({ type: 'prev' }),
      restart: () => dispatch({ type: 'restart' }),
      seek: (index: number) => dispatch({ type: 'seek', index }),
      setSpeed: (speed: number) => dispatch({ type: 'speed', speed }),
    }),
    [],
  );

  return {
    ...state,
    ...actions,
    runId,
    step: steps[state.index],
    toggle: state.playing ? actions.pause : actions.play,
  };
}
