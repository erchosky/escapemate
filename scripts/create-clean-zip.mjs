import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const output = resolve(process.argv[2] ?? "dist/escapemate-clean.zip");
const requestedRootName = process.argv[3] ?? basename(output, extname(output));
const archiveRootName = requestedRootName.replace(/[^a-zA-Z0-9._-]+/g, "_");

if (extname(output).toLowerCase() !== ".zip" || !archiveRootName) {
  console.error("Usage: node scripts/create-clean-zip.mjs [output.zip] [archive-root-name]");
  process.exit(1);
}

const listed = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: projectRoot, encoding: "buffer" },
);

if (listed.status !== 0) {
  process.stderr.write(listed.stderr ?? Buffer.from("Unable to list project files.\n"));
  process.exit(listed.status ?? 1);
}

const files = listed.stdout.toString("utf8").split("\0").filter(Boolean);
const temporaryRoot = mkdtempSync(join(tmpdir(), "escapemate-archive-"));
const stagingRoot = join(temporaryRoot, archiveRootName);

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

function isForbiddenPath(path) {
  const parts = path.split("/");
  const filename = parts.at(-1) ?? "";

  if (parts.some((part) => forbiddenDirectories.has(part))) return true;
  if (filename === ".DS_Store" || filename === "Thumbs.db") return true;
  if (/\.(?:log|tmp|swp|tsbuildinfo|zip|rar|7z)$/i.test(filename)) return true;
  if (/^\.env(?:\..+)?$/.test(filename) && filename !== ".env.example") return true;
  return false;
}

try {
  mkdirSync(stagingRoot, { recursive: true });

  let copied = 0;
  for (const file of files) {
    if (isAbsolute(file) || file.split("/").includes("..") || isForbiddenPath(file)) continue;

    const source = resolve(projectRoot, file);
    if (!existsSync(source)) continue;
    if (relative(projectRoot, source).startsWith("..")) continue;

    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to archive symbolic link: ${file}`);
    }
    if (!stat.isFile()) continue;

    const destination = join(stagingRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    chmodSync(destination, stat.mode);
    copied += 1;
  }

  mkdirSync(dirname(output), { recursive: true });
  rmSync(output, { force: true });

  const archive = spawnSync("zip", ["-q", "-X", "-r", output, archiveRootName], {
    cwd: temporaryRoot,
    stdio: "inherit",
  });

  if (archive.status !== 0) process.exit(archive.status ?? 1);
  console.log(`Created ${output} with ${copied} source files.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
