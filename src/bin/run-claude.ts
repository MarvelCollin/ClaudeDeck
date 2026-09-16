#!/usr/bin/env node
import { errorMessage } from '../core/fs/json';
import { runClaudeOnce } from '../runner/run-claude';

try {
  process.exitCode = runClaudeOnce();
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
