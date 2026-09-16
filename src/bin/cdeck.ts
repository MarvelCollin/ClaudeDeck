#!/usr/bin/env node
import { runAccountsCommand } from '../cli/accounts-command';
import { errorMessage } from '../core/fs/json';

runAccountsCommand(process.argv.slice(2)).catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
