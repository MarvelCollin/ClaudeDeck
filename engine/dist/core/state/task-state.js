"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statePath = statePath;
exports.readState = readState;
exports.writeState = writeState;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../fs/json");
const paths_1 = require("../paths");
function statePath(platform = process.platform, env = process.env) {
    if (platform === 'linux')
        return node_path_1.default.join(node_os_1.default.homedir(), '.claudedeck-state.json');
    return node_path_1.default.join((0, paths_1.userDataDir)(platform, env), 'state.json');
}
function readState(file = statePath()) {
    return (0, json_1.readJsonFile)(file) ?? {};
}
function writeState(configHash, file = statePath()) {
    (0, json_1.writeJsonFile)(file, { configHash });
}
