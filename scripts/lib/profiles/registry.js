const fs = require('fs');
const path = require('path');
const { assertValidAlias, isDefaultAlias, registryPath } = require('./paths');

const VERSION = 1;

function emptyRegistry() {
  return { version: VERSION, profiles: [] };
}

function normalize(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.profiles)) return emptyRegistry();
  const seen = new Set();
  const profiles = [];
  for (const entry of data.profiles) {
    if (!entry || typeof entry.alias !== 'string') continue;
    const key = entry.alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push({
      alias: entry.alias,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : entry.alias,
      createdAt: entry.createdAt || null,
      lastLaunchedAt: entry.lastLaunchedAt || null,
    });
  }
  return { version: VERSION, profiles };
}

function read(file = registryPath()) {
  if (!fs.existsSync(file)) return emptyRegistry();
  try {
    return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    throw new Error(`Profile registry at ${file} is not valid JSON: ${err.message}`);
  }
}

function write(registry, file = registryPath()) {
  const data = normalize(registry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

function find(registry, alias) {
  const wanted = String(alias).toLowerCase();
  return registry.profiles.find(entry => entry.alias.toLowerCase() === wanted) || null;
}

function add(registry, alias, label = alias, now = new Date()) {
  assertValidAlias(alias);
  if (isDefaultAlias(alias)) throw new Error('Alias "default" is reserved for the existing Claude Desktop profile.');
  if (find(registry, alias)) throw new Error(`Profile "${alias}" already exists.`);
  const entry = { alias, label: String(label).trim() || alias, createdAt: now.toISOString(), lastLaunchedAt: null };
  return { ...registry, profiles: [...registry.profiles, entry] };
}

function setLabel(registry, alias, label) {
  const text = String(label || '').trim();
  if (!text) throw new Error('Label cannot be empty.');
  if (!find(registry, alias)) throw new Error(`Profile "${alias}" not found.`);
  const wanted = String(alias).toLowerCase();
  return {
    ...registry,
    profiles: registry.profiles.map(entry => (entry.alias.toLowerCase() === wanted ? { ...entry, label: text } : entry)),
  };
}

function remove(registry, alias) {
  if (isDefaultAlias(alias)) throw new Error('Cannot remove the default Claude Desktop profile.');
  if (!find(registry, alias)) throw new Error(`Profile "${alias}" not found.`);
  const wanted = String(alias).toLowerCase();
  return { ...registry, profiles: registry.profiles.filter(entry => entry.alias.toLowerCase() !== wanted) };
}

function touch(registry, alias, now = new Date()) {
  const wanted = String(alias).toLowerCase();
  return {
    ...registry,
    profiles: registry.profiles.map(entry =>
      entry.alias.toLowerCase() === wanted ? { ...entry, lastLaunchedAt: now.toISOString() } : entry
    ),
  };
}

module.exports = {
  VERSION,
  add,
  emptyRegistry,
  find,
  normalize,
  read,
  remove,
  setLabel,
  touch,
  write,
};
