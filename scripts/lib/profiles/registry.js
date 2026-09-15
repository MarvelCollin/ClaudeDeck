const fs = require('fs');
const path = require('path');
const { assertValidAlias, isDefaultAlias, registryPath } = require('./paths');

const VERSION = 1;

function emptyRegistry() {
  return { version: VERSION, profiles: [], identities: {}, sessions: [] };
}

function normalizeSession(entry) {
  if (!entry || typeof entry.alias !== 'string' || typeof entry.email !== 'string') return null;
  return {
    alias: entry.alias,
    email: entry.email,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : entry.email.split('@')[0],
    savedAt: entry.savedAt || null,
  };
}

function normalizeIdentity(value) {
  if (!value || typeof value !== 'object' || typeof value.email !== 'string') return null;
  return {
    email: value.email,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : value.email.split('@')[0],
    seenAt: value.seenAt || null,
  };
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
  const identities = {};
  if (data.identities && typeof data.identities === 'object') {
    for (const [alias, value] of Object.entries(data.identities)) {
      const identity = normalizeIdentity(value);
      if (identity) identities[alias.toLowerCase()] = identity;
    }
  }
  const sessions = [];
  const seenSession = new Set();
  if (Array.isArray(data.sessions)) {
    for (const entry of data.sessions) {
      const session = normalizeSession(entry);
      if (!session || seenSession.has(session.alias.toLowerCase())) continue;
      seenSession.add(session.alias.toLowerCase());
      sessions.push(session);
    }
  }
  return { version: VERSION, profiles, identities, sessions };
}

function findSession(registry, alias) {
  const wanted = String(alias).toLowerCase();
  return (registry.sessions || []).find(entry => entry.alias.toLowerCase() === wanted) || null;
}

function sessionByEmail(registry, email) {
  const wanted = String(email).toLowerCase();
  return (registry.sessions || []).find(entry => entry.email.toLowerCase() === wanted) || null;
}

function saveSession(registry, session, now = new Date()) {
  const value = normalizeSession(session);
  if (!value) throw new Error('A saved session needs an alias and an email.');
  value.savedAt = now.toISOString();
  const rest = (registry.sessions || []).filter(entry => entry.alias.toLowerCase() !== value.alias.toLowerCase());
  return { ...registry, sessions: [...rest, value] };
}

function removeSession(registry, alias) {
  const wanted = String(alias).toLowerCase();
  return { ...registry, sessions: (registry.sessions || []).filter(entry => entry.alias.toLowerCase() !== wanted) };
}

function identityFor(registry, alias) {
  return (registry.identities && registry.identities[String(alias).toLowerCase()]) || null;
}

function rememberIdentity(registry, alias, identity, now = new Date()) {
  const value = normalizeIdentity(identity);
  if (!value) return registry;
  value.seenAt = now.toISOString();
  return {
    ...registry,
    identities: { ...(registry.identities || {}), [String(alias).toLowerCase()]: value },
  };
}

function forgetIdentity(registry, alias) {
  const identities = { ...(registry.identities || {}) };
  delete identities[String(alias).toLowerCase()];
  return { ...registry, identities };
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
  const identities = { ...(registry.identities || {}) };
  delete identities[wanted];
  return {
    ...registry,
    identities,
    profiles: registry.profiles.filter(entry => entry.alias.toLowerCase() !== wanted),
  };
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
  findSession,
  forgetIdentity,
  identityFor,
  normalize,
  normalizeIdentity,
  normalizeSession,
  read,
  rememberIdentity,
  remove,
  removeSession,
  saveSession,
  sessionByEmail,
  setLabel,
  touch,
  write,
};
