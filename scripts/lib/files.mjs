import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export async function readYaml(filePath) {
  return parse(await readFile(filePath, "utf8"));
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readRole(filePath) {
  const source = await readFile(filePath, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing YAML frontmatter: ${filePath}`);
  return { frontmatter: parse(match[1]), body: match[2] };
}

export async function listFiles(directory, suffix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute, suffix);
    return entry.isFile() && entry.name.endsWith(suffix) ? [absolute] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}
