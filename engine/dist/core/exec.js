"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCapture = runCapture;
exports.runInherited = runInherited;
exports.tryCapture = tryCapture;
exports.succeeds = succeeds;
exports.spawnDetached = spawnDetached;
const node_child_process_1 = require("node:child_process");
const paths_1 = require("./paths");
function runCapture(command, args, options = {}) {
    const result = (0, node_child_process_1.spawnSync)(command, args, { cwd: paths_1.packageRoot, encoding: 'utf8', shell: false, ...options });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        const message = (result.stderr || result.stdout || `${command} failed with exit code ${result.status}`).trim();
        throw new Error(message);
    }
    return result.stdout || '';
}
function runInherited(command, args) {
    const result = (0, node_child_process_1.spawnSync)(command, args, { cwd: paths_1.packageRoot, stdio: 'inherit', shell: false });
    if (result.error)
        throw result.error;
    if (result.status !== 0)
        throw new Error(`${command} failed with exit code ${result.status}.`);
}
function tryCapture(command, args) {
    const result = (0, node_child_process_1.spawnSync)(command, args, { encoding: 'utf8' });
    if (result.error || result.status !== 0)
        return null;
    return result.stdout ?? '';
}
function succeeds(command, args) {
    return (0, node_child_process_1.spawnSync)(command, args, { encoding: 'utf8' }).status === 0;
}
function spawnDetached(command, args) {
    const child = (0, node_child_process_1.spawn)(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return child.pid;
}
