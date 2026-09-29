// Applies supabase/schema.sql to a throwaway database on a local PostgreSQL and runs every
// file in tests/sql against a fresh copy. Uses the standard PG* env vars (PGHOST, PGPORT,
// PGUSER, PGPASSWORD) and needs a superuser, because the stubs create the Supabase roles.
// The database SQL_TEST_DB is dropped and recreated for each file.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const database = process.env.SQL_TEST_DB ?? "escapemate_sql_test";
if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error("SQL_TEST_DB must be a simple identifier");

const env = { ...process.env, LC_ALL: "C" };
const psql = (args) =>
  execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { env, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });

function freshDatabase() {
  psql(["-d", "postgres", "-c", `drop database if exists ${database} with (force)`]);
  psql(["-d", "postgres", "-c", `create database ${database}`]);
  psql(["-d", database, "-f", "tests/sql/supabase-stubs.sql"]);
  psql(["-d", database, "-f", "supabase/schema.sql"]);
}

const files = readdirSync("tests/sql").filter((name) => name.endsWith(".sql") && name !== "supabase-stubs.sql").sort();

try {
  for (const file of files) {
    freshDatabase();
    psql(["-d", database, "-f", join("tests/sql", file)]);
    console.log(`ok ${file}`);
  }
} catch (error) {
  const stderr = error.stderr?.toString() ?? "";
  console.error(stderr.split("\n").filter((line) => !/wal_level|HINT|NOTICE:/.test(line)).join("\n") || error.message);
  process.exit(1);
} finally {
  try {
    psql(["-d", "postgres", "-c", `drop database if exists ${database} with (force)`]);
  } catch {
    // Ignore cleanup failures; the next run recreates the database.
  }
}
