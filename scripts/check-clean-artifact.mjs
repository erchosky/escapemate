import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const artifact = resolve(process.argv[2] ?? "dist/escapemate-clean.zip");

if (!existsSync(artifact)) {
  console.error(`Artifact not found: ${artifact}`);
  process.exit(1);
}

function runUnzip(args, encoding = "utf8") {
  const result = spawnSync("unzip", args, {
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `unzip ${args.join(" ")} failed.\n`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function escapeUnzipPattern(value) {
  return [...value].map((character) => {
    if ("[]*?".includes(character)) return `\\${character}`;
    return character;
  }).join("");
}

runUnzip(["-tqq", artifact]);
const entries = runUnzip(["-Z1", artifact]).split("\n").filter(Boolean);

if (!entries.length) {
  console.error("Artifact is empty.");
  process.exit(1);
}

const forbiddenDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
  "venv",
]);

function forbiddenReason(entry) {
  const parts = entry.replace(/\/$/, "").split("/");
  const filename = parts.at(-1) ?? "";

  if (entry.startsWith("/") || parts.includes("..")) return "unsafe path";
  if (parts.some((part) => forbiddenDirectories.has(part))) return "generated directory";
  if (filename === ".DS_Store" || filename === "Thumbs.db") return "system metadata";
  if (/\.(?:log|tmp|swp|tsbuildinfo|zip|rar|7z)$/i.test(filename)) return "generated or nested archive";
  if (/^\.env(?:\..+)?$/.test(filename) && filename !== ".env.example") return "environment secret file";
  return null;
}

const forbiddenEntries = entries
  .map((entry) => ({ entry, reason: forbiddenReason(entry) }))
  .filter(({ reason }) => reason);

if (forbiddenEntries.length) {
  for (const { entry, reason } of forbiddenEntries) console.error(`${reason}: ${entry}`);
  process.exit(1);
}

const rootName = entries[0].split("/")[0];
const required = [
  "package.json",
  "package-lock.json",
  "README.md",
  "docs/AUDITORIA.md",
  ".env.example",
  "next.config.ts",
  "supabase/schema.sql",
];

const missing = required.filter((path) => !entries.includes(`${rootName}/${path}`));
if (!entries.some((entry) => entry.startsWith(`${rootName}/src/`))) missing.push("src/");
if (!entries.some((entry) => entry.startsWith(`${rootName}/supabase/migrations/`))) missing.push("supabase/migrations/");
if (!entries.some((entry) => entry.startsWith(`${rootName}/tests/`))) missing.push("tests/");

if (missing.length) {
  console.error(`Required archive content is missing: ${missing.join(", ")}`);
  process.exit(1);
}

const textExtensions = /(?:\.(?:css|html|js|json|jsx|md|mjs|sql|toml|ts|tsx|txt|webmanifest|yaml|yml)|\/(?:\.env\.example|\.gitignore|\.gitattributes|\.nvmrc))$/i;
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Sentry auth token", /\bsntrys_[A-Za-z0-9_\-]{20,}\b/],
  ["Supabase key", /\bsb_(?:secret|publishable)_[A-Za-z0-9_\-]{20,}\b/],
  ["JWT credential", /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ["credential in URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i],
  [
    "assigned server secret",
    /(?:SUPABASE_SERVICE_ROLE_KEY|SENTRY_AUTH_TOKEN|DISCORD_CLIENT_SECRET|DATABASE_URL|POSTGRES_URL|OPENAI_API_KEY)[ \t]*=[ \t]*(?!your-|example|replace|<)\S[^\r\n]{7,}/i,
  ],
];

const secretFindings = [];
for (const entry of entries.filter((item) => !item.endsWith("/") && textExtensions.test(item))) {
  const content = runUnzip(["-p", artifact, escapeUnzipPattern(entry)], "utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) secretFindings.push(`${label}: ${entry}`);
  }
}

if (secretFindings.length) {
  console.error("Potential real credentials found (values intentionally hidden):");
  secretFindings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`Artifact check passed: ${artifact}`);
console.log(`Verified ${entries.length} ZIP entries under ${rootName}/; no forbidden paths or credential signatures found.`);
