"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIMARY_INSTALL_LABEL = exports.CODE_INSIDERS_INSTALL = exports.CODE_INSTALL = void 0;
exports.claudeInstalls = claudeInstalls;
exports.installFileName = installFileName;
exports.accountFileName = accountFileName;
const paths_1 = require("./paths");
exports.CODE_INSTALL = 'code';
exports.CODE_INSIDERS_INSTALL = 'code-insiders';
exports.PRIMARY_INSTALL_LABEL = 'Claude Desktop and Claude Code';
function claudeInstalls(env = process.env) {
    return [
        {
            id: exports.CODE_INSTALL,
            label: exports.PRIMARY_INSTALL_LABEL,
            accountPath: (0, paths_1.codeAccountPath)(env),
            credPath: (0, paths_1.codeCredentialsPath)(env),
        },
        {
            id: exports.CODE_INSIDERS_INSTALL,
            label: 'Claude Code Insiders',
            accountPath: (0, paths_1.codeInsidersAccountPath)(env),
            credPath: (0, paths_1.codeInsidersCredentialsPath)(env),
        },
    ];
}
function installFileName(id) {
    return id === exports.CODE_INSTALL ? 'code.json' : `${id}.json`;
}
function accountFileName(id) {
    return id === exports.CODE_INSTALL ? 'account.json' : `${id}-account.json`;
}
