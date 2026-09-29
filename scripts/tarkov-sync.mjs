import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const outputDir = join(root, "public/data/tarkov");
const endpoint = "https://api.tarkov.dev/graphql";
const locales = ["es", "en"];
const checkOnly = process.argv.includes("--check");

const query = `
  query Tasks($lang: LanguageCode!) {
    tasks(lang: $lang) {
      id
      name
      trader { name }
      map { name }
      taskRequirements {
        task { id name }
      }
    }
  }
`;

async function fetchTasks(locale) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { lang: locale } }),
  });

  if (!response.ok) {
    throw new Error(`tarkov.dev returned ${response.status} for ${locale}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(`tarkov.dev GraphQL errors for ${locale}: ${json.errors.map((error) => error.message).join("; ")}`);
  }

  return (json.data?.tasks ?? []).map((task) => ({
    id: String(task.id),
    name: String(task.name),
    trader: task.trader?.name ? String(task.trader.name) : null,
    map: task.map?.name ? String(task.map.name) : null,
    requirements: (task.taskRequirements ?? [])
      .map((requirement) => requirement.task?.name)
      .filter(Boolean)
      .map(String)
      .sort((a, b) => a.localeCompare(b)),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function readExisting(locale) {
  const filePath = join(outputDir, `quests.${locale}.json`);
  if (!existsSync(filePath)) return [];
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function comparable(entry) {
  return {
    id: entry.id,
    name: entry.name,
    trader: entry.trader ?? null,
    map: entry.map ?? null,
    requirements: [...(entry.requirements ?? [])].sort((a, b) => a.localeCompare(b)),
  };
}

export function diffCatalog(existing, next) {
  const existingById = new Map(existing.map((entry) => [entry.id, comparable(entry)]));
  const nextById = new Map(next.map((entry) => [entry.id, comparable(entry)]));
  const newQuests = next.filter((entry) => !existingById.has(entry.id));
  const removedQuests = existing.filter((entry) => !nextById.has(entry.id));
  const changedQuests = next.filter((entry) => {
    const current = existingById.get(entry.id);
    return current ? JSON.stringify(current) !== JSON.stringify(comparable(entry)) : false;
  });

  return { newQuests, removedQuests, changedQuests };
}

export function missingTranslations(primary, fallback) {
  const fallbackById = new Map(fallback.map((entry) => [entry.id, entry]));
  return primary.filter((entry) => {
    const fallbackEntry = fallbackById.get(entry.id);
    return !entry.name || Boolean(fallbackEntry && entry.name === fallbackEntry.name);
  });
}

export async function runTarkovSync() {
  const generated = Object.fromEntries(await Promise.all(locales.map(async (locale) => [locale, await fetchTasks(locale)])));
  const esIds = new Set(generated.es.map((entry) => entry.id));
  const enIds = new Set(generated.en.map((entry) => entry.id));
  const idMismatch = [
    ...generated.es.filter((entry) => !enIds.has(entry.id)).map((entry) => `Missing in en: ${entry.id}`),
    ...generated.en.filter((entry) => !esIds.has(entry.id)).map((entry) => `Missing in es: ${entry.id}`),
  ];

  const summary = {
    new: 0,
    changed: 0,
    removed: 0,
    missingEs: missingTranslations(generated.es, generated.en).length,
    missingEn: missingTranslations(generated.en, generated.es).length,
  };

  for (const locale of locales) {
    const existing = readExisting(locale);
    const diff = diffCatalog(existing, generated[locale]);
    summary.new += diff.newQuests.length;
    summary.changed += diff.changedQuests.length;
    summary.removed += diff.removedQuests.length;

    if (!checkOnly) {
      mkdirSync(dirname(join(outputDir, `quests.${locale}.json`)), { recursive: true });
      writeFileSync(join(outputDir, `quests.${locale}.json`), `${JSON.stringify(generated[locale], null, 2)}\n`);
    }
  }

  console.log(`New quests: ${summary.new}`);
  console.log(`Changed quests: ${summary.changed}`);
  console.log(`Removed quests: ${summary.removed}`);
  console.log(`Missing Spanish translations: ${summary.missingEs}`);
  console.log(`Missing English translations: ${summary.missingEn}`);

  if (idMismatch.length) {
    console.error(idMismatch.slice(0, 20).join("\n"));
    process.exit(1);
  }

  if (checkOnly && (summary.new > 0 || summary.changed > 0 || summary.removed > 0)) {
    console.error("Quest catalog is out of date. Run npm run tarkov:sync to update it.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runTarkovSync();
}
