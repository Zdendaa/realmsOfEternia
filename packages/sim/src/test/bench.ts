/**
 * Timing helpers for benchmark tests. The sim package has no DOM or Node typings on
 * purpose (it must run anywhere), so the two globals are typed here, for tests only.
 */
const host = globalThis as unknown as {
  performance: { now(): number };
  console: { log(message: string): void };
};

export const now = () => host.performance.now();
export const report = (message: string) => host.console.log(`[bench] ${message}`);
