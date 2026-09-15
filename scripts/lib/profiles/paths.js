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
  return path.join(roamingDir(platform, env), 'ClaudeCron', 'profiles');
}

function registryPath(platform = process.platform, env = process.env) {
  return path.join(roamingDir(platform, env), 'ClaudeCron', 'profiles.json');
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

function profilePath(alias, platform = process.platform, env = process.env) {
  if (isDefaultAlias(alias)) return desktopProfileDir(platform, env);
  assertValidAlias(alias);
  return path.join(profilesRoot(platform, env), alias);
}

module.exports = {
  DEFAULT_ALIAS,
  assertValidAlias,
  desktopProfileDir,
  isDefaultAlias,
  isValidAlias,
  profilePath,
  profilesRoot,
  registryPath,
  roamingDir,
};
