import { ErrorRule, errorRules } from './errorDatabase';

export interface MatchResult {
  matched: boolean;
  rule?: ErrorRule;
  rawSnippet: string;
}

/**
 * Splits a block of text into separate error/traceback sections, so a
 * selection or captured output containing multiple distinct errors can
 * be handled individually instead of only matching the first one found.
 *
 * Splits before each "Traceback (most recent call last):" line (Python's
 * standard marker for the start of a new exception). If no such markers
 * are found, the whole text is treated as a single block — this keeps
 * single-error behavior completely unchanged.
 */
export function splitIntoErrorBlocks(text: string): string[] {
  const rawBlocks = text.split(/(?=Traceback \(most recent call last\):)/g);
  return rawBlocks.map((b) => stripTrailingBanner(b).trim()).filter((b) => b.length > 0);
}

/**
 * When splitting purely on "Traceback (most recent call last):", a banner
 * line belonging to the *next* section (e.g. "==== Some Label ====", as
 * printed by test harnesses or CI tools between failures) ends up stuck to
 * the end of the *current* block instead of the start of the next one.
 * This strips any such trailing banner-style line so it doesn't pollute
 * matching for the block it doesn't actually belong to.
 */
function stripTrailingBanner(block: string): string {
  const lines = block.split('\n');
  const bannerIndex = lines.findIndex((line) => /^=+.*=+$/.test(line.trim()));
  if (bannerIndex !== -1) {
    return lines.slice(0, bannerIndex).join('\n');
  }
  return block;
}

/**
 * Scans a block of terminal output (or selected text) against the local
 * rule database and returns the first matching rule, if any.
 */
export function matchError(text: string): MatchResult {
  const trimmed = text.trim();

  for (const rule of errorRules) {
    if (rule.pattern.test(trimmed)) {
      return {
        matched: true,
        rule,
        rawSnippet: trimmed
      };
    }
  }

  return {
    matched: false,
    rawSnippet: trimmed
  };
}

/**
 * Heuristic check for whether a block of text looks like it contains an
 * error at all, used to decide whether to prompt the user in the first
 * place (before we even try to match specific rules).
 */
export function looksLikeError(text: string): boolean {
  const errorSignals = [
    /error/i,
    /exception/i,
    /traceback/i,
    /fatal/i,
    /failed/i,
    /cannot/i,
    /not found/i,
    /denied/i,
    /\bERR!/,
    /segmentation fault/i
  ];

  return errorSignals.some((signal) => signal.test(text));
}

export interface BlockMatch extends MatchResult {
  blockText: string;
}

/**
 * Splits the given text into error blocks and matches each one individually.
 * Returns one BlockMatch per detected block, in the order they appeared.
 */
export function matchAllErrors(text: string): BlockMatch[] {
  const blocks = splitIntoErrorBlocks(text);
  return blocks.map((block) => {
    const result = matchError(block);
    return { ...result, blockText: block };
  });
}
