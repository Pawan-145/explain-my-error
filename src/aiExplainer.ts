import * as vscode from 'vscode';

export type AiProvider = 'gemini' | 'huggingface' | 'anthropic' | 'openai';

interface ProviderInfo {
  label: string;
  secretKey: string;
  keyUrl: string;
  freeNote: string;
  setupSteps: string[];
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  gemini: {
    label: 'Google Gemini',
    secretKey: 'explainMyError.geminiApiKey',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeNote: 'Has a generous free tier — good default if you don\'t want to pay for anything.',
    setupSteps: [
      'Sign in with any Google account at the page that opens',
      'Click "Create API key"',
      'Choose "Create API key in new project" (avoids conflicts with any existing project)',
      'Copy the key shown (starts with "AIza...") and paste it below'
    ]
  },
  huggingface: {
    label: 'Hugging Face (free, open-source model)',
    secretKey: 'explainMyError.huggingfaceApiKey',
    keyUrl: 'https://huggingface.co/settings/tokens',
    freeNote: 'Free, lowest-friction option — no billing setup at all, just a free account. Uses a smaller open-source model, so explanations are usually helpful but sometimes rougher than the paid options.',
    setupSteps: [
      'Create a free account at huggingface.co if you don\'t have one',
      'On the page that opens, click "New token"',
      'Choose the "Fine-grained" token type',
      'Check ONLY the box "Make calls to Inference Providers" under the Inference section',
      'Click "Create token" and copy it (starts with "hf_...")',
      'IMPORTANT extra step: separately visit huggingface.co/settings/inference-providers and enable at least one provider (e.g. Together AI, Groq, Novita) — the token alone isn\'t enough',
      'Paste the token below once you\'ve done both steps'
    ]
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    secretKey: 'explainMyError.anthropicApiKey',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    freeNote: 'Paid, usage-based pricing (no free tier).',
    setupSteps: [
      'Sign in or create an account at the page that opens',
      'Click "Create Key"',
      'Copy the key shown (starts with "sk-ant-...") and paste it below',
      'Note: you\'ll need to add billing details on Anthropic\'s console before the key will actually work'
    ]
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    secretKey: 'explainMyError.openaiApiKey',
    keyUrl: 'https://platform.openai.com/api-keys',
    freeNote: 'Paid, usage-based pricing (small free trial credit for new accounts only).',
    setupSteps: [
      'Sign in or create an account at the page that opens',
      'Click "Create new secret key"',
      'Copy the key shown (starts with "sk-...") and paste it below',
      'Note: existing accounts usually need billing details added before the key will work'
    ]
  }
};

const PROVIDER_PREFERENCE_KEY = 'explainMyError.selectedAiProvider';

export interface AiExplanation {
  whatHappened: string;
  why: string;
  fix: string[];
}

const SYSTEM_PROMPT = `You are explaining a terminal error to a developer who may be a beginner.
Respond ONLY with valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "whatHappened": "one plain-English sentence, no jargon",
  "why": "1-2 sentences in plain language explaining the root cause",
  "fix": ["concrete runnable step 1", "concrete runnable step 2"]
}
Use active voice, second person ("you"). Avoid unexplained jargon. Give concrete, runnable commands where relevant, not vague advice. Keep it concise.`;

// ---------------------------------------------------------------------------
// Provider selection & key storage
// ---------------------------------------------------------------------------

export function getSelectedProvider(context: vscode.ExtensionContext): AiProvider | undefined {
  return context.globalState.get<AiProvider>(PROVIDER_PREFERENCE_KEY);
}

export async function chooseProvider(context: vscode.ExtensionContext): Promise<AiProvider | undefined> {
  const picks = (Object.keys(PROVIDERS) as AiProvider[]).map((key) => ({
    label: PROVIDERS[key].label,
    description: PROVIDERS[key].freeNote,
    provider: key
  }));

  const choice = await vscode.window.showQuickPick(picks, {
    placeHolder: 'Choose an AI provider for explaining unrecognized errors',
    ignoreFocusOut: true
  });

  if (!choice) {
    return undefined;
  }

  await context.globalState.update(PROVIDER_PREFERENCE_KEY, choice.provider);
  return choice.provider;
}

export async function getApiKey(context: vscode.ExtensionContext, provider: AiProvider): Promise<string | undefined> {
  return context.secrets.get(PROVIDERS[provider].secretKey);
}

export async function promptAndStoreApiKey(
  context: vscode.ExtensionContext,
  provider: AiProvider
): Promise<string | undefined> {
  const info = PROVIDERS[provider];

  const stepsText = info.setupSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const openKeyPage = 'Open key page & show me';
  const alreadyHaveOne = 'I already have a key';

  const choice = await vscode.window.showInformationMessage(
    `Setting up ${info.label}`,
    {
      modal: true,
      detail: `${info.freeNote}\n\nSteps:\n${stepsText}`
    },
    openKeyPage,
    alreadyHaveOne
  );

  if (choice === openKeyPage) {
    vscode.env.openExternal(vscode.Uri.parse(info.keyUrl));
  } else if (choice !== alreadyHaveOne) {
    return undefined; // user dismissed/cancelled the modal
  }

  const key = await vscode.window.showInputBox({
    prompt: `Paste your ${info.label} API key here (stored securely, never shown in plain text settings)`,
    password: true,
    ignoreFocusOut: true
  });

  if (key) {
    await context.secrets.store(info.secretKey, key);
    vscode.window.showInformationMessage('API key saved securely.');
  }

  return key;
}

export async function clearStoredKey(context: vscode.ExtensionContext, provider: AiProvider): Promise<void> {
  await context.secrets.delete(PROVIDERS[provider].secretKey);
}

// ---------------------------------------------------------------------------
// Shared JSON extraction (all providers are prompted to return the same shape)
// ---------------------------------------------------------------------------

function parseExplanation(text: string): AiExplanation {
  // Models (especially smaller free ones) sometimes wrap JSON in prose or
  // markdown fences, or drift from the exact shape. Try to find the JSON
  // object within the text rather than assuming the whole string is clean.
  const cleaned = text.replace(/```json|```/g, '').trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed.whatHappened === 'string') {
      return {
        whatHappened: parsed.whatHappened,
        why: parsed.why || '',
        fix: Array.isArray(parsed.fix) ? parsed.fix : parsed.fix ? [String(parsed.fix)] : []
      };
    }
  } catch {
    // fall through to the plain-text fallback below
  }

  // Graceful fallback: the model didn't return valid structured JSON (common
  // with smaller free models). Rather than failing outright, surface its
  // raw response as-is so the user still gets *something* useful.
  return {
    whatHappened: 'AI response (unstructured — the model didn\'t return the expected format)',
    why: cleaned,
    fix: []
  };
}

function buildUserContent(errorText: string, codeContext?: string): string {
  return codeContext
    ? `Error output:\n${errorText}\n\nRelevant code context:\n${codeContext}`
    : `Error output:\n${errorText}`;
}

// ---------------------------------------------------------------------------
// Per-provider implementations
// ---------------------------------------------------------------------------

async function explainWithAnthropic(apiKey: string, errorText: string, codeContext?: string): Promise<AiExplanation> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserContent(errorText, codeContext) }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${await response.text().catch(() => '')}`);
  }

  const data: any = await response.json();
  const textBlock = (data.content || []).find((b: any) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Anthropic response did not include a text block.');
  }
  return parseExplanation(textBlock.text);
}

async function explainWithGemini(apiKey: string, errorText: string, codeContext?: string): Promise<AiExplanation> {
  // NOTE: Google moved from the old generateContent endpoint (contents/parts
  // structure, ?key= query param) to a new "Interactions API" as of mid-2026,
  // confirmed via their live REST docs. Key goes in a header now, and the
  // request/response shape is flatter. Using gemini-3.1-flash-lite (their
  // cost-optimized tier) rather than gemini-3.5-flash (frontier/expensive)
  // since this task doesn't need frontier-level reasoning.
  const model = 'gemini-3.1-flash-lite';
  const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model,
      input: `${SYSTEM_PROMPT}\n\n${buildUserContent(errorText, codeContext)}`
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text().catch(() => '')}`);
  }

  const data: any = await response.json();

  // The new API returns a "steps" array rather than a flat text field.
  // Find the model's actual output step and extract its text content.
  const outputStep = (data.steps || []).find((step: any) => step.type === 'model_output');
  const textContent = outputStep?.content?.find((c: any) => c.type === 'text');
  const text = textContent?.text || data.output_text;

  if (!text) {
    throw new Error('Gemini response did not include any text.');
  }

  return parseExplanation(text);
}

async function explainWithOpenAi(apiKey: string, errorText: string, codeContext?: string): Promise<AiExplanation> {
  // NOTE: OpenAI's API surface changes over time. As of mid-2026, their
  // quickstart docs show the "Responses API" (/v1/responses, "input" field,
  // "output_text" in the response) as current. GPT-5.6 comes in three cost
  // tiers (Sol/Terra/Luna); the bare "gpt-5.6" alias resolves to Sol, the
  // expensive frontier tier — overkill for a short error explanation, so we
  // use "gpt-5.6-luna" explicitly, their cost-optimized tier, instead.
  // If OpenAI changes this again, check platform.openai.com/docs/models.
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      input: `${SYSTEM_PROMPT}\n\n${buildUserContent(errorText, codeContext)}`
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${await response.text().catch(() => '')}`);
  }

  const data: any = await response.json();

  // Confirmed via OpenAI's own CLI example (--transform
  // 'output.#(type=="message").content.0.text'): the raw response has an
  // "output" array, not a flat "output_text" field — find the "message"
  // entry and read its first content item's text.
  const messageOutput = (data.output || []).find((item: any) => item.type === 'message');
  const text = messageOutput?.content?.[0]?.text;

  if (!text) {
    throw new Error('OpenAI response did not include any text.');
  }

  return parseExplanation(text);
}

async function explainWithHuggingFace(apiKey: string, errorText: string, codeContext?: string, modelOverride?: string): Promise<AiExplanation> {
  // Hugging Face routes through partner inference providers (Together,
  // Novita, Fireworks, etc.) — the account needs at least one enabled at
  // https://huggingface.co/settings/inference-providers, and which models
  // are available depends on which provider(s) you've enabled. That's why
  // this is configurable rather than hardcoded to one model.
  const url = 'https://router.huggingface.co/v1/chat/completions';
  const model = modelOverride || 'mistralai/Mistral-7B-Instruct-v0.2';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(errorText, codeContext) }
      ],
      temperature: 0.3,
      max_tokens: 400
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 503) {
      throw new Error(
        'Hugging Face model is still loading (free tier models "cold start" sometimes) — wait about 20 seconds and try again.'
      );
    }
    if (response.status === 402 || /insufficient|exceeded.*credit|payment required/i.test(body)) {
      throw new Error(
        'Hugging Face says your account\'s included free credit for this billing period is used up. ' +
        'Check your balance at https://huggingface.co/settings/billing — it resets monthly, or you can ' +
        'add payment details there to continue beyond the free amount.'
      );
    }
    if (response.status === 400 && body.includes('model_not_supported')) {
      throw new Error(
        `Hugging Face model "${model}" isn't available on any inference provider enabled for your account. ` +
        `Enable one at https://huggingface.co/settings/inference-providers, check which models it supports, ` +
        `then set "explainMyError.huggingfaceModel" in settings to match.`
      );
    }
    throw new Error(`Hugging Face request failed (${response.status}): ${body}`);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('Hugging Face response did not include any generated text.');
  }

  return parseExplanation(text);
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export async function explainWithAi(
  provider: AiProvider,
  apiKey: string,
  errorText: string,
  codeContext?: string,
  huggingFaceModel?: string
): Promise<AiExplanation> {
  switch (provider) {
    case 'gemini':
      return explainWithGemini(apiKey, errorText, codeContext);
    case 'huggingface':
      return explainWithHuggingFace(apiKey, errorText, codeContext, huggingFaceModel);
    case 'anthropic':
      return explainWithAnthropic(apiKey, errorText, codeContext);
    case 'openai':
      return explainWithOpenAi(apiKey, errorText, codeContext);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
