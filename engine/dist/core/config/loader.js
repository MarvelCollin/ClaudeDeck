"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../paths");
const validate_1 = require("./validate");
function ensureDefaultConfig(file) {
    if (node_fs_1.default.existsSync(file))
        return;
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
    node_fs_1.default.copyFileSync(paths_1.configTemplatePath, file);
}
function loadConfig(configPath) {
    const resolvedConfigPath = node_path_1.default.resolve(configPath || paths_1.defaultConfigPath);
    if (!configPath)
        ensureDefaultConfig(resolvedConfigPath);
    const raw = node_fs_1.default.readFileSync(resolvedConfigPath);
    const config = JSON.parse(raw.toString('utf8'));
    (0, validate_1.validateConfig)(config);
    return {
        config,
        configPath: resolvedConfigPath,
        configHash: node_crypto_1.default.createHash('sha256').update(raw).digest('hex'),
        logPath: (0, paths_1.resolveFromConfig)(config.logFile, resolvedConfigPath),
    };
}
function saveConfig(context, config) {
    (0, validate_1.validateConfig)(config);
    node_fs_1.default.writeFileSync(context.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return loadConfig(context.configPath);
}
