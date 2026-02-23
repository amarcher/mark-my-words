import { describe, it, expect } from 'vitest';
import { getPointsForRank, getRankZone, getRankColor, RANK_ZONES } from './constants.js';

describe('getPointsForRank', () => {
  it('returns 1000 for rank 1 (exact match)', () => {
    expect(getPointsForRank(1)).toBe(1000);
  });

  it('returns 500 for rank 2 (top 10 tier)', () => {
    expect(getPointsForRank(2)).toBe(500);
  });

  it('returns 500 for rank 10 (top 10 boundary)', () => {
    expect(getPointsForRank(10)).toBe(500);
  });

  it('returns 300 for rank 11 (top 50 tier)', () => {
    expect(getPointsForRank(11)).toBe(300);
  });

  it('returns 300 for rank 50 (top 50 boundary)', () => {
    expect(getPointsForRank(50)).toBe(300);
  });

  it('returns 200 for rank 51 (top 150 tier)', () => {
    expect(getPointsForRank(51)).toBe(200);
  });

  it('returns 200 for rank 150 (top 150 boundary)', () => {
    expect(getPointsForRank(150)).toBe(200);
  });

  it('returns 100 for rank 151 (top 300 tier)', () => {
    expect(getPointsForRank(151)).toBe(100);
  });

  it('returns 100 for rank 300 (top 300 boundary)', () => {
    expect(getPointsForRank(300)).toBe(100);
  });

  it('returns 50 for rank 301 (top 1500 tier)', () => {
    expect(getPointsForRank(301)).toBe(50);
  });

  it('returns 50 for rank 1500 (top 1500 boundary)', () => {
    expect(getPointsForRank(1500)).toBe(50);
  });

  it('returns 10 for rank 1501 (beyond 1500)', () => {
    expect(getPointsForRank(1501)).toBe(10);
  });

  it('returns 10 for rank 50000 (very far)', () => {
    expect(getPointsForRank(50000)).toBe(10);
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
