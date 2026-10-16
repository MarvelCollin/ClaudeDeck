"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
exports.errorMessage = errorMessage;
exports.errorCode = errorCode;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function readJsonFile(file) {
    if (!file || !node_fs_1.default.existsSync(file))
        return null;
    try {
        return JSON.parse(node_fs_1.default.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJsonFile(file, value) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
    node_fs_1.default.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function errorCode(error) {
    return error instanceof Error && typeof error.code === 'string'
        ? error.code ?? null
        : null;
}
