"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCOUNT_KEY = exports.CONFIG_PREFIXES = exports.CONFIG_KEYS = exports.WINDOW_MARKER = exports.SLOT_DESKTOP_DIR = exports.CONFIG_FILE = exports.CODE_KEY = exports.DESKTOP_ITEMS = void 0;
exports.copyItem = copyItem;
exports.snapshotDesktop = snapshotDesktop;
exports.restoreDesktop = restoreDesktop;
exports.readCredentials = readCredentials;
exports.readCodeBlock = readCodeBlock;
exports.snapshotCode = snapshotCode;
exports.restoreCode = restoreCode;
exports.snapshotAccount = snapshotAccount;
exports.restoreAccount = restoreAccount;
exports.isAccountConfigKey = isAccountConfigKey;
exports.accountConfigKeys = accountConfigKeys;
exports.hasAccountConfig = hasAccountConfig;
exports.snapshotConfig = snapshotConfig;
exports.restoreConfig = restoreConfig;
exports.clearDesktop = clearDesktop;
exports.clearConfig = clearConfig;
exports.readWindowMarker = readWindowMarker;
exports.writeWindowMarker = writeWindowMarker;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
exports.DESKTOP_ITEMS = [
    'Local State',
    'Preferences',
    'Network',
    'Local Storage',
    'Session Storage',
    'WebStorage',
    'IndexedDB',
];
exports.CODE_KEY = 'claudeAiOauth';
exports.CONFIG_FILE = 'config.json';
exports.SLOT_DESKTOP_DIR = 'desktop';
exports.WINDOW_MARKER = 'window.json';
exports.CONFIG_KEYS = ['lastKnownAccountUuid'];
exports.CONFIG_PREFIXES = ['oauth:'];
const BUSY_CODES = new Set(['EBUSY', 'EPERM', 'EPIPE', 'EACCES']);
function copyItem(src, dst) {
    if (!node_fs_1.default.existsSync(src))
        return false;
    node_fs_1.default.rmSync(dst, { recursive: true, force: true });
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(dst), { recursive: true });
    try {
        node_fs_1.default.cpSync(src, dst, { recursive: true });
    }
    catch (error) {
        if (BUSY_CODES.has((0, json_1.errorCode)(error) ?? '')) {
            throw new Error('Claude Desktop still has its session files open. Close Claude Desktop and try again.');
        }
        throw error;
    }
    return true;
}
function snapshotDesktop(profileDir, slotDir, items = exports.DESKTOP_ITEMS) {
    const saved = [];
    node_fs_1.default.mkdirSync(slotDir, { recursive: true });
    for (const item of items) {
        if (copyItem(node_path_1.default.join(profileDir, item), node_path_1.default.join(slotDir, item)))
            saved.push(item);
    }
    return saved;
}
function restoreDesktop(slotDir, profileDir, items = exports.DESKTOP_ITEMS) {
    const restored = [];
    node_fs_1.default.mkdirSync(profileDir, { recursive: true });
    for (const item of items) {
        const src = node_path_1.default.join(slotDir, item);
        if (!node_fs_1.default.existsSync(src))
            continue;
        if (copyItem(src, node_path_1.default.join(profileDir, item)))
            restored.push(item);
    }
    return restored;
}
function readCredentials(credPath) {
    if (!node_fs_1.default.existsSync(credPath))
        return {};
    return JSON.parse(node_fs_1.default.readFileSync(credPath, 'utf8'));
}
function readCodeBlock(credPath) {
    return readCredentials(credPath)[exports.CODE_KEY] ?? null;
}
function snapshotCode(credPath, slotFile) {
    const block = readCodeBlock(credPath);
    if (!block)
        return false;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(slotFile), { recursive: true });
    node_fs_1.default.writeFileSync(slotFile, `${JSON.stringify(block, null, 2)}\n`, 'utf8');
    return true;
}
function restoreCode(slotFile, credPath) {
    if (!node_fs_1.default.existsSync(slotFile))
        return false;
    const block = JSON.parse(node_fs_1.default.readFileSync(slotFile, 'utf8'));
    const data = readCredentials(credPath);
    if (node_fs_1.default.existsSync(credPath))
        node_fs_1.default.copyFileSync(credPath, `${credPath}.claudedeck.bak`);
    data[exports.CODE_KEY] = block;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(credPath), { recursive: true });
    node_fs_1.default.writeFileSync(credPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return true;
}
exports.ACCOUNT_KEY = 'oauthAccount';
function emailOf(account) {
    const value = account?.emailAddress;
    return typeof value === 'string' && value ? value.toLowerCase() : null;
}
function snapshotAccount(accountPath, slotFile, email = null) {
    const account = (0, json_1.readJsonFile)(accountPath)?.[exports.ACCOUNT_KEY];
    if (!account || typeof account !== 'object')
        return false;
    if (email && emailOf(account) !== email.toLowerCase())
        return false;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(slotFile), { recursive: true });
    node_fs_1.default.writeFileSync(slotFile, `${JSON.stringify(account, null, 2)}\n`, 'utf8');
    return true;
}
function restoreAccount(slotFile, accountPath, fallback) {
    if (!node_fs_1.default.existsSync(accountPath))
        return false;
    const account = (0, json_1.readJsonFile)(slotFile) ?? fallback;
    if (!account)
        return false;
    const data = (0, json_1.readJsonFile)(accountPath);
    if (!data)
        return false;
    node_fs_1.default.copyFileSync(accountPath, `${accountPath}.claudedeck.bak`);
    data[exports.ACCOUNT_KEY] = account;
    node_fs_1.default.writeFileSync(accountPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return true;
}
function isAccountConfigKey(key) {
    return exports.CONFIG_KEYS.includes(key) || exports.CONFIG_PREFIXES.some(prefix => key.startsWith(prefix));
}
function accountConfigKeys(config) {
    return Object.keys(config ?? {}).filter(isAccountConfigKey);
}
function hasAccountConfig(configPath) {
    return accountConfigKeys((0, json_1.readJsonFile)(configPath)).length > 0;
}
function snapshotConfig(configPath, slotFile) {
    const config = (0, json_1.readJsonFile)(configPath);
    if (!config)
        return false;
    const picked = {};
    for (const key of accountConfigKeys(config))
        picked[key] = config[key];
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(slotFile), { recursive: true });
    node_fs_1.default.writeFileSync(slotFile, `${JSON.stringify(picked, null, 2)}\n`, 'utf8');
    return true;
}
function restoreConfig(slotFile, configPath) {
    const picked = (0, json_1.readJsonFile)(slotFile);
    if (!picked)
        return false;
    const config = (0, json_1.readJsonFile)(configPath) ?? {};
    for (const key of accountConfigKeys(config))
        delete config[key];
    Object.assign(config, picked);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(configPath), { recursive: true });
    node_fs_1.default.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return true;
}
function clearDesktop(profileDir, items = exports.DESKTOP_ITEMS) {
    const cleared = [];
    for (const item of items) {
        const target = node_path_1.default.join(profileDir, item);
        if (!node_fs_1.default.existsSync(target))
            continue;
        node_fs_1.default.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        cleared.push(item);
    }
    return cleared;
}
function clearConfig(configPath) {
    const config = (0, json_1.readJsonFile)(configPath);
    if (!config)
        return false;
    const keys = accountConfigKeys(config);
    if (!keys.length)
        return false;
    for (const key of keys)
        delete config[key];
    node_fs_1.default.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return true;
}
function readWindowMarker(slotDir) {
    const marker = (0, json_1.readJsonFile)(node_path_1.default.join(slotDir, exports.WINDOW_MARKER));
    if (!marker || typeof marker.profileDir !== 'string' || !marker.profileDir)
        return null;
    return { profileDir: marker.profileDir, movedAt: typeof marker.movedAt === 'string' ? marker.movedAt : '' };
}
function writeWindowMarker(slotDir, marker) {
    (0, json_1.writeJsonFile)(node_path_1.default.join(slotDir, exports.WINDOW_MARKER), marker);
}
