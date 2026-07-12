import * as vscode from 'vscode';
import { matchError, matchAllErrors, looksLikeError } from './errorMatcher';
import { showExplanation } from './webviewPanel';
import { getSelectedProvider, chooseProvider, getApiKey, promptAndStoreApiKey, explainWithAi, PROVIDERS } from './aiExplainer';
import { cleanTerminalOutput, extractLocation } from './textUtils';

let statusBarItem: vscode.StatusBarItem;
let lastFailedOutput: string | undefined;
const executionOutputs = new WeakMap<vscode.TerminalShellExecution, string>();

export function activate(context: vscode.ExtensionContext) {
  // ---- Status bar ----
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(lightbulb) Explain Error';
  statusBarItem.command = 'explainMyError.explainLastError';
  statusBarItem.tooltip = 'Explain the last terminal error';
  context.subscriptions.push(statusBarItem);

  // ---- Command: explain last captured terminal error ----
  context.subscriptions.push(
    vscode.commands.registerCommand('explainMyError.explainLastError', async () => {
      if (!lastFailedOutput) {
        vscode.window.showInformationMessage(
          'No recent terminal error captured yet. Run a command that fails, or select error text and use "Explain Selected Text".'
        );
        return;
      }
      await runExplainFlow(context, lastFailedOutput);
    })
  );

  // ---- Command: explain manually selected text (works even without shell integration) ----
  context.subscriptions.push(
    vscode.commands.registerCommand('explainMyError.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Select some error text first, then run this command.');
        return;
      }
      const text = editor.document.getText(editor.selection);
      await runExplainFlow(context, text);
    })
  );

  // ---- Command: toggle auto-detect ----
  context.subscriptions.push(
    vscode.commands.registerCommand('explainMyError.toggleAutoDetect', async () => {
      const config = vscode.workspace.getConfiguration('explainMyError');
      const current = config.get<boolean>('autoDetect', true);
      await config.update('autoDetect', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Auto-detect on error is now ${!current ? 'ON' : 'OFF'}.`);
    })
  );

  // ---- Command: configure AI provider ----
  context.subscriptions.push(
    vscode.commands.registerCommand('explainMyError.configureAiProvider', async () => {
      const provider = await chooseProvider(context);
      if (!provider) {
        return;
      }
      await promptAndStoreApiKey(context, provider);
    })
  );

  // ---- Terminal shell integration: detect failed commands ----
  // Uses the stable Terminal Shell Integration API (VS Code 1.93+).
  // Degrades silently if the user's shell doesn't support it.
  //
  // IMPORTANT: the output stream from execution.read() can only be
  // consumed while the command is running (from the "start" event).
  // Reading it after the command has ended returns nothing, so we
  // capture output as it streams in and stash it per-execution, then
  // act on it once we get the matching "end" event with the exit code.
  if (vscode.window.onDidStartTerminalShellExecution) {
    context.subscriptions.push(
      vscode.window.onDidStartTerminalShellExecution((startEvent) => {
        const config = vscode.workspace.getConfiguration('explainMyError');
        if (!config.get<boolean>('autoDetect', true)) {
          return;
        }

        const maxLines = config.get<number>('maxOutputLines', 40);
        let buffer = '';
        executionOutputs.set(startEvent.execution, '');

        (async () => {
          try {
            const stream = startEvent.execution.read();
            for await (const chunk of stream) {
              buffer += chunk;
              executionOutputs.set(startEvent.execution, buffer);
              if (buffer.split('\n').length > maxLines * 4) {
                break; // safety cap while streaming
              }
            }
          } catch {
            // Some shells may not support reading output; leave buffer as-is
          }
        })();
      })
    );
  }

  if (vscode.window.onDidEndTerminalShellExecution) {
    context.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution(async (endEvent) => {
        const config = vscode.workspace.getConfiguration('explainMyError');
        if (!config.get<boolean>('autoDetect', true)) {
          return;
        }

        // exitCode is undefined on some shells; treat non-zero as failure
        if (endEvent.exitCode === undefined || endEvent.exitCode === 0) {
          executionOutputs.delete(endEvent.execution);
          return;
        }

        const maxLines = config.get<number>('maxOutputLines', 40);
        // Give the stream a brief moment to flush its final chunk(s)
        await new Promise((resolve) => setTimeout(resolve, 200));

        const rawOutput =
          executionOutputs.get(endEvent.execution) || endEvent.execution.commandLine.value;
        executionOutputs.delete(endEvent.execution);

        const cleanedOutput = cleanTerminalOutput(rawOutput);
        const trimmedOutput = cleanedOutput.split('\n').filter((l) => l.trim().length > 0).slice(-maxLines).join('\n');

        if (!looksLikeError(trimmedOutput)) {
          return;
        }

        lastFailedOutput = trimmedOutput;
        statusBarItem.show();

        const choice = await vscode.window.showWarningMessage(
          'Explain My Error: this command exited with an error.',
          'Explain it',
          'Dismiss'
        );

        if (choice === 'Explain it') {
          await runExplainFlow(context, trimmedOutput);
        }
      })
    );
  }
}

interface ExtraDisplayFields {
  otherErrors?: import('./webviewPanel').OtherError[];
  fullRawText?: string;
}

function labelForBlock(bm: ReturnType<typeof matchAllErrors>[number], index: number): string {
  const summary = bm.matched && bm.rule ? bm.rule.whatHappened : 'Unrecognized error';
  const trimmed = summary.length > 60 ? summary.slice(0, 60) + '…' : summary;
  return `#${index + 1}: ${trimmed}`;
}

async function runExplainFlow(context: vscode.ExtensionContext, errorText: string) {
  const blockMatches = matchAllErrors(errorText);

  if (blockMatches.length <= 1) {
    await explainOneBlock(context, errorText, {});
    return;
  }

  // Multiple distinct errors detected in this selection/capture.
  const [primary, ...rest] = blockMatches;

  const otherErrors = rest.map((bm, i) => {
    if (bm.matched && bm.rule) {
      const fixSteps = bm.rule.dynamicFix ? bm.rule.dynamicFix(bm.rawSnippet) : bm.rule.fix;
      return {
        label: labelForBlock(bm, i + 1),
        whatHappened: bm.rule.whatHappened,
        why: bm.rule.why,
        fix: fixSteps,
        rawSnippet: bm.rawSnippet,
        matched: true,
        location: extractLocation(bm.blockText) || undefined
      };
    }
    return {
      label: labelForBlock(bm, i + 1),
      whatHappened: "This doesn't match a known error pattern yet.",
      why: 'Select just this error text on its own and run "Explain Selected Text" again to try the AI fallback (if enabled) specifically for this one.',
      fix: [],
      rawSnippet: bm.rawSnippet,
      matched: false,
      location: extractLocation(bm.blockText) || undefined
    };
  });

  await explainOneBlock(context, primary.blockText, { otherErrors, fullRawText: errorText });
}

async function explainOneBlock(context: vscode.ExtensionContext, errorText: string, extra: ExtraDisplayFields) {
  const match = matchError(errorText);
  const codeLocation = extractLocation(errorText) || undefined;

  if (match.matched && match.rule) {
    const fixSteps = match.rule.dynamicFix ? match.rule.dynamicFix(match.rawSnippet) : match.rule.fix;
    showExplanation({
      whatHappened: match.rule.whatHappened,
      why: match.rule.why,
      fix: fixSteps,
      learnMoreUrl: match.rule.learnMoreUrl,
      rawSnippet: match.rawSnippet,
      source: 'rule',
      location: codeLocation,
      ...extra
    });
    return;
  }

  // No local rule matched — offer AI fallback if enabled
  const config = vscode.workspace.getConfiguration('explainMyError');
  const useAi = config.get<boolean>('useAiFallback', false);

  if (!useAi) {
    showExplanation({
      whatHappened: "This doesn't match a known error pattern yet.",
      why: "The local database covers common Node, Python, git, and general OS errors, but this one isn't in it yet.",
      fix: [
        'Enable "explainMyError.useAiFallback" in settings to get an AI-generated explanation for unrecognized errors',
        'Or search the exact error message online — the specific wording is usually unique enough to find an answer'
      ],
      rawSnippet: match.rawSnippet,
      source: 'none',
      location: codeLocation,
      ...extra
    });
    return;
  }

  let apiKey: string | undefined;
  let provider = getSelectedProvider(context);

  if (!provider) {
    provider = await chooseProvider(context);
    if (!provider) {
      return; // user cancelled provider selection
    }
  }

  apiKey = await getApiKey(context, provider);
  if (!apiKey) {
    apiKey = await promptAndStoreApiKey(context, provider);
    if (!apiKey) {
      return; // user cancelled
    }
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Asking AI to explain this error...' },
    async () => {
      try {
        const aiResult = await explainWithAi(
          provider!,
          apiKey!,
          errorText,
          undefined,
          config.get<string>('huggingfaceModel', 'mistralai/Mistral-7B-Instruct-v0.2')
        );
        showExplanation({
          whatHappened: aiResult.whatHappened,
          why: aiResult.why,
          fix: aiResult.fix.length > 0 ? aiResult.fix : ['No structured fix steps were returned — see the explanation above for what the model said.'],
          rawSnippet: match.rawSnippet,
          source: 'ai',
          aiProviderLabel: PROVIDERS[provider!].label,
          location: codeLocation,
          ...extra
        });
      } catch (err: any) {
        const causeMsg = err?.cause?.message || err?.cause?.code;
        const detail = causeMsg ? ` — underlying cause: ${causeMsg}` : '';

        const isGeminiQuotaZero =
          provider === 'gemini' && /RESOURCE_EXHAUSTED/.test(err.message) && /limit["\s:]*0/.test(err.message);

        let hint = '';
        if (isGeminiQuotaZero) {
          hint =
            ' (this looks like an account-level free-tier eligibility issue on Google\'s side, not a bug here — ' +
            'try Hugging Face instead, or check your Google account\'s phone verification status)';
        } else {
          hint =
            ' — double check your API key is correct and active for this provider, or switch providers via ' +
            '"Explain My Error: Configure AI Provider" (Hugging Face is confirmed working for most accounts).';
        }

        vscode.window.showErrorMessage(`Explain My Error: AI request failed — ${err.message}${detail}${hint}`);
      }
    }
  );
}

export function deactivate() {}
