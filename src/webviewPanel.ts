import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined;

export interface CodeLocation {
  file: string;
  line: number;
}

export interface OtherError {
  label: string;
  whatHappened: string;
  why: string;
  fix: string[];
  rawSnippet: string;
  matched: boolean;
  location?: CodeLocation;
}

export interface DisplayContent {
  whatHappened: string;
  why: string;
  fix: string[];
  learnMoreUrl?: string;
  rawSnippet: string;
  source: 'rule' | 'ai' | 'none';
  /** Which AI provider answered, shown in the badge when source is 'ai'. */
  aiProviderLabel?: string;
  /** Other distinct errors detected alongside the primary one, if any. */
  otherErrors?: OtherError[];
  /** The full original captured text, used by the "copy all" button. */
  fullRawText?: string;
  /** File + line this error points to, if one could be found. */
  location?: CodeLocation;
}

export function showExplanation(content: DisplayContent) {
  if (currentPanel) {
    currentPanel.dispose();
  }

  currentPanel = vscode.window.createWebviewPanel(
    'explainMyError',
    'Explain My Error',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  currentPanel.webview.html = renderHtml(content);

  currentPanel.webview.onDidReceiveMessage(async (message) => {
    if (message?.command === 'gotoLocation' && message.file && message.line) {
      await openFileAtLine(message.file, message.line);
    }
  });

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

async function openFileAtLine(file: string, line: number) {
  try {
    const resolvedFile = await resolveRealSourceFile(file);
    const uri = vscode.Uri.file(resolvedFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const zeroBasedLine = Math.max(0, line - 1);
    const range = doc.lineAt(Math.min(zeroBasedLine, doc.lineCount - 1)).range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    if (resolvedFile !== file) {
      vscode.window.showInformationMessage(
        'Explain My Error: this ran via a "Run Code" button, which uses a temporary copy — opened your actual file instead (same line number).'
      );
    }
  } catch (err: any) {
    vscode.window.showWarningMessage(`Explain My Error: couldn't open ${file} — ${err.message}`);
  }
}

/**
 * The "Code Runner" extension executes files by copying their content into
 * a temp file named "tempCodeRunnerFile.<ext>" in the same folder, then
 * running that copy. Since it's a verbatim copy, line numbers in the
 * resulting traceback still correctly correspond to the real, currently
 * open file — so rather than jumping to that confusing temp file, try to
 * find and open the real source file instead.
 */
export async function resolveRealSourceFile(file: string): Promise<string> {
  const baseName = file.split(/[\\/]/).pop() || '';
  if (!baseName.toLowerCase().startsWith('tempcoderunnerfile')) {
    return file;
  }

  const ext = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.')) : '';
  const tempDir = file.slice(0, file.length - baseName.length);

  // Prefer whichever matching-extension file is currently open and active —
  // that's almost certainly the file the user actually ran.
  const candidates = vscode.workspace.textDocuments.filter(
    (doc) =>
      !doc.isUntitled &&
      doc.fileName.toLowerCase().endsWith(ext.toLowerCase()) &&
      !doc.fileName.toLowerCase().includes('tempcoderunnerfile')
  );

  // Prefer one in the same folder as the temp file, if there's a choice.
  const sameFolder = candidates.find((doc) => doc.fileName.startsWith(tempDir));
  if (sameFolder) {
    return sameFolder.fileName;
  }
  if (candidates.length > 0) {
    return candidates[0].fileName;
  }

  // No better candidate found — fall back to the temp file itself.
  return file;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safely embeds a string as a JS string literal inside an inline <script>. */
function toJsStringLiteral(text: string): string {
  return JSON.stringify(text).replace(/<\/script/gi, '<\\/script');
}

function renderCard(
  whatHappened: string,
  why: string,
  fix: string[],
  rawSnippet: string,
  learnMoreUrl: string | undefined,
  copyButtonId: string,
  location: CodeLocation | undefined,
  gotoButtonId: string
): string {
  const fixSteps = fix.map((step) => `<li>${escapeHtml(step)}</li>`).join('\n');
  const learnMore = learnMoreUrl
    ? `<p class="learn-more">📖 <a href="${learnMoreUrl}">Learn more</a></p>`
    : '';

  const gotoButton = location
    ? `<button class="copy-btn goto-btn" id="${gotoButtonId}">📍 Go to ${escapeHtml(shortenPath(location.file))}:${location.line}</button>`
    : '';

  return `
    ${gotoButton}
    <h2>🔴 What happened</h2>
    <div class="section">${escapeHtml(whatHappened)}</div>

    <h2>🤔 Why this happens</h2>
    <div class="section">${escapeHtml(why)}</div>

    <h2>✅ How to fix it</h2>
    <ol>
      ${fixSteps || '<li>No specific steps available.</li>'}
    </ol>

    ${learnMore}

    <div class="raw-header">
      <h2 style="margin-bottom:0">📄 Original error</h2>
      <button class="copy-btn" id="${copyButtonId}">📋 Copy</button>
    </div>
    <pre>${escapeHtml(rawSnippet)}</pre>
  `;
}

function shortenPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length > 2 ? '…' + parts.slice(-2).join('/') : path;
}

function renderHtml(content: DisplayContent): string {
  const sourceBadge =
    content.source === 'ai'
      ? `<span class="badge badge-ai">AI explanation${content.aiProviderLabel ? ` (${escapeHtml(content.aiProviderLabel)})` : ''}</span>`
      : content.source === 'rule'
      ? '<span class="badge badge-rule">Instant local match</span>'
      : '';

  const hasMultiple = content.otherErrors && content.otherErrors.length > 0;

  const multiErrorBanner = hasMultiple
    ? `<div class="multi-banner">
        ⚠️ Found <strong>${content.otherErrors!.length + 1} separate errors</strong> in this output.
        Showing the <strong>first one below</strong> — fixing this one is usually the most useful
        next step, since later errors sometimes clear up once the first is resolved.
      </div>`
    : '';

  const copyAllButton = content.fullRawText
    ? `<button class="copy-btn copy-all-btn" id="copyAllBtn">📋 Copy all errors (for pasting into any AI/LLM)</button>`
    : '';

  const primaryCard = renderCard(
    content.whatHappened,
    content.why,
    content.fix,
    content.rawSnippet,
    content.learnMoreUrl,
    'copyPrimaryBtn',
    content.location,
    'gotoPrimaryBtn'
  );

  const otherErrorsSection = hasMultiple
    ? `
      <h2 style="margin-top:32px">🗂️ Other errors detected (${content.otherErrors!.length})</h2>
      ${content.otherErrors!
        .map((err, i) => {
          const statusBadge = err.matched
            ? '<span class="badge badge-rule" style="margin-left:8px">matched</span>'
            : '<span class="badge badge-none" style="margin-left:8px">unrecognized</span>';
          return `
          <details class="other-error">
            <summary>${escapeHtml(err.label)} ${statusBadge}</summary>
            <div class="other-error-body">
              ${renderCard(
                err.whatHappened,
                err.why,
                err.fix,
                err.rawSnippet,
                undefined,
                `copyOtherBtn${i}`,
                err.location,
                `gotoOtherBtn${i}`
              )}
            </div>
          </details>
        `;
        })
        .join('\n')}
    `
    : '';

  const scriptData = [
    { id: 'copyPrimaryBtn', text: content.rawSnippet },
    ...(content.fullRawText ? [{ id: 'copyAllBtn', text: content.fullRawText }] : []),
    ...(content.otherErrors || []).map((err, i) => ({ id: `copyOtherBtn${i}`, text: err.rawSnippet }))
  ];

  const gotoData = [
    ...(content.location ? [{ id: 'gotoPrimaryBtn', location: content.location }] : []),
    ...(content.otherErrors || [])
      .map((err, i) => (err.location ? { id: `gotoOtherBtn${i}`, location: err.location } : null))
      .filter((x): x is { id: string; location: CodeLocation } => x !== null)
  ];

  const copyScript = scriptData
    .map(
      (item) => `
      (function() {
        const btn = document.getElementById(${toJsStringLiteral(item.id)});
        if (!btn) return;
        const text = ${toJsStringLiteral(item.text)};
        btn.addEventListener('click', function() {
          navigator.clipboard.writeText(text).then(function() {
            const original = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(function() { btn.textContent = original; }, 1500);
          });
        });
      })();
    `
    )
    .join('\n');

  const gotoScript = gotoData
    .map(
      (item) => `
      (function() {
        const btn = document.getElementById(${toJsStringLiteral(item.id)});
        if (!btn) return;
        btn.addEventListener('click', function() {
          vscode.postMessage({
            command: 'gotoLocation',
            file: ${toJsStringLiteral(item.location.file)},
            line: ${item.location.line}
          });
        });
      })();
    `
    )
    .join('\n');

  const vscodeApiInit = gotoData.length > 0 ? 'const vscode = acquireVsCodeApi();' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 24px;
    line-height: 1.5;
    max-width: 760px;
  }
  h2 {
    margin-top: 0;
  }
  .section {
    margin-bottom: 20px;
  }
  .section-title {
    font-weight: 600;
    font-size: 1.05em;
    margin-bottom: 6px;
  }
  .badge {
    display: inline-block;
    font-size: 0.75em;
    padding: 2px 8px;
    border-radius: 10px;
    margin-bottom: 12px;
  }
  .badge-rule {
    background: var(--vscode-testing-iconPassed, #4caf50);
    color: white;
  }
  .badge-ai {
    background: var(--vscode-charts-purple, #9575cd);
    color: white;
  }
  .badge-none {
    background: var(--vscode-charts-orange, #e08a3c);
    color: white;
  }
  ol {
    padding-left: 20px;
  }
  li {
    margin-bottom: 8px;
  }
  pre {
    background: var(--vscode-textCodeBlock-background, #00000022);
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.85em;
    white-space: pre-wrap;
    word-break: break-word;
  }
  a {
    color: var(--vscode-textLink-foreground);
  }
  .learn-more {
    margin-top: 20px;
  }
  .multi-banner {
    background: var(--vscode-inputValidation-warningBackground, #5a4a1a);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 20px;
  }
  .copy-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: inherit;
  }
  .copy-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .copy-all-btn {
    display: block;
    margin-bottom: 20px;
    padding: 8px 16px;
  }
  .raw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 20px;
  }
  .other-error {
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 10px;
  }
  .other-error summary {
    cursor: pointer;
    font-weight: 600;
  }
  .other-error-body {
    margin-top: 14px;
  }
  .goto-btn {
    display: block;
    margin-bottom: 16px;
    background: var(--vscode-textLink-foreground);
  }
</style>
</head>
<body>
  ${sourceBadge}
  ${copyAllButton}
  ${multiErrorBanner}
  ${primaryCard}
  ${otherErrorsSection}

  <script>
    ${vscodeApiInit}
    ${copyScript}
    ${gotoScript}
  </script>
</body>
</html>`;
}
