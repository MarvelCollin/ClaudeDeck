"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeSlotFile = codeSlotFile;
exports.defaultCodeSlotDeps = defaultCodeSlotDeps;
exports.refreshLiveUsage = refreshLiveUsage;
const node_path_1 = __importDefault(require("node:path"));
const identity_1 = require("../accounts/identity");
const live_usage_1 = require("../accounts/live-usage");
const paths_1 = require("../accounts/paths");
function codeSlotFile(alias) {
    return node_path_1.default.join((0, paths_1.sessionSlot)(alias), 'code.json');
}
function defaultCodeSlotDeps() {
    return {
        codeEmail: () => (0, identity_1.readCodeAccount)((0, paths_1.codeAccountPath)())?.email ?? null,
        credPath: (0, paths_1.codeCredentialsPath)(),
        slotFile: codeSlotFile,
    };
}
async function refreshLiveUsage(sessions, force = false, deps = defaultCodeSlotDeps()) {
    const targets = (0, live_usage_1.targetsFor)(sessions, deps.codeEmail(), deps.credPath, deps.slotFile);
    return (0, live_usage_1.createLiveUsage)().refreshAll(targets, force);
}
