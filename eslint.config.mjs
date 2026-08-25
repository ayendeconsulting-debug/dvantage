import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

// =============================================================================
// ESLint flat config
//
// HISTORY (2026-08-24): this config never loaded. `@eslint/js` was imported on
// line 1 but was not declared in the root devDependencies, so every package's
// lint task died at config resolution with exit code 2. `pnpm lint` had been
// failing since the file was written, and because nothing was gated on CI, the
// failure had no consequences — the same "control that exists but was never
// connected" pattern behind the 2026-08-24 Redis outage.
//
// Adding @eslint/js made the config load and surfaced 281 errors, of which the
// overwhelming majority were config defects rather than code defects. Each
// disabled rule below records why, so nobody re-enables one without knowing
// what it costs.
// =============================================================================

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.js',
    ],
  },

  // ── TypeScript, all packages ───────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs['strict-type-checked'].rules,
      ...tseslint.configs['stylistic-type-checked'].rules,

      // ── Base rules TypeScript supersedes ───────────────────────────────────
      // Spreading eslint.configs.recommended pulls in base rules that duplicate
      // or contradict TypeScript's own analysis. typescript-eslint's documented
      // guidance is to switch these off. Skipping that step is what produced
      // most of the 281 errors.

      // TypeScript resolves every identifier against real module and lib types.
      // ESLint does not, so without a `globals` declaration it reported Buffer,
      // process, NodeJS and URL as undefined across the API and workers —
      // roughly 150 of the 281. typescript-eslint explicitly recommends never
      // enabling no-undef on a TS project: it cannot see .d.ts files, so it is
      // both noisy and less accurate than the compiler.
      'no-undef': 'off',

      // `export const ErrorCode = {...} as const` alongside
      // `export type ErrorCode = ...` is idiomatic TypeScript — values and
      // types occupy separate declaration spaces. The base rule has no concept
      // of that. The TS-aware version understands it.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',

      // Same reasoning for the remaining base/TS rule pairs.
      'no-unused-vars': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',

      // ── Framework accommodations ───────────────────────────────────────────

      // NestJS modules are empty decorated classes by design:
      //   @Module({ imports: [...] }) export class ResumeModule {}
      // no-extraneous-class fired on every one. allowWithDecorator keeps the
      // rule useful for genuinely pointless classes while accepting the
      // framework's pattern.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],

      // ── Deliberate relaxations ─────────────────────────────────────────────

      // `Scored ${count} resumes` is fine. The strict default only permits
      // strings, which would mean String() wrappers throughout the logging in
      // every service. Numbers and booleans stringify unambiguously; nullish
      // and object interpolation stay errors, which is where the real bugs are
      // ("[object Object]" in a user-facing message).
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // ── Project rules ──────────────────────────────────────────────────────

      // Return types are inferred well and annotating every function is noise.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Queue and async code must handle its promises. This one earns its keep:
      // an unhandled rejection terminates the Node process, which is a live
      // risk in extension-auth.guard.ts and the worker `failed` handlers.
      '@typescript-eslint/no-floating-promises': 'error',

      // No explicit any — use unknown and narrow.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── Config and script files ────────────────────────────────────────────────
  // Build config (vite.config.ts, drizzle.config.ts, next.config.ts) is not
  // covered by a package tsconfig's `include`, so type-aware linting cannot run
  // on it. Without this, `project: true` fails to resolve and reports a parser
  // error per file.
  {
    files: ['**/*.config.ts', '**/*.config.mts', '**/scripts/**/*.ts'],
    languageOptions: {
      parserOptions: { project: false },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // ── Chrome extension ───────────────────────────────────────────────────────
  // Content scripts and the service worker are DOM + chrome.* code, not Node.
  // Kept as its own block so the distinction is explicit rather than implied.
  {
    files: ['apps/extension/**/*.ts', 'apps/extension/**/*.tsx'],
    rules: {
      // Site adapters read DOM values that are genuinely `any` at the boundary
      // (element.value, dataset lookups). The runtime type guards in
      // shared/messages.ts are the real check.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // Prettier last — turns off every stylistic rule that would fight the
  // formatter. Must stay the final entry.
  prettierConfig,
];
