import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = process.cwd();
export const defaultLocales = ["es", "en"];
export const defaultNamespaces = [
  "common",
  "auth",
  "onboarding",
  "profile",
  "swipe",
  "matches",
  "chat",
  "raid-now",
  "quest-help",
  "settings",
  "admin",
  "errors",
  "legal",
];

function flatten(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }

  return [{ key: prefix, value }];
}

function variables(value) {
  if (typeof value !== "string") return [];
  return Array.from(value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g)).map((match) => match[1]).sort();
}

function readNamespace(baseDir, locale, namespace, errors) {
  const filePath = join(baseDir, locale, `${namespace}.json`);
  if (!existsSync(filePath)) {
    errors.push(`Missing namespace file: ${locale}/${namespace}.json`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON in ${locale}/${namespace}.json: ${error.message}`);
    return null;
  }
}

export function validateI18n({
  baseDir = join(root, "src/i18n/messages"),
  locales = defaultLocales,
  namespaces = defaultNamespaces,
} = {}) {
  const errors = [];
  const dictionaries = new Map();

  for (const locale of locales) {
    for (const namespace of namespaces) {
      const data = readNamespace(baseDir, locale, namespace, errors);
      if (!data) continue;

      const flat = flatten(data);
      dictionaries.set(`${locale}:${namespace}`, new Map(flat.map((item) => [item.key, item.value])));

      for (const item of flat) {
        if (typeof item.value !== "string") {
          errors.push(`Non-string value in ${locale}/${namespace}.json at ${item.key}`);
        } else if (!item.value.trim()) {
          errors.push(`Empty value in ${locale}/${namespace}.json at ${item.key}`);
        }
      }
    }
  }

  for (const namespace of namespaces) {
    const es = dictionaries.get(`es:${namespace}`);
    const en = dictionaries.get(`en:${namespace}`);
    if (!es || !en) continue;

    for (const key of es.keys()) {
      if (!en.has(key)) errors.push(`Missing English key: ${namespace}.${key}`);
    }

    for (const key of en.keys()) {
      if (!es.has(key)) errors.push(`Missing Spanish key: ${namespace}.${key}`);
    }

    for (const key of es.keys()) {
      if (!en.has(key)) continue;
      const esVariables = variables(es.get(key)).join(",");
      const enVariables = variables(en.get(key)).join(",");
      if (esVariables !== enVariables) {
        errors.push(`Variable mismatch at ${namespace}.${key}: es=[${esVariables}] en=[${enVariables}]`);
      }
    }
  }

  return errors;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = validateI18n();

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log("i18n checks passed.");
}
