const os = require('os');
const path = require('path');

const DEFAULT_ALIAS = 'default';
const ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/;

function roamingDir(platform = process.platform, env = process.env) {
  if (platform === 'win32') return env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function desktopProfileDir(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'Claude');
}

function profilesRoot(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'ClaudeDeck', 'profiles');
}

function registryPath(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'ClaudeDeck', 'profiles.json');
}

function sessionsRoot(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'ClaudeDeck', 'sessions');
}

function sharedRoot(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'ClaudeDeck', 'shared');
}

function sessionSlot(alias, platform = process.platform, env = process.env) {
  assertValidAlias(alias);
  return path.join(sessionsRoot(platform, env), alias);
}

function homeDir(env = process.env) {
  return env.USERPROFILE || env.HOME || os.homedir();
}

function codeCredentialsPath(env = process.env) {
  return path.join(homeDir(env), '.claude', '.credentials.json');
}

function codeAccountPath(env = process.env) {
  return path.join(homeDir(env), '.claude.json');
}

function desktopConfigPath(profileDir) {
  return path.join(profileDir, 'config.json');
}

function isDefaultAlias(alias) {
  return String(alias).toLowerCase() === DEFAULT_ALIAS;
}

function isValidAlias(alias) {
  return typeof alias === 'string' && ALIAS_PATTERN.test(alias);
}

function assertValidAlias(alias) {
  if (!isValidAlias(alias)) {
    throw new Error(`Invalid alias "${alias}". Use 1-32 characters: letters, digits, dot, dash, underscore.`);
  }
  return alias;
}

function deriveAlias(label) {
  const alias = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, 32)
    .replace(/[^a-z0-9]+$/, '');
  if (!alias) throw new Error(`Cannot build a folder name from "${label}". Use letters or digits.`);
  return alias;
}

function profilePath(alias, platform = process.platform, env = process.env) {
  if (isDefaultAlias(alias)) return desktopProfileDir(platform, env);
  assertValidAlias(alias);
  return path.join(profilesRoot(platform, env), alias);
}

module.exports = {
  DEFAULT_ALIAS,
  assertValidAlias,
  codeAccountPath,
  codeCredentialsPath,
  deriveAlias,
  desktopConfigPath,
  desktopProfileDir,
  homeDir,
  isDefaultAlias,
  isValidAlias,
  profilePath,
  profilesRoot,
  registryPath,
  roamingDir,
  sessionSlot,
  sessionsRoot,
  sharedRoot,
};
