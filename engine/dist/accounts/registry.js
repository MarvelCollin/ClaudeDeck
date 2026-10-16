"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_INSTALL = exports.VERSION = void 0;
exports.emptyRegistry = emptyRegistry;
exports.normalizeSession = normalizeSession;
exports.normalize = normalize;
exports.findSession = findSession;
exports.sessionByEmail = sessionByEmail;
exports.sessionByUuid = sessionByUuid;
exports.saveSession = saveSession;
exports.removeSession = removeSession;
exports.read = read;
exports.write = write;
const node_fs_1 = __importDefault(require("node:fs"));
const json_1 = require("../core/fs/json");
const paths_1 = require("./paths");
exports.VERSION = 1;
function lower(value) {
    return String(value).toLowerCase();
}
function fallbackName(email) {
    return email.split('@')[0] ?? email;
}
function trimmedOr(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function nullableString(value) {
    return typeof value === 'string' && value ? value : null;
}
function emptyRegistry() {
    return { version: exports.VERSION, sessions: [] };
}
exports.LEGACY_INSTALL = 'code';
function normalizeInstalls(value) {
    if (!Array.isArray(value))
        return [exports.LEGACY_INSTALL];
    const ids = value.filter((id) => typeof id === 'string' && Boolean(id));
    return ids.length ? [...new Set(ids)] : [exports.LEGACY_INSTALL];
}
function normalizeSession(entry) {
    const value = entry;
    if (!value || typeof value.alias !== 'string' || typeof value.email !== 'string')
        return null;
    return {
        alias: value.alias,
        email: value.email,
        name: trimmedOr(value.name, fallbackName(value.email)),
        accountUuid: nullableString(value.accountUuid),
        orgUuid: nullableString(value.orgUuid),
        installs: normalizeInstalls(value.installs),
        savedAt: value.savedAt ?? null,
    };
}
function normalize(data) {
    const source = data;
    if (!source || typeof source !== 'object')
        return emptyRegistry();
    const sessions = [];
    const seen = new Set();
    for (const entry of Array.isArray(source.sessions) ? source.sessions : []) {
        const session = normalizeSession(entry);
        if (!session || seen.has(lower(session.alias)))
            continue;
        seen.add(lower(session.alias));
        sessions.push(session);
    }
    return { version: exports.VERSION, sessions };
}
function findSession(registry, alias) {
    const wanted = lower(alias);
    return (registry.sessions ?? []).find(entry => lower(entry.alias) === wanted) ?? null;
}
function sessionByEmail(registry, email) {
    const wanted = lower(email);
    return (registry.sessions ?? []).find(entry => lower(entry.email) === wanted) ?? null;
}
function sessionByUuid(registry, accountUuid) {
    if (!accountUuid)
        return null;
    return (registry.sessions ?? []).find(entry => entry.accountUuid === accountUuid) ?? null;
}
function saveSession(registry, session, now = new Date()) {
    const value = normalizeSession(session);
    if (!value)
        throw new Error('A saved session needs an alias and an email.');
    value.savedAt = now.toISOString();
    const previous = findSession(registry, value.alias);
    if (previous)
        value.installs = [...new Set([...previous.installs, ...value.installs])];
    const rest = (registry.sessions ?? []).filter(entry => lower(entry.alias) !== lower(value.alias));
    return { ...registry, sessions: [...rest, value] };
}
function removeSession(registry, alias) {
    const wanted = lower(alias);
    return { ...registry, sessions: (registry.sessions ?? []).filter(entry => lower(entry.alias) !== wanted) };
}
function read(file = (0, paths_1.registryPath)()) {
    if (!node_fs_1.default.existsSync(file))
        return emptyRegistry();
    try {
        return normalize(JSON.parse(node_fs_1.default.readFileSync(file, 'utf8')));
    }
    catch (error) {
        throw new Error(`Profile registry at ${file} is not valid JSON: ${(0, json_1.errorMessage)(error)}`);
    }
}
function write(registry, file = (0, paths_1.registryPath)()) {
    const data = normalize(registry);
    (0, json_1.writeJsonFile)(file, data);
    return data;
}
