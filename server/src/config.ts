function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const production = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL", production ? undefined : "postgres://lisd:lisd@localhost:5433/lisd"),
  /** Signs session cookies. Must be a long random value in production. */
  sessionSecret: required("SESSION_SECRET", production ? undefined : "dev-only-session-secret-change-me"),
  /** Demo conveniences: the header role switcher and "Reset demo data". Turn off for real use. */
  demoMode: (process.env.DEMO_MODE ?? "true") === "true",
  /** "Continue as guest": read-only access without a password. Defaults to on in demo mode only. */
  // `||`, not `??`: docker compose passes an unset variable through as "" — that means "not set" here.
  allowGuest: (process.env.ALLOW_GUEST || process.env.DEMO_MODE || "true") === "true",
  /** Password given to every seeded user on first start. */
  demoPassword: process.env.DEMO_PASSWORD ?? "demo1234",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
  secureCookies: (process.env.SECURE_COOKIES ?? (production ? "true" : "false")) === "true",
  migrationsDir: process.env.MIGRATIONS_DIR ?? new URL("../sql", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
};

if (production && config.sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
