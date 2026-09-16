#!/usr/bin/env node
import { runCli } from '../cli/main';
import { errorMessage } from '../core/fs/json';

runCli().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
