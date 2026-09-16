import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../core/fs/json';
import {
  IAccountIdentity,
  ICachedIdentity,
  ICodeAccountFile,
  IIdentityLookupOptions,
  IParsedAccount,
  IV8String,
  IVarint,
} from './interfaces';
import { codeAccountPath, desktopConfigPath } from './paths';

const ONE_BYTE_STRING = 0x22;
const TWO_BYTE_STRING = 0x63;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_FIELD_LENGTH = 256;

export function readVarint(buf: Buffer, start: number): IVarint | null {
  let result = 0;
  let shift = 0;
  let pos = start;
  while (pos < buf.length) {
    const byte = buf[pos] as number;
    result |= (byte & 0x7f) << shift;
    pos += 1;
    if ((byte & 0x80) === 0) return { value: result, next: pos };
    shift += 7;
    if (shift > 35) break;
  }
  return null;
}

export function readV8String(buf: Buffer, at: number): IV8String | null {
  const tag = buf[at];
  if (tag !== ONE_BYTE_STRING && tag !== TWO_BYTE_STRING) return null;
  const len = readVarint(buf, at + 1);
  if (!len) return null;
  const end = len.next + len.value;
  if (end > buf.length) return null;
  const slice = buf.subarray(len.next, end);
  return { text: tag === TWO_BYTE_STRING ? slice.toString('utf16le') : slice.toString('utf8'), next: end };
}

export function extractField(buf: Buffer, name: string): string | null {
  const key = Buffer.from(name, 'utf8');
  let index = buf.indexOf(key);
  while (index !== -1) {
    const parsed = readV8String(buf, index + key.length);
    if (parsed && parsed.text.length && parsed.text.length < MAX_FIELD_LENGTH && !/[ -]/.test(parsed.text)) {
      return parsed.text;
    }
    index = buf.indexOf(key, index + 1);
  }
  return null;
}

export function parseAccount(buf: Buffer): IParsedAccount | null {
  const email = extractField(buf, 'email_address');
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  const name = extractField(buf, 'display_name') || extractField(buf, 'full_name');
  return { email, name: name || (email.split('@')[0] as string) };
}

function walkFiles(dir: string, files: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, files);
    else files.push(full);
  }
}

export function claudeDbFiles(profileDir: string): string[] {
  const root = path.join(profileDir, 'IndexedDB');
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.toLowerCase().includes('claude.ai')) walkFiles(path.join(root, entry.name), files);
  }
  return files;
}

export function readDesktopAccountUuid(profileDir: string): string | null {
  const config = readJsonFile<{ lastKnownAccountUuid?: unknown }>(desktopConfigPath(profileDir));
  const uuid = config?.lastKnownAccountUuid;
  return typeof uuid === 'string' && uuid ? uuid : null;
}

export function readCodeAccount(file: string = codeAccountPath()): IAccountIdentity | null {
  const account = readJsonFile<ICodeAccountFile>(file)?.oauthAccount;
  if (!account || typeof account.emailAddress !== 'string' || !account.emailAddress) return null;
  const email = account.emailAddress;
  const name =
    (typeof account.displayName === 'string' && account.displayName) ||
    (typeof account.fullName === 'string' && account.fullName) ||
    (email.split('@')[0] as string);
  return {
    accountUuid: typeof account.accountUuid === 'string' ? account.accountUuid : null,
    email,
    name,
  };
}

export function scanIndexedDb(profileDir: string): IParsedAccount | null {
  for (const file of claudeDbFiles(profileDir)) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (buf.indexOf('email_address') === -1) continue;
    const account = parseAccount(buf);
    if (account) return account;
  }
  return null;
}

function fromCache(uuid: string, known: Pick<ICachedIdentity, 'email' | 'name'> | { email?: string; name?: string }): IAccountIdentity | null {
  if (!known.email) return null;
  return { accountUuid: uuid, email: known.email, name: known.name || (known.email.split('@')[0] as string) };
}

export function readIdentity(profileDir: string, options: IIdentityLookupOptions = {}): IAccountIdentity | null {
  const uuid = readDesktopAccountUuid(profileDir);
  const code = readCodeAccount(options.codeAccountPath);

  if (uuid) {
    if (code && code.accountUuid === uuid) return { ...code, accountUuid: uuid };
    const known = options.lookup ? options.lookup(uuid) : null;
    const cached = known ? fromCache(uuid, known) : null;
    if (cached) return cached;
  }

  const scanned = scanIndexedDb(profileDir);
  if (scanned) return { ...scanned, accountUuid: uuid };
  if (!uuid && code) return code;
  return null;
}
