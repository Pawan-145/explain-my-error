import * as vscode from 'vscode';
import { AiExplanation } from './aiExplainer';

const CACHE_STORAGE_KEY = 'explainMyError.aiResponseCache';
const MAX_CACHE_ENTRIES = 200;

/**
 * Reduces an error to a normalized signature so that two occurrences of
 * "the same kind" of error (same exception type, different specific values
 * like line numbers, file paths, or variable names) share one cache entry.
 * This is deliberately generic — it doesn't need to be a perfect match,
 * just consistent enough to catch genuine repeats.
 */
export function normalizeForCacheKey(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) || text;

  return firstLine
    .replace(/'[^']*'/g, "'X'")
    .replace(/"[^"]*"/g, '"X"')
    .replace(/(?:[a-zA-Z]:)?[\\/][^\s:()'"]+/g, 'PATH')
    .replace(/\d+/g, 'N')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

interface CacheEntry {
  key: string;
  explanation: AiExplanation;
  savedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

export function getCachedExplanation(
  context: vscode.ExtensionContext,
  errorText: string
): AiExplanation | undefined {
  const cache = context.globalState.get<CacheStore>(CACHE_STORAGE_KEY, {});
  const key = normalizeForCacheKey(errorText);
  return cache[key]?.explanation;
}

export async function storeCachedExplanation(
  context: vscode.ExtensionContext,
  errorText: string,
  explanation: AiExplanation
): Promise<void> {
  const cache = context.globalState.get<CacheStore>(CACHE_STORAGE_KEY, {});
  const key = normalizeForCacheKey(errorText);

  cache[key] = { key, explanation, savedAt: Date.now() };

  // Cap the cache size so it can't grow unbounded — evict oldest entries first.
  const entries = Object.values(cache).sort((a, b) => a.savedAt - b.savedAt);
  if (entries.length > MAX_CACHE_ENTRIES) {
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
    for (const entry of toRemove) {
      delete cache[entry.key];
    }
  }

  await context.globalState.update(CACHE_STORAGE_KEY, cache);
}

export async function clearAiCache(context: vscode.ExtensionContext): Promise<number> {
  const cache = context.globalState.get<CacheStore>(CACHE_STORAGE_KEY, {});
  const count = Object.keys(cache).length;
  await context.globalState.update(CACHE_STORAGE_KEY, {});
  return count;
}

export function getAiCacheSize(context: vscode.ExtensionContext): number {
  const cache = context.globalState.get<CacheStore>(CACHE_STORAGE_KEY, {});
  return Object.keys(cache).length;
}
