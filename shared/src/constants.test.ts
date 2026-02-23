import { describe, it, expect } from 'vitest';
import { calculateAdvancementScore, INITIAL_TEAM_BEST, getRankZone, getRankColor, RANK_ZONES, getHintTargetRange } from './constants.js';

describe('calculateAdvancementScore', () => {
  it('returns 0 when guess does not advance (rank >= teamBest)', () => {
    expect(calculateAdvancementScore(50000, 50000)).toBe(0);
    expect(calculateAdvancementScore(50000, 50001)).toBe(0);
  });

  it('scores ~230 for a 10x improvement', () => {
    const score = calculateAdvancementScore(50000, 5000);
    expect(score).toBe(Math.round(100 * Math.log(50000 / 5000)));
    expect(score).toBe(230);
  });

  it('equal proportional improvements yield equal scores', () => {
    const score1 = calculateAdvancementScore(50000, 5000); // 10x
    const score2 = calculateAdvancementScore(5000, 500);   // 10x
    const score3 = calculateAdvancementScore(500, 50);     // 10x
    expect(score1).toBe(score2);
    expect(score2).toBe(score3);
  });

  it('scores ~1082 for guessing rank 1 from initial', () => {
    const score = calculateAdvancementScore(INITIAL_TEAM_BEST, 1);
    expect(score).toBe(Math.round(100 * Math.log(50000)));
    expect(score).toBe(1082);
  });

  it('scores 1 for a tiny advance (100 → 99)', () => {
    const score = calculateAdvancementScore(100, 99);
    expect(score).toBe(Math.round(100 * Math.log(100 / 99)));
    expect(score).toBe(1);
  });
});

describe('getRankZone', () => {
  it('returns "win" for rank 1', () => {
    expect(getRankZone(1)).toBe('win');
  });

  it('returns "green" for rank 2', () => {
    expect(getRankZone(2)).toBe('green');
  });

  it('returns "green" for rank 300', () => {
    expect(getRankZone(300)).toBe('green');
  });

  it('returns "orange" for rank 301', () => {
    expect(getRankZone(301)).toBe('orange');
  });

  it('returns "orange" for rank 1500', () => {
    expect(getRankZone(1500)).toBe('orange');
  });

  it('returns "red" for rank 1501', () => {
    expect(getRankZone(1501)).toBe('red');
  });

  it('returns "red" for rank 50000', () => {
    expect(getRankZone(50000)).toBe('red');
  });
});

describe('getHintTargetRange', () => {
  it('returns ORANGE range when teamBest is in RED zone (>1500)', () => {
    expect(getHintTargetRange(2000)).toEqual([301, 1500]);
    expect(getHintTargetRange(50000)).toEqual([301, 1500]);
  });

  it('returns GREEN range when teamBest is in ORANGE zone (>300)', () => {
    expect(getHintTargetRange(1500)).toEqual([51, 300]);
    expect(getHintTargetRange(301)).toEqual([51, 300]);
  });

  it('returns GREEN_WARM range when teamBest is in GREEN zone (>50)', () => {
    expect(getHintTargetRange(300)).toEqual([11, 50]);
    expect(getHintTargetRange(51)).toEqual([11, 50]);
  });

  it('returns GREEN_HOT range when teamBest is in GREEN_WARM zone (>10)', () => {
    expect(getHintTargetRange(50)).toEqual([2, 10]);
    expect(getHintTargetRange(11)).toEqual([2, 10]);
  });

  it('returns null when teamBest is already very close (<=10)', () => {
    expect(getHintTargetRange(10)).toBeNull();
    expect(getHintTargetRange(5)).toBeNull();
    expect(getHintTargetRange(1)).toBeNull();
  });
});

describe('getRankColor', () => {
  it('returns WIN color for rank 1', () => {
    expect(getRankColor(1)).toBe(RANK_ZONES.WIN.color);
  });

  it('returns GREEN color for rank 2', () => {
    expect(getRankColor(2)).toBe(RANK_ZONES.GREEN.color);
  });

  it('returns GREEN color for rank 300', () => {
    expect(getRankColor(300)).toBe(RANK_ZONES.GREEN.color);
  });

  it('returns ORANGE color for rank 301', () => {
    expect(getRankColor(301)).toBe(RANK_ZONES.ORANGE.color);
  });

  it('returns ORANGE color for rank 1500', () => {
    expect(getRankColor(1500)).toBe(RANK_ZONES.ORANGE.color);
  });

  it('returns RED color for rank 1501', () => {
    expect(getRankColor(1501)).toBe(RANK_ZONES.RED.color);
  });

  it('returns RED color for rank 50000', () => {
    expect(getRankColor(50000)).toBe(RANK_ZONES.RED.color);
  });
});
