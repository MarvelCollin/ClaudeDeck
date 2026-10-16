"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runClaudeOnce = runClaudeOnce;
const claude_cli_1 = require("../core/claude-cli");
const loader_1 = require("../core/config/loader");
const json_1 = require("../core/fs/json");
const run_log_1 = require("../core/logging/run-log");
const warm_accounts_1 = require("./warm-accounts");
function argValue(argv, name) {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
}
function stamp(text) {
    return `[${new Date().toISOString()}] ${text}\n`;
}
const DEFAULT_RUNNER_DEPS = {
    command: (prompt, model) => (0, claude_cli_1.claudeCommand)(prompt, model),
    run: (invocation, env) => (0, warm_accounts_1.spawnClaude)(invocation, env, 0),
    warmDeps: warm_accounts_1.defaultWarmDeps,
};
async function runClaudeOnce(argv = process.argv.slice(2), overrides = {}) {
    const deps = { ...DEFAULT_RUNNER_DEPS, ...overrides };
    const context = (0, loader_1.loadConfig)(argValue(argv, '--config'));
    let exitCode = 1;
    let invocation = null;
    (0, run_log_1.appendLog)(context.logPath, stamp('start'));
    try {
        invocation = deps.command(context.config.prompt, context.config.model);
        const result = deps.run(invocation, process.env);
        if (result.error)
            throw new Error(result.error);
        if (result.stdout)
            (0, run_log_1.appendLog)(context.logPath, result.stdout);
        if (result.stderr)
            (0, run_log_1.appendLog)(context.logPath, result.stderr);
        exitCode = typeof result.status === 'number' ? result.status : 1;
    }
    catch (error) {
        const message = (0, json_1.errorMessage)(error);
        (0, run_log_1.appendLog)(context.logPath, `${message}\n`);
        console.error(message);
    }
    if (context.config.warmAllAccounts && invocation) {
        const ready = invocation;
        try {
            const results = await (0, warm_accounts_1.warmAccounts)(deps.warmDeps(() => ready));
            for (const line of (0, warm_accounts_1.warmLogLines)(results))
                (0, run_log_1.appendLog)(context.logPath, stamp(line));
        }
        catch (error) {
            (0, run_log_1.appendLog)(context.logPath, stamp(`warm failed: ${(0, json_1.errorMessage)(error)}`));
        }
    }
    (0, run_log_1.appendLog)(context.logPath, stamp(`exit ${exitCode}`));
    return exitCode;
}
