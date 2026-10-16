"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readVarint = readVarint;
exports.readV8String = readV8String;
exports.extractField = extractField;
exports.parseAccount = parseAccount;
exports.claudeDbFiles = claudeDbFiles;
exports.readDesktopAccountUuid = readDesktopAccountUuid;
exports.readCodeAccount = readCodeAccount;
exports.scanIndexedDb = scanIndexedDb;
exports.readIdentity = readIdentity;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const paths_1 = require("./paths");
const ONE_BYTE_STRING = 0x22;
const TWO_BYTE_STRING = 0x63;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_FIELD_LENGTH = 256;
const CONTROL_CHARS = /[\x00-\x1f]/;
function readVarint(buf, start) {
    let result = 0;
    let shift = 0;
    let pos = start;
    while (pos < buf.length) {
        const byte = buf[pos];
        result |= (byte & 0x7f) << shift;
        pos += 1;
        if ((byte & 0x80) === 0)
            return { value: result, next: pos };
        shift += 7;
        if (shift > 35)
            break;
    }
    return null;
}
function readV8String(buf, at) {
    const tag = buf[at];
    if (tag !== ONE_BYTE_STRING && tag !== TWO_BYTE_STRING)
        return null;
    const len = readVarint(buf, at + 1);
    if (!len)
        return null;
    const end = len.next + len.value;
    if (end > buf.length)
        return null;
    const slice = buf.subarray(len.next, end);
    return { text: tag === TWO_BYTE_STRING ? slice.toString('utf16le') : slice.toString('utf8'), next: end };
}
function extractField(buf, name) {
    const key = Buffer.from(name, 'utf8');
    let index = buf.indexOf(key);
    while (index !== -1) {
        const parsed = readV8String(buf, index + key.length);
        if (parsed && parsed.text.length && parsed.text.length < MAX_FIELD_LENGTH && !CONTROL_CHARS.test(parsed.text)) {
            return parsed.text;
        }
        index = buf.indexOf(key, index + 1);
    }
    return null;
}
function parseAccount(buf) {
    const email = extractField(buf, 'email_address');
    if (!email || !EMAIL_PATTERN.test(email))
        return null;
    const name = extractField(buf, 'display_name') || extractField(buf, 'full_name');
    return { email, name: name || email.split('@')[0] };
}
function walkFiles(dir, files) {
    let entries;
    try {
        entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const full = node_path_1.default.join(dir, entry.name);
        if (entry.isDirectory())
            walkFiles(full, files);
        else
            files.push(full);
    }
}
function claudeDbFiles(profileDir) {
    const root = node_path_1.default.join(profileDir, 'IndexedDB');
    if (!node_fs_1.default.existsSync(root))
        return [];
    const files = [];
    for (const entry of node_fs_1.default.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes('claude.ai'))
            walkFiles(node_path_1.default.join(root, entry.name), files);
    }
    return files;
}
function readDesktopAccountUuid(profileDir) {
    const config = (0, json_1.readJsonFile)((0, paths_1.desktopConfigPath)(profileDir));
    const uuid = config?.lastKnownAccountUuid;
    return typeof uuid === 'string' && uuid ? uuid : null;
}
function readCodeAccount(file = (0, paths_1.codeAccountPath)()) {
    const account = (0, json_1.readJsonFile)(file)?.oauthAccount;
    if (!account || typeof account.emailAddress !== 'string' || !account.emailAddress)
        return null;
    const email = account.emailAddress;
    const name = (typeof account.displayName === 'string' && account.displayName) ||
        (typeof account.fullName === 'string' && account.fullName) ||
        email.split('@')[0];
    return {
        accountUuid: typeof account.accountUuid === 'string' ? account.accountUuid : null,
        email,
        name,
    };
}
function scanIndexedDb(profileDir) {
    for (const file of claudeDbFiles(profileDir)) {
        let buf;
        try {
            buf = node_fs_1.default.readFileSync(file);
        }
        catch {
            continue;
        }
        if (buf.indexOf('email_address') === -1)
            continue;
        const account = parseAccount(buf);
        if (account)
            return account;
    }
    return null;
}
function fromCache(uuid, known) {
    if (!known.email)
        return null;
    return { accountUuid: uuid, email: known.email, name: known.name || known.email.split('@')[0] };
}
function readIdentity(profileDir, options = {}) {
    const uuid = readDesktopAccountUuid(profileDir);
    const code = readCodeAccount(options.codeAccountPath);
    if (uuid) {
        if (code && code.accountUuid === uuid)
            return { ...code, accountUuid: uuid };
        const known = options.lookup ? options.lookup(uuid) : null;
        const cached = known ? fromCache(uuid, known) : null;
        if (cached)
            return cached;
    }
    const scanned = scanIndexedDb(profileDir);
    if (scanned)
        return { ...scanned, accountUuid: uuid };
    if (!uuid && code)
        return code;
    return null;
}
