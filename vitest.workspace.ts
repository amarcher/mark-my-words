import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  { test: { name: 'shared', root: './shared', include: ['src/**/*.test.ts'] } },
  { test: { name: 'server', root: './server', include: ['src/**/*.test.ts'] } },
]);
