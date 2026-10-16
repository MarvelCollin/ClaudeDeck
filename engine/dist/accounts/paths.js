"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ALIAS = void 0;
exports.roamingDir = roamingDir;
exports.localDir = localDir;
exports.packagedProfileDirs = packagedProfileDirs;
exports.desktopProfileDir = desktopProfileDir;
exports.profilesRoot = profilesRoot;
exports.registryPath = registryPath;
exports.sessionsRoot = sessionsRoot;
exports.sharedRoot = sharedRoot;
exports.deeplinkStatePath = deeplinkStatePath;
exports.liveUsagePath = liveUsagePath;
exports.autoStatePath = autoStatePath;
exports.sessionSlot = sessionSlot;
exports.homeDir = homeDir;
exports.codeCredentialsPath = codeCredentialsPath;
exports.codeAccountPath = codeAccountPath;
exports.codeInsidersCredentialsPath = codeInsidersCredentialsPath;
exports.codeInsidersAccountPath = codeInsidersAccountPath;
exports.desktopConfigPath = desktopConfigPath;
exports.isDefaultAlias = isDefaultAlias;
exports.isValidAlias = isValidAlias;
exports.assertValidAlias = assertValidAlias;
exports.deriveAlias = deriveAlias;
exports.profilePath = profilePath;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../core/paths");
exports.DEFAULT_ALIAS = 'default';
const ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/;
const PACKAGED_FAMILY_PREFIX = 'Claude_';
const PACKAGED_PROFILE_PARTS = ['LocalCache', 'Roaming', 'Claude'];
function roamingDir(platform = process.platform, env = process.env) {
    if (platform === 'win32')
        return env.APPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Roaming');
    if (platform === 'darwin')
        return node_path_1.default.join(node_os_1.default.homedir(), 'Library', 'Application Support');
    return env.XDG_CONFIG_HOME || node_path_1.default.join(node_os_1.default.homedir(), '.config');
}
function localDir(platform = process.platform, env = process.env) {
    if (platform === 'win32')
        return env.LOCALAPPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Local');
    return roamingDir(platform, env);
}
function packagedProfileDirs(platform = process.platform, env = process.env) {
    if (platform !== 'win32')
        return [];
    const packages = node_path_1.default.join(localDir(platform, env), 'Packages');
    let entries;
    try {
        entries = node_fs_1.default.readdirSync(packages, { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith(PACKAGED_FAMILY_PREFIX))
        .map(entry => node_path_1.default.join(packages, entry.name, ...PACKAGED_PROFILE_PARTS))
        .filter(dir => node_fs_1.default.existsSync(dir))
        .sort();
}
function desktopProfileDir(platform = process.platform, env = process.env) {
    const classic = node_path_1.default.join(roamingDir(platform, env), 'Claude');
    if (platform !== 'win32' || node_fs_1.default.existsSync(classic))
        return classic;
    return packagedProfileDirs(platform, env)[0] ?? classic;
}
function deckDir(platform, env, ...parts) {
    const home = (0, paths_1.deckHome)(env);
    if (home)
        return node_path_1.default.join(home, ...parts);
    return node_path_1.default.join(roamingDir(platform, env), 'ClaudeDeck', ...parts);
}
function profilesRoot(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'profiles');
}
function registryPath(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'profiles.json');
}
function sessionsRoot(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'sessions');
}
function sharedRoot(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'shared');
}
function deeplinkStatePath(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'deeplink.json');
}
function liveUsagePath(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'usage-live.json');
}
function autoStatePath(platform = process.platform, env = process.env) {
    return deckDir(platform, env, 'auto.json');
}
function sessionSlot(alias, platform = process.platform, env = process.env) {
    assertValidAlias(alias);
    return node_path_1.default.join(sessionsRoot(platform, env), alias);
}
function homeDir(env = process.env) {
    return env.USERPROFILE || env.HOME || node_os_1.default.homedir();
}
function codeCredentialsPath(env = process.env) {
    return node_path_1.default.join(homeDir(env), '.claude', '.credentials.json');
}
function codeAccountPath(env = process.env) {
    return node_path_1.default.join(homeDir(env), '.claude.json');
}
function codeInsidersCredentialsPath(env = process.env) {
    return node_path_1.default.join(homeDir(env), '.claude-insiders', '.credentials.json');
}
function codeInsidersAccountPath(env = process.env) {
    return node_path_1.default.join(homeDir(env), '.claude-insiders', '.claude.json');
}
function desktopConfigPath(profileDir) {
    return node_path_1.default.join(profileDir, 'config.json');
}
function isDefaultAlias(alias) {
    return String(alias).toLowerCase() === exports.DEFAULT_ALIAS;
}
function isValidAlias(alias) {
    return typeof alias === 'string' && ALIAS_PATTERN.test(alias);
}
function assertValidAlias(alias) {
    if (!isValidAlias(alias)) {
        throw new Error(`Invalid alias "${String(alias)}". Use 1-32 characters: letters, digits, dot, dash, underscore.`);
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
    if (!alias)
        throw new Error(`Cannot build a folder name from "${label}". Use letters or digits.`);
    return alias;
}
function profilePath(alias, platform = process.platform, env = process.env) {
    if (isDefaultAlias(alias))
        return desktopProfileDir(platform, env);
    assertValidAlias(alias);
    return node_path_1.default.join(profilesRoot(platform, env), alias);
}
