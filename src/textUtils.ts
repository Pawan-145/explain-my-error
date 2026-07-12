/**
 * Terminal output captured via the Shell Integration API includes raw
 * ANSI escape codes (colors) and VS Code's own OSC 633 sequences (used
 * to mark command boundaries for shell integration). These are meant
 * for terminal rendering, not for display in a text panel, so we strip
 * them before showing anything to the user or matching it against rules.
 */
export function cleanTerminalOutput(text: string): string {
  let cleaned = text;

  // Normalize standard Windows CRLF line endings to plain LF *first*, so
  // they don't get mistaken for mid-line progress-spinner overwrites below.
  // Without this, "some text\r\n" gets treated the same as a spinner
  // redraw and the real content is discarded entirely.
  cleaned = cleaned.replace(/\r\n/g, '\n');

  // OSC sequences: ESC ] ... (terminated by BEL \x07 or ST "ESC \")
  // This covers VS Code's OSC 633 shell-integration markers among others.
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');

  // CSI sequences: ESC [ ... <letter>  (covers color codes, cursor moves, etc.)
  cleaned = cleaned.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

  // Any other stray escape sequences (ESC followed by one character)
  cleaned = cleaned.replace(/\x1b./g, '');

  // CLI spinner animations (npm, ora, and similar libraries) commonly use
  // Unicode Braille Pattern characters as spinner frames, redrawn via
  // cursor-repositioning codes rather than a simple "\r". Real error text
  // never legitimately contains these, so strip them outright.
  cleaned = cleaned.replace(/[\u2800-\u28FF]/g, '');

  // Tools like npm redraw progress spinners by repeatedly sending a lone
  // "\r" (not part of a \r\n pair) to return to the start of the line and
  // overwrite it. Since real CRLF pairs were already normalized away above,
  // any "\r" remaining here is a genuine mid-line overwrite — keep only the
  // final segment after the last one, which reconstructs what was actually
  // last shown.
  cleaned = cleaned
    .split('\n')
    .map((line) => {
      const parts = line.split('\r');
      return parts[parts.length - 1];
    })
    .join('\n');

  // Stray bell characters
  cleaned = cleaned.replace(/\x07/g, '');

  // Trim leftover whitespace per line (e.g. gaps left where spinner
  // characters used to be before they were stripped above).
  cleaned = cleaned
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  return cleaned;
}

export interface CodeLocation {
  file: string;
  line: number;
}

/**
 * Tries to find a "jump to this line" location within a captured error.
 * Handles Python's `File "path", line N` format (takes the LAST occurrence,
 * which is usually the deepest/most relevant frame) and Node/V8 stack
 * traces' `(path:line:col)` format (takes the FIRST real, non-internal
 * frame, which is the closest to where the error actually was thrown).
 */
export function extractLocation(text: string): CodeLocation | null {
  const pythonMatches = [...text.matchAll(/File "([^"]+)", line (\d+)/g)];
  if (pythonMatches.length > 0) {
    const last = pythonMatches[pythonMatches.length - 1];
    // Skip Python's own "<string>" pseudo-file (e.g. from exec()/eval())
    if (last[1] !== '<string>') {
      return { file: last[1], line: parseInt(last[2], 10) };
    }
    if (pythonMatches.length > 1) {
      const prev = pythonMatches[pythonMatches.length - 2];
      return { file: prev[1], line: parseInt(prev[2], 10) };
    }
  }

  const nodeMatches = [
    ...text.matchAll(
      /\(?((?:node:[^\s:()]+)|(?:[a-zA-Z]:\\[^\s:()]+)|(?:\/[^\s:()]+)|(?:\.[\\/][^\s:()]+)):(\d+):(\d+)\)?/g
    )
  ];
  for (const m of nodeMatches) {
    if (!m[1].startsWith('node:')) {
      return { file: m[1], line: parseInt(m[2], 10) };
    }
  }

  return null;
}
