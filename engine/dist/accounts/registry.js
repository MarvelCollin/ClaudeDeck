"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_INSTALL = exports.DEFAULT_SETTINGS = exports.VERSION = void 0;
exports.normalizeSettings = normalizeSettings;
exports.emptyRegistry = emptyRegistry;
exports.settingsOf = settingsOf;
exports.setSetting = setSetting;
exports.normalizeSession = normalizeSession;
exports.normalizeIdentity = normalizeIdentity;
exports.normalize = normalize;
exports.findSession = findSession;
exports.sessionByEmail = sessionByEmail;
exports.sessionByUuid = sessionByUuid;
exports.saveSession = saveSession;
exports.removeSession = removeSession;
exports.identityFor = identityFor;
exports.rememberIdentity = rememberIdentity;
exports.forgetIdentity = forgetIdentity;
exports.read = read;
exports.write = write;
exports.find = find;
exports.add = add;
exports.setLabel = setLabel;
exports.remove = remove;
exports.touch = touch;
const node_fs_1 = __importDefault(require("node:fs"));
const json_1 = require("../core/fs/json");
const paths_1 = require("./paths");
exports.VERSION = 1;
exports.DEFAULT_SETTINGS = { shareSession: true };
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
function normalizeSettings(value) {
    const source = (value && typeof value === 'object' ? value : {});
    return {
        shareSession: typeof source.shareSession === 'boolean' ? source.shareSession : exports.DEFAULT_SETTINGS.shareSession,
    };
}
function emptyRegistry() {
    return { version: exports.VERSION, profiles: [], identities: {}, sessions: [], settings: normalizeSettings(null) };
}
function settingsOf(registry) {
    return normalizeSettings(registry?.settings);
}
function setSetting(registry, key, value) {
    if (!Object.prototype.hasOwnProperty.call(exports.DEFAULT_SETTINGS, key))
        throw new Error(`Unknown setting "${String(key)}".`);
    if (typeof value !== typeof exports.DEFAULT_SETTINGS[key]) {
        throw new Error(`Setting "${String(key)}" expects a ${typeof exports.DEFAULT_SETTINGS[key]}.`);
    }
    return { ...registry, settings: { ...settingsOf(registry), [key]: value } };
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
function normalizeIdentity(value) {
    const entry = value;
    if (!entry || typeof entry !== 'object' || typeof entry.email !== 'string')
        return null;
    return {
        email: entry.email,
        name: trimmedOr(entry.name, fallbackName(entry.email)),
        seenAt: entry.seenAt ?? null,
    };
}
function normalizeProfiles(entries) {
    const seen = new Set();
    const profiles = [];
    for (const raw of entries) {
        const entry = raw;
        if (!entry || typeof entry.alias !== 'string')
            continue;
        const key = lower(entry.alias);
        if (seen.has(key))
            continue;
        seen.add(key);
        profiles.push({
            alias: entry.alias,
            label: trimmedOr(entry.label, entry.alias),
            createdAt: entry.createdAt ?? null,
            lastLaunchedAt: entry.lastLaunchedAt ?? null,
        });
    }
    return profiles;
}
function normalize(data) {
    const source = data;
    if (!source || typeof source !== 'object' || !Array.isArray(source.profiles))
        return emptyRegistry();
    const identities = {};
    if (source.identities && typeof source.identities === 'object') {
        for (const [alias, value] of Object.entries(source.identities)) {
            const identity = normalizeIdentity(value);
            if (identity)
                identities[lower(alias)] = identity;
        }
    }
    const sessions = [];
    const seenSession = new Set();
    if (Array.isArray(source.sessions)) {
        for (const entry of source.sessions) {
            const session = normalizeSession(entry);
            if (!session || seenSession.has(lower(session.alias)))
                continue;
            seenSession.add(lower(session.alias));
            sessions.push(session);
        }
    }
    return {
        version: exports.VERSION,
        profiles: normalizeProfiles(source.profiles),
        identities,
        sessions,
        settings: normalizeSettings(source.settings),
    };
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
function identityFor(registry, alias) {
    return registry.identities?.[lower(alias)] ?? null;
}
function rememberIdentity(registry, alias, identity, now = new Date()) {
    const value = normalizeIdentity(identity);
    if (!value)
        return registry;
    value.seenAt = now.toISOString();
    return { ...registry, identities: { ...(registry.identities ?? {}), [lower(alias)]: value } };
}
function forgetIdentity(registry, alias) {
    const identities = { ...(registry.identities ?? {}) };
    delete identities[lower(alias)];
    return { ...registry, identities };
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
function find(registry, alias) {
    const wanted = lower(alias);
    return registry.profiles.find(entry => lower(entry.alias) === wanted) ?? null;
}
function add(registry, alias, label = alias, now = new Date()) {
    (0, paths_1.assertValidAlias)(alias);
    if ((0, paths_1.isDefaultAlias)(alias))
        throw new Error('Alias "default" is reserved for the existing Claude Desktop profile.');
    if (find(registry, alias))
        throw new Error(`Profile "${alias}" already exists.`);
    const entry = {
        alias,
        label: String(label).trim() || alias,
        createdAt: now.toISOString(),
        lastLaunchedAt: null,
    };
    return { ...registry, profiles: [...registry.profiles, entry] };
}
function setLabel(registry, alias, label) {
    const text = String(label || '').trim();
    if (!text)
        throw new Error('Label cannot be empty.');
    if (!find(registry, alias))
        throw new Error(`Profile "${alias}" not found.`);
    const wanted = lower(alias);
    return {
        ...registry,
        profiles: registry.profiles.map(entry => (lower(entry.alias) === wanted ? { ...entry, label: text } : entry)),
    };
}
function remove(registry, alias) {
    if ((0, paths_1.isDefaultAlias)(alias))
        throw new Error('Cannot remove the default Claude Desktop profile.');
    if (!find(registry, alias))
        throw new Error(`Profile "${alias}" not found.`);
    const wanted = lower(alias);
    const identities = { ...(registry.identities ?? {}) };
    delete identities[wanted];
    return { ...registry, identities, profiles: registry.profiles.filter(entry => lower(entry.alias) !== wanted) };
}
function touch(registry, alias, now = new Date()) {
    const wanted = lower(alias);
    return {
        ...registry,
        profiles: registry.profiles.map(entry => lower(entry.alias) === wanted ? { ...entry, lastLaunchedAt: now.toISOString() } : entry),
    };
}
