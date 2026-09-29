// Seeds a throwaway database with a 50k-player community and runs a concurrent pgbench mix
// of the hot paths: nav badges (every page), swipe candidates, chat inserts and Raid Now.
// Needs a local PostgreSQL superuser via PG* env vars. LOAD_CLIENTS / LOAD_SECONDS tune it.
import { execFileSync } from "node:child_process";

const database = process.env.LOAD_TEST_DB ?? "escapemate_load_test";
const clients = process.env.LOAD_CLIENTS ?? "64";
const seconds = process.env.LOAD_SECONDS ?? "20";
const env = { ...process.env, LC_ALL: "C" };
const run = (command, args, options = {}) => execFileSync(command, args, { env, encoding: "utf8", ...options });
const psql = (args) => run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { stdio: ["ignore", "ignore", "pipe"] });

try {
  psql(["-d", "postgres", "-c", `drop database if exists ${database} with (force)`]);
  psql(["-d", "postgres", "-c", `create database ${database}`]);
  psql(["-d", database, "-f", "tests/sql/supabase-stubs.sql"]);
  psql(["-d", database, "-f", "supabase/schema.sql"]);
  console.log("seeding 50k profiles, 1M swipes, 100k messages…");
  psql(["-d", database, "-f", "tests/load/seed.sql"]);

  const output = run("pgbench", [
    "-n", "-c", clients, "-j", "8", "-T", seconds,
    "-f", "tests/load/badges.sql@50",
    "-f", "tests/load/swipe.sql@10",
    "-f", "tests/load/chat.sql@25",
    "-f", "tests/load/raid.sql@15",
    database,
  ]);
  console.log(output.split("\n").filter((line) => /tps|latency average|script|transactions/.test(line)).join("\n"));
} finally {
  try {
    psql(["-d", "postgres", "-c", `drop database if exists ${database} with (force)`]);
  } catch {
    // The next run recreates it.
  }
}
