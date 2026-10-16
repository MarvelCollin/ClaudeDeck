#!/usr/bin/env node
import { errorMessage } from '../core/fs/json';
import { runClaudeOnce } from '../runner/run-claude';

runClaudeOnce().then(
  code => {
    process.exitCode = code;
  },
  error => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
);
