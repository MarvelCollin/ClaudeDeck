"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSWAP_DEFAULT_THRESHOLD = void 0;
exports.readCswapPin = readCswapPin;
const node_path_1 = __importDefault(require("node:path"));
const json_1 = require("../core/fs/json");
const cswap_sync_1 = require("./cswap-sync");
exports.CSWAP_DEFAULT_THRESHOLD = 90;
function readCswapPin(dir = (0, cswap_sync_1.cswapDataDir)()) {
    const state = (0, json_1.readJsonFile)(node_path_1.default.join(dir, 'autoswitch_state.json'));
    const email = state?.cliPin?.email;
    if (typeof email !== 'string' || !email)
        return null;
    const settings = (0, json_1.readJsonFile)(node_path_1.default.join(dir, 'settings.json'));
    const threshold = settings?.autoswitch?.threshold;
    const untilPercent = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : exports.CSWAP_DEFAULT_THRESHOLD;
    return { email, untilPercent };
}
