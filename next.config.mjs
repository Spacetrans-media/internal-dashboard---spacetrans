/**
 * Plain JavaScript config, deliberately not `next.config.ts`.
 *
 * Next compiles a TypeScript config with SWC before reading it. On hosts whose
 * glibc is older than 2.29 the native SWC binary refuses to load, Next falls
 * back to WASM, and that fallback fails to resolve the temporary compiled
 * config — the build dies before it reaches any of our code:
 *
 *   Cannot find module '.../<hash>.next.config'
 *
 * A .mjs config is imported directly, so there is nothing to compile and the
 * whole failure mode disappears.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
