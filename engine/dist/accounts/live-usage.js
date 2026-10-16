"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RELOGIN_RETRY_MS = exports.BACKOFF_MS = exports.MIN_INTERVAL_MS = exports.EXPIRY_BUFFER_MS = exports.OAUTH_BETA = exports.CLIENT_ID = exports.TOKEN_URL = exports.USAGE_URL = void 0;
exports.parseUsage = parseUsage;
exports.emptyUsage = emptyUsage;
exports.needsRefresh = needsRefresh;
exports.readBlock = readBlock;
exports.readCache = readCache;
exports.cachedUsage = cachedUsage;
exports.refreshBlock = refreshBlock;
exports.requestUsage = requestUsage;
exports.targetsFor = targetsFor;
exports.defaultLiveDeps = defaultLiveDeps;
exports.createLiveUsage = createLiveUsage;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const paths_1 = require("./paths");
const session_store_1 = require("./session-store");
exports.USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
exports.TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
exports.CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
exports.OAUTH_BETA = 'oauth-2025-04-20';
exports.EXPIRY_BUFFER_MS = 5 * 60 * 1000;
exports.MIN_INTERVAL_MS = 60 * 1000;
exports.BACKOFF_MS = 5 * 60 * 1000;
exports.RELOGIN_RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;
const USER_AGENT = 'claudedeck/1.0';
function toWindow(value) {
    const window = value;
    if (!window || typeof window !== 'object' || typeof window.utilization !== 'number')
        return null;
    return {
        usedPercent: Math.min(100, Math.max(0, window.utilization)),
        resetsAt: typeof window.resets_at === 'string' && window.resets_at ? window.resets_at : null,
    };
}
function parseUsage(data) {
    const source = (data && typeof data === 'object' ? data : {});
    return { fiveHour: toWindow(source.five_hour), sevenDay: toWindow(source.seven_day) };
}
function emptyUsage(status, error = null) {
    return { status, fiveHour: null, sevenDay: null, fetchedAt: null, checkedAt: null, error, backoffUntil: null };
}
function needsRefresh(block, now) {
    if (!block.accessToken)
        return true;
    return typeof block.expiresAt === 'number' && block.expiresAt - exports.EXPIRY_BUFFER_MS <= now.getTime();
}
function readBlock(file, fromCredentials) {
    if (fromCredentials) {
        const block = (0, session_store_1.readCredentials)(file)[session_store_1.CODE_KEY];
        return block && typeof block === 'object' ? block : null;
    }
    return (0, json_1.readJsonFile)(file);
}
function readCache(file = (0, paths_1.liveUsagePath)()) {
    const raw = (0, json_1.readJsonFile)(file);
    return raw && typeof raw === 'object' ? raw : {};
}
function cachedUsage(alias, file = (0, paths_1.liveUsagePath)()) {
    return readCache(file)[alias.toLowerCase()] ?? null;
}
function signal() {
    return AbortSignal.timeout(TIMEOUT_MS);
}
async function refreshBlock(block, fetchImpl, now) {
    if (!block.refreshToken)
        return { block: null, dead: true, error: 'no refresh token' };
    let response;
    try {
        response = await fetchImpl(exports.TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: block.refreshToken, client_id: exports.CLIENT_ID }),
            signal: signal(),
        });
    }
    catch (error) {
        return { block: null, dead: false, error: (0, json_1.errorMessage)(error) };
    }
    const text = await response.text();
    if (!response.ok) {
        let code = '';
        try {
            code = String(JSON.parse(text).error ?? '');
        }
        catch {
            code = '';
        }
        const dead = [400, 401, 403].includes(response.status) && ['invalid_grant', 'invalid_request'].includes(code);
        return { block: null, dead, error: `refresh failed with ${response.status}${code ? ` ${code}` : ''}` };
    }
    const data = JSON.parse(text);
    const next = {
        ...block,
        accessToken: data.access_token,
        expiresAt: now.getTime() + data.expires_in * 1000,
    };
    if (data.refresh_token)
        next.refreshToken = data.refresh_token;
    if (data.scope)
        next.scopes = data.scope.split(' ');
    return { block: next, dead: false, error: null };
}
async function requestUsage(accessToken, fetchImpl) {
    const response = await fetchImpl(exports.USAGE_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, 'anthropic-beta': exports.OAUTH_BETA, 'User-Agent': USER_AGENT },
        signal: signal(),
    });
    if (!response.ok)
        return { data: null, status: response.status };
    return { data: await response.json(), status: response.status };
}
function writeSlot(slotFile, block) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(slotFile), { recursive: true });
    node_fs_1.default.writeFileSync(slotFile, `${JSON.stringify(block, null, 2)}\n`, 'utf8');
}
function targetsFor(aliases, codeEmail, credPath, slotFileOf) {
    const active = codeEmail ? codeEmail.toLowerCase() : null;
    return aliases.map(entry => ({
        alias: entry.alias,
        active: entry.email.toLowerCase() === active,
        credPath,
        slotFile: slotFileOf(entry.alias),
    }));
}
function defaultLiveDeps() {
    return { fetch: globalThis.fetch, now: () => new Date(), cacheFile: (0, paths_1.liveUsagePath)(), minIntervalMs: exports.MIN_INTERVAL_MS };
}
function createLiveUsage(overrides = {}) {
    const deps = { ...defaultLiveDeps(), ...overrides };
    async function fetchOne(target, previous) {
        const now = deps.now();
        const checkedAt = now.toISOString();
        const keep = (patch) => ({
            ...(previous ?? emptyUsage('error')),
            checkedAt,
            ...patch,
        });
        let block = readBlock(target.active ? target.credPath : target.slotFile, target.active);
        if (!block)
            return { ...emptyUsage('no-login', 'no saved Claude Code login'), checkedAt };
        if (needsRefresh(block, now)) {
            if (target.active)
                return keep({ error: 'Claude Code refreshes this login on its next message' });
            const refreshed = await refreshBlock(block, deps.fetch, now);
            if (refreshed.dead)
                return keep({ status: 'relogin', error: refreshed.error });
            if (!refreshed.block)
                return keep({ error: refreshed.error });
            block = refreshed.block;
            writeSlot(target.slotFile, block);
        }
        try {
            const { data, status } = await requestUsage(block.accessToken, deps.fetch);
            if (status === 429) {
                return keep({ error: 'usage endpoint busy', backoffUntil: new Date(now.getTime() + exports.BACKOFF_MS).toISOString() });
            }
            if (status === 401)
                return keep({ status: target.active ? 'error' : 'relogin', error: 'login rejected' });
            if (!data)
                return keep({ error: `usage request failed with ${status}` });
            return { status: 'ok', ...parseUsage(data), fetchedAt: checkedAt, checkedAt, error: null, backoffUntil: null };
        }
        catch (error) {
            return keep({ error: (0, json_1.errorMessage)(error) });
        }
    }
    function slotChangedSince(target, at) {
        if (!at)
            return true;
        try {
            return node_fs_1.default.statSync(target.active ? target.credPath : target.slotFile).mtimeMs > Date.parse(at);
        }
        catch {
            return false;
        }
    }
    function isFresh(target, entry, now) {
        if (!entry || !entry.checkedAt)
            return false;
        if (slotChangedSince(target, entry.checkedAt))
            return false;
        if (entry.backoffUntil && Date.parse(entry.backoffUntil) > now.getTime())
            return true;
        const wait = entry.status === 'relogin' ? exports.RELOGIN_RETRY_MS : deps.minIntervalMs;
        return now.getTime() - Date.parse(entry.checkedAt) < wait;
    }
    async function refreshAll(targets, force = false) {
        const cache = readCache(deps.cacheFile);
        const now = deps.now();
        const results = await Promise.all(targets.map(async (target) => {
            const key = target.alias.toLowerCase();
            const previous = cache[key] ?? null;
            if (!force && isFresh(target, previous, now))
                return [key, previous];
            return [key, await fetchOne(target, previous)];
        }));
        const next = { ...readCache(deps.cacheFile) };
        for (const [key, value] of results)
            next[key] = value;
        (0, json_1.writeJsonFile)(deps.cacheFile, next);
        return Object.fromEntries(results);
    }
    return { fetchOne, refreshAll, isFresh };
}
