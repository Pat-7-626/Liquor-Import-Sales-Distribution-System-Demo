import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.ts";

/**
 * Dates stay ISO strings (yyyy-mm-dd) — the domain compares them as strings — and numerics come back as
 * numbers. Money is numeric(…,2) in the database, so no float drift is stored.
 */
export const sql = postgres(config.databaseUrl, {
  max: 10,
  onnotice: () => {},
  types: {
    date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  },
  transform: { undefined: null },
  // Seed timestamps are local (Thailand) wall-clock times; the session time zone makes them land correctly.
  connection: { TimeZone: process.env.TZ ?? "Asia/Bangkok" },
});

export type Sql = typeof sql;
type Types = typeof sql extends postgres.Sql<infer T> ? T : never;
export type Tx = postgres.TransactionSql<Types>;

/** Applies every sql/NNN_*.sql file not yet recorded, in order, each in its own transaction. */
export async function migrate(dir: string) {
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = await readFile(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (version) values (${file})`;
    });
    console.log(`migrated ${file}`);
  }
}
