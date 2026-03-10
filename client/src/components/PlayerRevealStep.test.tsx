// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { GuessResult, Player } from '@mmw/shared';

vi.mock('@mmw/shared', () => ({
  getRankColor: () => '#22c55e',
}));

vi.mock('./OdometerRank', () => ({
  default: (props: { targetRank: number; size?: string }) =>
    createElement('div', { 'data-testid': 'odometer', 'data-size': props.size || 'lg' }, `#${props.targetRank}`),
}));

const mockGuess: GuessResult = {
  playerId: 'p1',
  playerName: 'Alice',
  word: 'hello',
  rank: 1234,
  points: 52,
  wasFirst: false,
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', color: '#ff0000', connected: true },
  { id: 'p2', name: 'Bob', color: '#0000ff', connected: true },
];

function renderToDiv(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { createRoot(container).render(element); });
  return container;
}

let PlayerRevealStep: typeof import('./PlayerRevealStep').default;

beforeEach(async () => {
  vi.resetModules();
  PlayerRevealStep = (await import('./PlayerRevealStep')).default;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PlayerRevealStep', () => {
  it('renders player name and word', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {} })
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('hello');
  });

  it('shows player color dot', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {} })
    );
    const dot = container.querySelector('span[style*="background-color: rgb(255, 0, 0)"]');
    expect(dot).not.toBeNull();
  });

  it('uses OdometerRank with size="sm"', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {} })
    );
    const odometer = container.querySelector('[data-testid="odometer"]') as HTMLElement;
    expect(odometer.dataset.size).toBe('sm');
  });

  it('points are hidden initially (opacity-0)', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {} })
    );
    const spans = container.querySelectorAll('span');
    const pointsSpan = Array.from(spans).find(s => s.textContent === '+52');
    expect(pointsSpan?.className).toContain('opacity-0');
  });

  it('compact mode uses smaller classes', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {}, compact: true })
    );
    const card = container.querySelector('div > div') as HTMLElement;
    expect(card.className).toContain('px-3');
    expect(card.className).toContain('py-2');
  });

  it('default mode uses larger classes', () => {
    const container = renderToDiv(
      createElement(PlayerRevealStep, { guess: mockGuess, players: mockPlayers, onComplete: () => {} })
    );
    const card = container.querySelector('div > div') as HTMLElement;
    expect(card.className).toContain('px-5');
    expect(card.className).toContain('py-3');
  });
});
