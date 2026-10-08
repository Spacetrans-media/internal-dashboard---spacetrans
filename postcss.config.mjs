/**
 * Tailwind via the standard PostCSS plugin rather than `@tailwindcss/turbopack`.
 *
 * The Turbopack loader rule spawns an external node process per CSS asset, which
 * fails on constrained shared hosting ("node process exited before we could
 * connect to it") and panics the whole build. The PostCSS path is handled
 * in-process and works under both Turbopack and webpack.
 */
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
