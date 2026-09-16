import { IClaudeInstall } from './interfaces';
import {
  codeAccountPath,
  codeCredentialsPath,
  codeInsidersAccountPath,
  codeInsidersCredentialsPath,
} from './paths';

export const CODE_INSTALL = 'code';
export const CODE_INSIDERS_INSTALL = 'code-insiders';
export const PRIMARY_INSTALL_LABEL = 'Claude Desktop and Claude Code';

export function claudeInstalls(env = process.env): IClaudeInstall[] {
  return [
    {
      id: CODE_INSTALL,
      label: PRIMARY_INSTALL_LABEL,
      accountPath: codeAccountPath(env),
      credPath: codeCredentialsPath(env),
    },
    {
      id: CODE_INSIDERS_INSTALL,
      label: 'Claude Code Insiders',
      accountPath: codeInsidersAccountPath(env),
      credPath: codeInsidersCredentialsPath(env),
    },
  ];
}

export function installFileName(id: string): string {
  return id === CODE_INSTALL ? 'code.json' : `${id}.json`;
}
