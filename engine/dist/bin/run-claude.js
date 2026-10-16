#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const json_1 = require("../core/fs/json");
const run_claude_1 = require("../runner/run-claude");
(0, run_claude_1.runClaudeOnce)().then(code => {
    process.exitCode = code;
}, error => {
    console.error((0, json_1.errorMessage)(error));
    process.exitCode = 1;
});
