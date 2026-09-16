import fs from 'node:fs';
import path from 'node:path';

export function readJsonFile<T>(file: string | undefined): T | null {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorCode(error: unknown): string | null {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string'
    ? (error as NodeJS.ErrnoException).code ?? null
    : null;
}
