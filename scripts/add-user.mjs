// npm run add-user — create a sign-in user (or, with --reset, change an existing one's role, name or password).
//
//   npm run add-user                                    asks for everything
//   npm run add-user -- --key nok --role salesOfficer --name-th "นก ใจดี (พนักงานขาย)" --name-en "Nok Jaidee (Sales Officer)"
//   npm run add-user -- --key nok --reset               change an existing user (asks for a new password)
//
// The password is always asked for (hidden), never taken from the command line, so it doesn't end up in
// shell history. It's hashed here the same way the API does (scrypt), then saved through the database
// container — the stack must be running (`npm run dev` or `docker compose up -d`).
import { spawnSync } from "node:child_process";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scrypt = promisify(scryptCb);

const ROLES = {
  seniorManager: "Senior Manager — product prices, credit terms, price lists, company profile",
  orderOfficer: "Order Officer — import orders, documents, products, suppliers",
  documentationOfficer: "Documentation Officer — documents, customs clearance, licenses",
  warehouseOfficer: "Warehouse Officer — receiving, stock adjustments, delivery status",
  taxOfficer: "Tax Officer — customs clearance, tax & duty rates",
  salesOfficer: "Sales Officer — sales orders, payments, new customers",
  distributionOfficer: "Distribution Officer — delivery status and scheduling",
  supervisor: "Supervisor — everything above, plus approvals",
};

const fail = (msg) => {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`);
  process.exit(1);
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reset") out.reset = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

// One reader for every prompt, so input that arrives in a single chunk (pasted or piped) is never lost.
let buffered = "";
let ended = false;
const waiters = [];
process.stdin.on("data", (b) => {
  buffered += b.toString("utf8");
  waiters.splice(0).forEach((w) => w());
});
process.stdin.on("end", () => {
  ended = true;
  waiters.splice(0).forEach((w) => w());
});

async function readLine(prompt, hidden = false) {
  process.stdout.write(prompt);
  const tty = process.stdin.isTTY;
  if (hidden && tty) process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  for (;;) {
    while (buffered.length) {
      const ch = buffered[0];
      buffered = buffered.slice(1);
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && buffered[0] === "\n") buffered = buffered.slice(1);
        if (hidden && tty) process.stdin.setRawMode(false);
        process.stdin.pause();
        if (hidden) process.stdout.write("\n");
        return value.trim();
      }
      if (ch === "\u0003") process.exit(130); // Ctrl+C in raw mode
      if (hidden && tty && (ch === "\u007f" || ch === "\b")) value = value.slice(0, -1);
      else value += ch;
    }
    if (ended) {
      if (value) return value.trim();
      fail("Input ended before all answers were given.");
    }
    await new Promise((r) => waiters.push(r));
  }
}
const ask = (q) => readLine(q);
const askHidden = (q) => readLine(q, true);

function psql(sql, vars) {
  const args = ["compose", "exec", "-T", "db", "psql", "-U", "lisd", "-d", "lisd", "-v", "ON_ERROR_STOP=1", "-qtA"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return spawnSync("docker", args, { cwd: root, input: sql, encoding: "utf8" });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const ping = psql("select 1;", {});
  if (ping.status !== 0) fail("Can't reach the database. Start the app first (`npm run dev` or `docker compose up -d`), then try again.");

  const key = opts.key ?? (await ask("Username (letters, numbers, . _ -): "));
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(key)) fail("Username must be 2–32 characters: letters, numbers, dot, underscore or dash.");
  if (key === "guest") fail('"guest" is reserved for the read-only guest sign-in.');

  const existing = psql("select role from users where key = :'key';", { key }).stdout.trim();
  if (existing && !opts.reset) fail(`User "${key}" already exists (${existing}). Add --reset to change its role, name or password.`);
  if (!existing && opts.reset) fail(`User "${key}" doesn't exist — leave out --reset to create it.`);

  let role = opts.role;
  if (!role && !existing) {
    console.log("\nRoles:");
    Object.entries(ROLES).forEach(([r, d], i) => console.log(`  ${i + 1}. ${r.padEnd(21)} ${d}`));
    const pick = await ask("Role (number or name): ");
    role = Object.keys(ROLES)[Number(pick) - 1] ?? pick;
  }
  role = role ?? existing;
  if (!Object.hasOwn(ROLES, role)) fail(`Unknown role "${role}". Choose one of: ${Object.keys(ROLES).join(", ")}.`);

  const nameTh = opts["name-th"] ?? (existing ? "" : await ask('Name in Thai, e.g. "นก ใจดี (พนักงานขาย)": '));
  const nameEn = opts["name-en"] ?? (existing ? "" : await ask('Name in English, e.g. "Nok Jaidee (Sales Officer)": '));
  if (!existing && (!nameTh || !nameEn)) fail("Both names are needed — they're shown in the header and on every audit entry.");

  const password = await askHidden(existing ? "New password (Enter to keep the current one): " : "Password (min 8 characters): ");
  if (password || !existing) {
    if (password.length < 8) fail("Password must be at least 8 characters.");
    const again = await askHidden("Repeat password: ");
    if (again !== password) fail("Passwords don't match.");
  }

  // Same format the API writes and checks: scrypt$<salt>$<hash>, 16-byte salt, 64-byte key.
  const salt = randomBytes(16);
  const hash = password ? `scrypt$${salt.toString("base64")}$${(await scrypt(password, salt, 64)).toString("base64")}` : "";

  const sql = existing
    ? `update users set role = :'role',
         name = case when :'th' = '' then name else jsonb_build_object('th', :'th'::text, 'en', :'en'::text) end,
         password_hash = case when :'hash' = '' then password_hash else :'hash' end,
         -- A new password signs the user out everywhere, as it does in the app.
         token_version = token_version + case when :'hash' = '' then 0 else 1 end,
         password_changed_at = case when :'hash' = '' then password_changed_at else now() end
       where key = :'key';`
    : `insert into users (key, role, name, password_hash)
       values (:'key', :'role', jsonb_build_object('th', :'th'::text, 'en', :'en'::text), :'hash');`;
  const res = psql(sql, { key, role, th: nameTh, en: nameEn, hash });
  if (res.status !== 0) fail(`Saving failed: ${res.stderr.trim()}`);

  console.log(`\x1b[32m✔\x1b[0m ${existing ? "Updated" : "Created"} "${key}" (${role}). ${password ? "They can sign in now with that password." : ""}`);
}

main().catch((e) => fail(e.message));
