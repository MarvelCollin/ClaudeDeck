import path from 'node:path';
import { readJsonFile } from '../core/fs/json';
import { IAccountUsage, IUsageSample, IUsageWindow } from './interfaces';

export const USAGE_FILE = 'plan-usage-history.json';
export const SESSION_KEY = 'fh';
export const WEEKLY_KEY = 'sd';

interface IUsageHistory {
  version?: number;
  samples?: unknown;
}

function toWindow(value: unknown): IUsageWindow | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const usedPercent = Math.min(100, Math.max(0, Math.round(value)));
  return { usedPercent, leftPercent: 100 - usedPercent };
}

function isSample(value: unknown): value is IUsageSample {
  const sample = value as IUsageSample | null;
  return Boolean(
    sample && typeof sample === 'object' && typeof sample.t === 'number' && typeof sample.org === 'string' && sample.org
  );
}

export function usagePath(profileDir: string): string {
  return path.join(profileDir, USAGE_FILE);
}

export function readSamples(profileDir: string): IUsageSample[] {
  const raw = readJsonFile<IUsageHistory>(usagePath(profileDir));
  if (!raw || !Array.isArray(raw.samples)) return [];
  return raw.samples.filter(isSample).sort((left, right) => left.t - right.t);
}

export function latestSample(samples: readonly IUsageSample[]): IUsageSample | null {
  return samples.length ? (samples[samples.length - 1] as IUsageSample) : null;
}

export function activeOrgUuid(samples: readonly IUsageSample[]): string | null {
  return latestSample(samples)?.org ?? null;
}

export function latestSampleFor(samples: readonly IUsageSample[], orgUuid: string | null): IUsageSample | null {
  if (!orgUuid) return null;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index] as IUsageSample;
    if (sample.org === orgUuid) return sample;
  }
  return null;
}

export function toUsage(sample: IUsageSample | null): IAccountUsage | null {
  if (!sample) return null;
  const session = toWindow(sample.u?.[SESSION_KEY]);
  const weekly = toWindow(sample.u?.[WEEKLY_KEY]);
  if (!session && !weekly) return null;
  return {
    orgUuid: sample.org,
    sampledAt: new Date(sample.t).toISOString(),
    session,
    weekly,
  };
}

export function usageFor(samples: readonly IUsageSample[], orgUuid: string | null): IAccountUsage | null {
  return toUsage(latestSampleFor(samples, orgUuid));
}
