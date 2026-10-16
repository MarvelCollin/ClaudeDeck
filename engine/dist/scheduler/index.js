"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowsScheduler = exports.macosScheduler = void 0;
exports.selectScheduler = selectScheduler;
const macos_1 = require("./macos");
Object.defineProperty(exports, "macosScheduler", { enumerable: true, get: function () { return macos_1.macosScheduler; } });
const windows_1 = require("./windows");
Object.defineProperty(exports, "windowsScheduler", { enumerable: true, get: function () { return windows_1.windowsScheduler; } });
function selectScheduler(platform = process.platform) {
    if (platform === 'win32')
        return windows_1.windowsScheduler;
    if (platform === 'darwin')
        return macos_1.macosScheduler;
    throw new Error('Only Windows and macOS are supported.');
}
