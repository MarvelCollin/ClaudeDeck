#!/usr/bin/env node
const { runWeb } = require('../scripts/cli/web');

runWeb(process.argv.slice(2)).catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
