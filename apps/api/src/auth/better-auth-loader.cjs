'use strict';

/**
 * CJS bridge for ESM-only better-auth.
 *
 * Problem: ts-node + SWC compiles TypeScript `import()` expressions to
 * `require()` in CommonJS output. `require()` cannot load ESM-only packages
 * like better-auth, which ships as `dist/index.mjs`.
 *
 * Solution: Move the dynamic imports here. ts-node only compiles .ts/.tsx
 * files — .cjs files are executed by Node.js natively. Node.js 20+ CAN load
 * ESM from CJS via async import(). OTEL's require-in-the-middle patcher
 * only intercepts require(), not native import(), so there is no conflict.
 */

async function loadBetterAuth() {
  const [ba, da, pl] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/drizzle'),
    import('better-auth/plugins'),
  ]);
  return {
    betterAuth:     ba.betterAuth,
    drizzleAdapter: da.drizzleAdapter,
    twoFactor:      pl.twoFactor,
  };
}

module.exports = { loadBetterAuth };
