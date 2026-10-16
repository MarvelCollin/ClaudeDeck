"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_CODE_ITEMS = exports.SHARED_DESKTOP_ITEMS = void 0;
exports.swappedItems = swappedItems;
exports.capture = capture;
exports.apply = apply;
exports.clearFromSlots = clearFromSlots;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const session_store_1 = require("./session-store");
exports.SHARED_DESKTOP_ITEMS = [];
exports.SHARED_CODE_ITEMS = ['projects', 'history.jsonl', 'todos', 'statsig'];
function swappedItems(allItems, sharedList = exports.SHARED_DESKTOP_ITEMS, enabled = true) {
    if (!enabled)
        return [...allItems];
    const skip = new Set(sharedList.map(item => item.toLowerCase()));
    return allItems.filter(item => !skip.has(item.toLowerCase()));
}
function capture(profileDir, storeDir, items = exports.SHARED_DESKTOP_ITEMS) {
    const captured = [];
    if (!node_fs_1.default.existsSync(profileDir))
        return captured;
    node_fs_1.default.mkdirSync(storeDir, { recursive: true });
    for (const item of items) {
        if ((0, session_store_1.copyItem)(node_path_1.default.join(profileDir, item), node_path_1.default.join(storeDir, item)))
            captured.push(item);
    }
    return captured;
}
function apply(storeDir, profileDir, items = exports.SHARED_DESKTOP_ITEMS) {
    const applied = [];
    if (!node_fs_1.default.existsSync(storeDir))
        return applied;
    node_fs_1.default.mkdirSync(profileDir, { recursive: true });
    for (const item of items) {
        const src = node_path_1.default.join(storeDir, item);
        if (!node_fs_1.default.existsSync(src))
            continue;
        if ((0, session_store_1.copyItem)(src, node_path_1.default.join(profileDir, item)))
            applied.push(item);
    }
    return applied;
}
function clearFromSlots(slotDirs, items = exports.SHARED_DESKTOP_ITEMS) {
    const removed = [];
    for (const slotDir of slotDirs) {
        for (const item of items) {
            const target = node_path_1.default.join(slotDir, item);
            if (!node_fs_1.default.existsSync(target))
                continue;
            node_fs_1.default.rmSync(target, { recursive: true, force: true });
            removed.push(target);
        }
    }
    return removed;
}
