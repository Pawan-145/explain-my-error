import { ErrorRule, errorRules } from './errorDatabase';

export interface MatchResult {
  matched: boolean;
  rule?: ErrorRule;
  rawSnippet: string;
}

/**
 * Derives a rough "language" tag from a rule's id prefix, so we can check
 * "does this rule belong to the language we already know we're dealing
 * with" without needing to manually re-tag every single rule object.
 */
function ruleLanguage(ruleId: string): string {
  const prefixMap: [RegExp, string][] = [
    [/^node-|^npm-|^ts-|^webpack-|^vite-|^react-|^cors-|^eslint-|^jest-/, 'javascript'],
    [/^python-|^pip-|^pytest-/, 'python'],
    [/^java-/, 'java'],
    [/^csharp-|^dotnet-/, 'csharp'],
    [/^go-/, 'go'],
    [/^kotlin-/, 'kotlin'],
    [/^ruby-/, 'ruby'],
    [/^php-/, 'php'],
    [/^swift-/, 'swift'],
    [/^cpp-|^rust-/, 'cpp']
  ];
  for (const [pattern, lang] of prefixMap) {
    if (pattern.test(ruleId)) {
      return lang;
    }
  }
  return 'general'; // git, docker, databases, OS-level — not tied to one language
}

/** Maps a command-line executable name or VS Code languageId to our internal language tags. */
const LANGUAGE_ALIASES: Record<string, string> = {
  node: 'javascript',
  nodejs: 'javascript',
  javascript: 'javascript',
  typescript: 'javascript',
  npm: 'javascript',
  npx: 'javascript',
  python: 'python',
  python3: 'python',
  py: 'python',
  java: 'java',
  javac: 'java',
  csharp: 'csharp',
  dotnet: 'csharp',
  go: 'go',
  kotlin: 'kotlin',
  kotlinc: 'kotlin',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'cpp',
  'g++': 'cpp',
  gcc: 'cpp',
  rust: 'cpp',
  rustc: 'cpp'
};

/**
 * Tries to detect the source language from a terminal command line, e.g.
 * "node test.js" -> javascript, "python test.py" -> python.
 * Returns undefined if nothing recognizable is found.
 */
export function detectLanguageFromCommand(commandLine: string): string | undefined {
  const firstWord = commandLine.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstWord && LANGUAGE_ALIASES[firstWord]) {
    return LANGUAGE_ALIASES[firstWord];
  }

  // Fall back to checking the file extension of whatever's being run,
  // e.g. "g++ file.cpp -o out" or "./run.sh script.py"
  const extMatch = commandLine.match(/\.(js|ts|py|java|cs|go|kt|rb|php|swift|cpp|cc|c|rs)\b/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    const extToLang: Record<string, string> = {
      js: 'javascript',
      ts: 'javascript',
      py: 'python',
      java: 'java',
      cs: 'csharp',
      go: 'go',
      kt: 'kotlin',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      cpp: 'cpp',
      cc: 'cpp',
      c: 'cpp',
      rs: 'cpp'
    };
    return extToLang[ext];
  }

  return undefined;
}

/**
 * Tries to detect the source language from a VS Code languageId (as
 * reported by the currently active editor), e.g. "python" -> python,
 * "javascript" -> javascript.
 */
export function detectLanguageFromEditorLanguageId(languageId: string): string | undefined {
  return LANGUAGE_ALIASES[languageId.toLowerCase()];
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
export function matchError(text: string, languageHint?: string): MatchResult {
  const trimmed = text.trim();

  // Pass 1: if we know the source language, only consider rules for THAT
  // language first — this is what stops e.g. a generic "SyntaxError:"
  // message in a .js file from being wrongly claimed by a Python rule,
  // purely because both languages happen to use similar wording.
  if (languageHint) {
    for (const rule of errorRules) {
      if (ruleLanguage(rule.id) === languageHint && rule.pattern.test(trimmed)) {
        return { matched: true, rule, rawSnippet: trimmed };
      }
    }
  }

  // Pass 2: no language-specific match (or no hint available) — fall back
  // to checking everything, since some errors are genuinely cross-language
  // (git, Docker, database connection errors, etc.) and shouldn't be
  // blocked just because we have a language hint that doesn't apply here.
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
export function matchAllErrors(text: string, languageHint?: string): BlockMatch[] {
  const blocks = splitIntoErrorBlocks(text);
  return blocks.map((block) => {
    const result = matchError(block, languageHint);
    return { ...result, blockText: block };
  });
}
