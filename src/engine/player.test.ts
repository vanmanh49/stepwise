import { describe, expect, it } from 'vitest';
import { initialPlayer, playerReducer, type PlayerState } from './player';

const at = (index: number, extra: Partial<PlayerState> = {}): PlayerState => ({
  ...initialPlayer(5),
  index,
  ...extra,
});

describe('playerReducer', () => {
  it('starts paused on the first step at 1x', () => {
    expect(initialPlayer(5)).toEqual({ index: 0, playing: false, speed: 1, total: 5 });
  });

  it('next clamps at the last step', () => {
    expect(playerReducer(at(4), { type: 'next' }).index).toBe(4);
    expect(playerReducer(at(2), { type: 'next' }).index).toBe(3);
  });

  it('prev clamps at the first step', () => {
    expect(playerReducer(at(0), { type: 'prev' }).index).toBe(0);
    expect(playerReducer(at(2), { type: 'prev' }).index).toBe(1);
  });

  it('tick advances by one while playing', () => {
    expect(playerReducer(at(1, { playing: true }), { type: 'tick' })).toMatchObject({ index: 2, playing: true });
  });

  it('tick that reaches the last step stops playback', () => {
    expect(playerReducer(at(3, { playing: true }), { type: 'tick' })).toMatchObject({ index: 4, playing: false });
    expect(playerReducer(at(4, { playing: true }), { type: 'tick' })).toMatchObject({ index: 4, playing: false });
  });

  it('play on the last step restarts from the beginning', () => {
    expect(playerReducer(at(4), { type: 'play' })).toMatchObject({ index: 0, playing: true });
  });

  it('manual navigation pauses playback', () => {
    const playing = at(2, { playing: true });
    expect(playerReducer(playing, { type: 'next' }).playing).toBe(false);
    expect(playerReducer(playing, { type: 'prev' }).playing).toBe(false);
    expect(playerReducer(playing, { type: 'seek', index: 1 }).playing).toBe(false);
  });

  it('seek clamps out-of-range values', () => {
    expect(playerReducer(at(2), { type: 'seek', index: 99 }).index).toBe(4);
    expect(playerReducer(at(2), { type: 'seek', index: -3 }).index).toBe(0);
  });

  it('restart returns to step 0, paused', () => {
    expect(playerReducer(at(3, { playing: true }), { type: 'restart' })).toMatchObject({ index: 0, playing: false });
  });

  it('load resets position for new steps and keeps the speed', () => {
    expect(playerReducer(at(4, { playing: true, speed: 2 }), { type: 'load', total: 2 })).toEqual({
      index: 0,
      playing: false,
      speed: 2,
      total: 2,
    });
  });

  it('cannot play when there are no steps', () => {
    expect(playerReducer(initialPlayer(0), { type: 'play' }).playing).toBe(false);
    expect(playerReducer(initialPlayer(0), { type: 'next' }).index).toBe(0);
  });

  it('changes speed without moving', () => {
    expect(playerReducer(at(2), { type: 'speed', speed: 1.5 })).toMatchObject({ index: 2, speed: 1.5 });
  });
});
