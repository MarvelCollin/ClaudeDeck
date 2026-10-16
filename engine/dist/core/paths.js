"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfigPath = exports.HOME_FOLDER = exports.HOME_ENV = exports.configTemplatePath = exports.packageRoot = void 0;
exports.deckHome = deckHome;
exports.userDataDir = userDataDir;
exports.legacyUserDataDir = legacyUserDataDir;
exports.migrateLegacyData = migrateLegacyData;
exports.fromPackageRoot = fromPackageRoot;
exports.runnerScriptPath = runnerScriptPath;
exports.resolveFromConfig = resolveFromConfig;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("./fs/json");
exports.packageRoot = node_path_1.default.resolve(__dirname, '..', '..');
exports.configTemplatePath = node_path_1.default.join(exports.packageRoot, 'claudedeck.config.json');
function roamingBase(env) {
    return env.APPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Roaming');
}
exports.HOME_ENV = 'CLAUDEDECK_HOME';
exports.HOME_FOLDER = '.claudedeck';
function deckHome(env = process.env) {
    const value = env[exports.HOME_ENV];
    if (value)
        return node_path_1.default.resolve(value);
    if (value === '')
        return null;
    const folder = node_path_1.default.join(env.USERPROFILE || env.HOME || node_os_1.default.homedir(), exports.HOME_FOLDER);
    return node_fs_1.default.existsSync(folder) ? folder : null;
}
function userDataDir(platform = process.platform, env = process.env) {
    const home = deckHome(env);
    if (home)
        return home;
    if (platform === 'win32')
        return node_path_1.default.join(roamingBase(env), 'ClaudeDeck');
    if (platform === 'darwin')
        return node_path_1.default.join(node_os_1.default.homedir(), 'Library', 'Application Support', 'ClaudeDeck');
    return node_path_1.default.join(node_os_1.default.homedir(), '.config', 'claudedeck');
}
function legacyUserDataDir(platform = process.platform, env = process.env) {
    if (platform === 'win32')
        return node_path_1.default.join(roamingBase(env), 'ClaudeCron');
    if (platform === 'darwin')
        return node_path_1.default.join(node_os_1.default.homedir(), 'Library', 'Application Support', 'ClaudeCron');
    return node_path_1.default.join(node_os_1.default.homedir(), '.config', 'claudecron');
}
function migrateLegacyData(platform = process.platform, env = process.env) {
    const current = userDataDir(platform, env);
    const legacy = legacyUserDataDir(platform, env);
    if (current === legacy || node_fs_1.default.existsSync(current) || !node_fs_1.default.existsSync(legacy))
        return current;
    node_fs_1.default.renameSync(legacy, current);
    const legacyConfig = node_path_1.default.join(current, 'claudecron.config.json');
    const currentConfig = node_path_1.default.join(current, 'claudedeck.config.json');
    if (node_fs_1.default.existsSync(legacyConfig) && !node_fs_1.default.existsSync(currentConfig))
        node_fs_1.default.renameSync(legacyConfig, currentConfig);
    return current;
}
try {
    migrateLegacyData();
}
catch (error) {
    console.error(`Could not move your ClaudeCron data to the ClaudeDeck folder: ${(0, json_1.errorMessage)(error)}`);
}
exports.defaultConfigPath = node_path_1.default.join(userDataDir(), 'claudedeck.config.json');
function fromPackageRoot(...parts) {
    return node_path_1.default.join(exports.packageRoot, ...parts);
}
function runnerScriptPath() {
    return node_path_1.default.join(__dirname, '..', 'bin', `run-claude${node_path_1.default.extname(__filename)}`);
}
function resolveFromConfig(value, configPath) {
    return node_path_1.default.isAbsolute(value) ? value : node_path_1.default.join(node_path_1.default.dirname(configPath), value);
}
