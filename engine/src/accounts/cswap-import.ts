import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../core/fs/json';
import { ICswapImportDeps, ICswapImportResult, IOAuthBlock } from './interfaces';
import { accountFileName, CODE_INSTALL, installFileName } from './installs';
import { deriveAlias, homeDir, sessionSlot } from './paths';
import * as registry from './registry';

interface IExportedAccount {
  email?: unknown;
  uuid?: unknown;
  organizationUuid?: unknown;
  kind?: unknown;
  credentials?: { claudeAiOauth?: IOAuthBlock } | unknown;
  config?: { oauthAccount?: Record<string, unknown> } | unknown;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function expiresAt(block: IOAuthBlock | null): number {
  return block && typeof block.expiresAt === 'number' ? block.expiresAt : 0;
}

export function cswapBinary(env = process.env): string {
  const local = path.join(homeDir(env), '.local', 'bin', process.platform === 'win32' ? 'cswap.exe' : 'cswap');
  return fs.existsSync(local) ? local : 'cswap';
}

export function exportFromCswap(binary: string = cswapBinary()): unknown {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudedeck-cswap-'));
  const file = path.join(dir, 'export.json');
  try {
    const run = spawnSync(binary, ['export', file], { encoding: 'utf8', windowsHide: true });
    if (run.error) throw new Error(`Could not run cswap: ${run.error.message}`);
    if (run.status !== 0 || !fs.existsSync(file)) {
      throw new Error(`cswap export failed: ${(run.stderr || run.stdout || '').trim().split('\n').pop() ?? ''}`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function defaultImportDeps(): ICswapImportDeps {
  return { slotOf: alias => sessionSlot(alias), registryFile: undefined, now: () => new Date() };
}

export function importEnvelope(envelope: unknown, overrides: Partial<ICswapImportDeps> = {}): ICswapImportResult {
  const deps: ICswapImportDeps = { ...defaultImportDeps(), ...overrides };
  const accounts = (envelope as { accounts?: unknown } | null)?.accounts;
  if (!Array.isArray(accounts)) throw new Error('The cswap export has no accounts.');
  const result: ICswapImportResult = { added: [], updated: [], kept: [], skipped: [] };
  let data = registry.read(deps.registryFile);

  for (const raw of accounts as IExportedAccount[]) {
    const email = text(raw.email);
    const block = (raw.credentials as { claudeAiOauth?: IOAuthBlock } | undefined)?.claudeAiOauth ?? null;
    const oauthAccount = (raw.config as { oauthAccount?: Record<string, unknown> } | undefined)?.oauthAccount ?? null;
    if (!email || raw.kind === 'api_key' || !block || typeof block !== 'object') {
      result.skipped.push(email ?? 'unknown');
      continue;
    }
    const existing = registry.sessionByEmail(data, email);
    const alias = existing?.alias ?? deriveAlias(email);
    const slot = deps.slotOf(alias);
    const codeFile = path.join(slot, installFileName(CODE_INSTALL));
    const current = readJsonFile<IOAuthBlock>(codeFile);
    const fresher = !current || expiresAt(block) > expiresAt(current);

    if (fresher) writeJsonFile(codeFile, block);
    if (oauthAccount && (fresher || !fs.existsSync(path.join(slot, accountFileName(CODE_INSTALL))))) {
      writeJsonFile(path.join(slot, accountFileName(CODE_INSTALL)), oauthAccount);
    }

    const name = text(oauthAccount?.displayName) ?? existing?.name ?? (email.split('@')[0] as string);
    data = registry.saveSession(
      data,
      {
        alias,
        email,
        name,
        accountUuid: text(raw.uuid) ?? existing?.accountUuid ?? null,
        orgUuid: text(raw.organizationUuid) ?? existing?.orgUuid ?? null,
        installs: [CODE_INSTALL],
      },
      deps.now()
    );

    if (!existing) result.added.push(alias);
    else if (fresher) result.updated.push(alias);
    else result.kept.push(alias);
  }

  registry.write(data, deps.registryFile);
  return result;
}
