import { GUEST_IDENTITY, IDENTITIES } from "../../src/data/identities.ts";
import { seedStateWithStatement } from "../../src/domain/seed.ts";
import { company as seedCompany } from "../../src/data/company.ts";
import { customers as seedCustomers } from "../../src/data/customers.ts";
import { exchangeRates as seedRates } from "../../src/data/exchangeRates.ts";
import { hashPassword } from "./auth.ts";
import { config } from "./config.ts";
import { sql, type Tx } from "./db.ts";
import { ALL_TABLES, insertStore } from "./repo.ts";

/** Loads the demo dataset into empty business tables. */
async function seedBusinessData(tx: Tx) {
  await insertStore(tx, seedStateWithStatement());
}

async function seedUsers(tx: Tx) {
  for (const identity of IDENTITIES) {
    const hash = await hashPassword(config.demoPassword);
    await tx`
      insert into users (key, role, name, password_hash)
      values (${identity.key}, ${identity.role}, ${tx.json({ ...identity.name })}, ${hash})
      on conflict (key) do nothing
    `;
  }
  // The guest account has no usable password ("!" is never a valid hash) — it's reachable only through
  // POST /api/auth/guest, and only while guest access is allowed.
  await tx`
    insert into users (key, role, name, password_hash)
    values (${GUEST_IDENTITY.key}, ${GUEST_IDENTITY.role}, ${tx.json({ ...GUEST_IDENTITY.name })}, ${"!"})
    on conflict (key) do nothing
  `;
}

/**
 * A database created before customer legal details and the company profile existed: fill them in from the
 * demo data where they're still blank (never overwriting anything a user has entered).
 */
async function backfillDetails(tx: Tx) {
  // A database from before currencies: start it with the demo rate history so orders can be valued.
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from exchange_rates`;
  if (n === 0)
    for (const r of seedRates) await tx`insert into exchange_rates (currency, effective_date, rate) values (${r.currency}, ${r.effectiveDate}, ${r.rate})`;
  const [co] = await tx`select 1 from company where id = 1`;
  if (!co) {
    await tx`
      insert into company (id, name, tax_id, branch, address, phone, email)
      values (1, ${tx.json({ ...seedCompany.name })}, ${seedCompany.taxId}, ${seedCompany.branch}, ${tx.json({ ...seedCompany.address })}, ${seedCompany.phone}, ${seedCompany.email})
    `;
  }
  for (const c of seedCustomers) {
    await tx`
      update customers set tax_id = ${c.taxId}, branch = ${c.branch}, address = ${tx.json({ ...c.address })}, credit_term_days = ${c.creditTermDays}
      where customer_id = ${c.customerId} and tax_id = ''
    `;
  }
}

/** First start: create users and demo data if the database is empty. Idempotent. */
export async function seedIfEmpty() {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from products`;
  await sql.begin(async (tx) => {
    await seedUsers(tx);
    if (count === 0) {
      await seedBusinessData(tx);
      console.log("seeded demo data");
    } else {
      await backfillDetails(tx);
    }
  });
}

/** Demo reset: wipe business data (users and uploaded files are kept) and reload the demo dataset. */
export async function resetDemoData() {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242)`;
    await tx.unsafe(`truncate ${ALL_TABLES.join(", ")} restart identity cascade`);
    await seedBusinessData(tx);
  });
}
