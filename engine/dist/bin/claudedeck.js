#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const main_1 = require("../cli/main");
const json_1 = require("../core/fs/json");
(0, main_1.runCli)().catch((error) => {
    console.error((0, json_1.errorMessage)(error));
    process.exitCode = 1;
});
