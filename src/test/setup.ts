// Tests marked `// @vitest-environment node` (the pure rules and the Worker) have no DOM and skip the DOM setup.
if (typeof document !== 'undefined') await import('./domSetup.ts')
