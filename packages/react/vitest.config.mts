import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    watch: false,
    server: {
      deps: {
        inline: ['hume'],
      },
    },
  },
  resolve: {
    conditions: ['import', 'module', 'browser', 'default'],
  },
});
