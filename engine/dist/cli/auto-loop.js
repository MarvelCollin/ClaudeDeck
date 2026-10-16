"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutoLoop = runAutoLoop;
const auto_switch_1 = require("../accounts/auto-switch");
const switcher_1 = require("../accounts/switcher");
async function runAutoLoop() {
    const auto = (0, auto_switch_1.createAutoSwitch)((0, auto_switch_1.defaultAutoDeps)((0, switcher_1.createSwitcher)()));
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await auto.run(() => undefined, controller.signal);
}
