"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cswapDataDir = cswapDataDir;
exports.cswapAvailable = cswapAvailable;
exports.cswapSignature = cswapSignature;
exports.deckSignature = deckSignature;
exports.syncWithCswap = syncWithCswap;
exports.importIntoCswap = importIntoCswap;
exports.defaultSyncDeps = defaultSyncDeps;
exports.createCswapWatcher = createCswapWatcher;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const cswap_import_1 = require("./cswap-import");
const identity_1 = require("./identity");
const installs_1 = require("./installs");
const paths_1 = require("./paths");
const registry = __importStar(require("./registry"));
const session_store_1 = require("./session-store");
const SIGNATURE_FILES = ['claude-swap.log', 'sequence.json', node_path_1.default.join('cache', 'usage.json')];
function cswapDataDir(env = process.env) {
    return node_path_1.default.join((0, paths_1.homeDir)(env), '.claude-swap-backup');
}
function cswapAvailable(env = process.env) {
    return node_fs_1.default.existsSync(node_path_1.default.join(cswapDataDir(env), 'sequence.json'));
}
function mtimes(files) {
    return files
        .map(file => {
        try {
            return String(node_fs_1.default.statSync(file).mtimeMs);
        }
        catch {
            return '-';
        }
    })
        .join('|');
}
function cswapSignature(env = process.env) {
    return mtimes(SIGNATURE_FILES.map(name => node_path_1.default.join(cswapDataDir(env), name)));
}
function deckSignature(deps) {
    const slots = registry.read(deps.registryFile).sessions.map(entry => node_path_1.default.join(deps.slotOf(entry.alias), (0, installs_1.installFileName)(installs_1.CODE_INSTALL)));
    return mtimes([...slots, deps.credPath]);
}
function text(value) {
    return typeof value === 'string' ? value : '';
}
function blockOf(account) {
    const block = account.credentials?.claudeAiOauth;
    return block && typeof block === 'object' ? block : null;
}
function expiresAt(block) {
    return block && typeof block.expiresAt === 'number' ? block.expiresAt : 0;
}
function deckBlock(deps, alias, email) {
    const live = deps.codeEmail()?.toLowerCase() === email.toLowerCase();
    const block = live
        ? (0, session_store_1.readCredentials)(deps.credPath)[session_store_1.CODE_KEY]
        : (0, json_1.readJsonFile)(node_path_1.default.join(deps.slotOf(alias), (0, installs_1.installFileName)(installs_1.CODE_INSTALL)));
    return block && typeof block === 'object' && block.refreshToken ? block : null;
}
function tokenOwners(pairs) {
    const owners = new Map();
    for (const [email, block] of pairs) {
        if (!block?.refreshToken)
            continue;
        const set = owners.get(block.refreshToken) ?? new Set();
        set.add(email.toLowerCase());
        owners.set(block.refreshToken, set);
    }
    return owners;
}
function syncWithCswap(deps) {
    const envelope = deps.exportCswap();
    const theirs = (Array.isArray(envelope?.accounts) ? envelope.accounts : []);
    const sessions = registry.read(deps.registryFile).sessions;
    const mine = sessions.map(entry => [entry.email, deckBlock(deps, entry.alias, entry.email)]);
    const owners = tokenOwners([...theirs.map(entry => [text(entry.email), blockOf(entry)]), ...mine]);
    const trusted = (email, block) => Boolean(block?.refreshToken && (owners.get(block.refreshToken)?.size ?? 0) === 1 && owners.get(block.refreshToken)?.has(email.toLowerCase()));
    const pullable = theirs.filter(entry => entry.kind !== 'api_key' && trusted(text(entry.email), blockOf(entry)));
    const imported = pullable.length
        ? (0, cswap_import_1.importEnvelope)({ accounts: pullable }, { slotOf: deps.slotOf, registryFile: deps.registryFile, now: deps.now })
        : { added: [], updated: [] };
    const byEmail = new Map(theirs.map(entry => [text(entry.email).toLowerCase(), entry]));
    let nextNumber = Math.max(0, ...theirs.map(entry => (typeof entry.number === 'number' ? entry.number : 0)));
    const push = [];
    const pushed = [];
    for (const session of registry.read(deps.registryFile).sessions) {
        const block = deckBlock(deps, session.alias, session.email);
        if (!block || !trusted(session.email, block))
            continue;
        const other = byEmail.get(session.email.toLowerCase());
        if (other?.kind === 'api_key')
            continue;
        const otherBlock = other ? blockOf(other) : null;
        const live = deps.codeEmail()?.toLowerCase() === session.email.toLowerCase();
        if (!live && other && trusted(session.email, otherBlock) && expiresAt(otherBlock) >= expiresAt(block))
            continue;
        const oauthAccount = (0, json_1.readJsonFile)(node_path_1.default.join(deps.slotOf(session.alias), (0, installs_1.accountFileName)(installs_1.CODE_INSTALL)));
        if (!oauthAccount || typeof oauthAccount !== 'object')
            continue;
        push.push({
            number: typeof other?.number === 'number' ? other.number : ++nextNumber,
            email: other ? text(other.email) : session.email,
            uuid: text(other?.uuid) || session.accountUuid || '',
            organizationUuid: other ? text(other.organizationUuid) : session.orgUuid ?? '',
            organizationName: text(other?.organizationName),
            credentials: { claudeAiOauth: block },
            config: { oauthAccount },
        });
        pushed.push(session.alias);
    }
    if (push.length) {
        deps.importCswap({
            version: 1,
            exportedAt: deps.now().toISOString(),
            exportedFrom: 'claudedeck',
            encrypted: false,
            activeAccountNumber: null,
            accounts: push,
        });
    }
    return { pulled: [...imported.added, ...imported.updated], pushed };
}
function importIntoCswap(envelope, binary = (0, cswap_import_1.cswapBinary)()) {
    const dir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'claudedeck-cswap-'));
    const file = node_path_1.default.join(dir, 'import.json');
    try {
        node_fs_1.default.writeFileSync(file, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
        const run = (0, node_child_process_1.spawnSync)(binary, ['import', file, '--force'], { encoding: 'utf8', windowsHide: true });
        if (run.error)
            throw new Error(`Could not run cswap: ${run.error.message}`);
        if (run.status !== 0)
            throw new Error(`cswap import failed: ${(run.stderr || run.stdout || '').trim().split('\n').pop() ?? ''}`);
    }
    finally {
        node_fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
}
function defaultSyncDeps() {
    return {
        exportCswap: () => (0, cswap_import_1.exportFromCswap)(),
        importCswap: envelope => importIntoCswap(envelope),
        slotOf: alias => (0, paths_1.sessionSlot)(alias),
        registryFile: undefined,
        credPath: (0, paths_1.codeCredentialsPath)(),
        codeEmail: () => (0, identity_1.readCodeAccount)((0, paths_1.codeAccountPath)())?.email ?? null,
        now: () => new Date(),
    };
}
function createCswapWatcher(deps, theirSignature = () => cswapSignature()) {
    let seen = { theirs: '', mine: '' };
    return {
        check() {
            const current = { theirs: theirSignature(), mine: deckSignature(deps) };
            if (current.theirs === seen.theirs && current.mine === seen.mine)
                return null;
            try {
                return syncWithCswap(deps);
            }
            finally {
                seen = { theirs: theirSignature(), mine: deckSignature(deps) };
            }
        },
    };
}
