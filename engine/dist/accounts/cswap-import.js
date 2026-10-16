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
exports.cswapBinary = cswapBinary;
exports.exportFromCswap = exportFromCswap;
exports.defaultImportDeps = defaultImportDeps;
exports.importEnvelope = importEnvelope;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const installs_1 = require("./installs");
const paths_1 = require("./paths");
const registry = __importStar(require("./registry"));
function text(value) {
    return typeof value === 'string' && value ? value : null;
}
function expiresAt(block) {
    return block && typeof block.expiresAt === 'number' ? block.expiresAt : 0;
}
function cswapBinary(env = process.env) {
    const local = node_path_1.default.join((0, paths_1.homeDir)(env), '.local', 'bin', process.platform === 'win32' ? 'cswap.exe' : 'cswap');
    return node_fs_1.default.existsSync(local) ? local : 'cswap';
}
function exportFromCswap(binary = cswapBinary()) {
    const dir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'claudedeck-cswap-'));
    const file = node_path_1.default.join(dir, 'export.json');
    try {
        const run = (0, node_child_process_1.spawnSync)(binary, ['export', file], { encoding: 'utf8', windowsHide: true });
        if (run.error)
            throw new Error(`Could not run cswap: ${run.error.message}`);
        if (run.status !== 0 || !node_fs_1.default.existsSync(file)) {
            throw new Error(`cswap export failed: ${(run.stderr || run.stdout || '').trim().split('\n').pop() ?? ''}`);
        }
        return JSON.parse(node_fs_1.default.readFileSync(file, 'utf8'));
    }
    finally {
        node_fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
}
function defaultImportDeps() {
    return { slotOf: alias => (0, paths_1.sessionSlot)(alias), registryFile: undefined, now: () => new Date() };
}
function importEnvelope(envelope, overrides = {}) {
    const deps = { ...defaultImportDeps(), ...overrides };
    const accounts = envelope?.accounts;
    if (!Array.isArray(accounts))
        throw new Error('The cswap export has no accounts.');
    const result = { added: [], updated: [], kept: [], skipped: [] };
    let data = registry.read(deps.registryFile);
    for (const raw of accounts) {
        const email = text(raw.email);
        const block = raw.credentials?.claudeAiOauth ?? null;
        const oauthAccount = raw.config?.oauthAccount ?? null;
        if (!email || raw.kind === 'api_key' || !block || typeof block !== 'object') {
            result.skipped.push(email ?? 'unknown');
            continue;
        }
        const existing = registry.sessionByEmail(data, email);
        const alias = existing?.alias ?? (0, paths_1.deriveAlias)(email);
        const slot = deps.slotOf(alias);
        const codeFile = node_path_1.default.join(slot, (0, installs_1.installFileName)(installs_1.CODE_INSTALL));
        const current = (0, json_1.readJsonFile)(codeFile);
        const fresher = !current || expiresAt(block) > expiresAt(current);
        if (fresher)
            (0, json_1.writeJsonFile)(codeFile, block);
        if (oauthAccount && (fresher || !node_fs_1.default.existsSync(node_path_1.default.join(slot, (0, installs_1.accountFileName)(installs_1.CODE_INSTALL))))) {
            (0, json_1.writeJsonFile)(node_path_1.default.join(slot, (0, installs_1.accountFileName)(installs_1.CODE_INSTALL)), oauthAccount);
        }
        const name = text(oauthAccount?.displayName) ?? existing?.name ?? email.split('@')[0];
        data = registry.saveSession(data, {
            alias,
            email,
            name,
            accountUuid: text(raw.uuid) ?? existing?.accountUuid ?? null,
            orgUuid: text(raw.organizationUuid) ?? existing?.orgUuid ?? null,
            installs: [installs_1.CODE_INSTALL],
        }, deps.now());
        if (!existing)
            result.added.push(alias);
        else if (fresher)
            result.updated.push(alias);
        else
            result.kept.push(alias);
    }
    registry.write(data, deps.registryFile);
    return result;
}
