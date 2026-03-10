// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Mock getRankColor
vi.mock('@mmw/shared', () => ({
  getRankColor: () => '#22c55e',
}));

function renderToDiv(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { createRoot(container).render(element); });
  return container;
}

let OdometerRank: typeof import('./OdometerRank').default;

beforeEach(async () => {
  vi.resetModules();
  OdometerRank = (await import('./OdometerRank')).default;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('OdometerRank', () => {
  it('renders with default size (lg) classes', () => {
    const container = renderToDiv(createElement(OdometerRank, { targetRank: 100 }));
    const el = container.querySelector('div > div') as HTMLElement;
    expect(el.className).toContain('px-6');
    expect(el.className).toContain('py-3');
    expect(el.className).not.toContain('px-3 py-1.5');
  });

  it('renders with size="sm" classes', () => {
    const container = renderToDiv(createElement(OdometerRank, { targetRank: 100, size: 'sm' }));
    const el = container.querySelector('div > div') as HTMLElement;
    expect(el.className).toContain('px-3');
    expect(el.className).toContain('py-1.5');
  });

  it('renders hash prefix', () => {
    const container = renderToDiv(createElement(OdometerRank, { targetRank: 100 }));
    expect(container.textContent).toContain('#');
  });
});
