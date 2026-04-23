import { createApp } from '#server/app';
import { get } from '#server/post';
import type { LlmConfig } from '#types/prefs';

import { callLlm } from '#shared/llm/service';
import { parseWithLlm, parseLocally } from '#shared/llm/index';
import type { ParseResult, ParsedTransaction } from '#shared/llm/types';
import * as asyncStorage from '#platform/server/asyncStorage';
import * as monthUtils from '#shared/months';

export type LlmHandlers = {
  'llm/parse': typeof parseTransaction;
  'llm/test': typeof testLlmConnection;
  'llm/get-config': typeof getLlmConfig;
  'llm/set-config': typeof setLlmConfig;
};

export const app = createApp<LlmHandlers>();

app.method('llm/parse', parseTransaction);
app.method('llm/test', testLlmConnection);
app.method('llm/get-config', getLlmConfig);
app.method('llm/set-config', setLlmConfig);

async function getLlmConfig(): Promise<LlmConfig | null> {
  const configJson = await asyncStorage.getItem('llmConfig');
  if (!configJson) {
    return null;
  }

  try {
    return JSON.parse(configJson) as LlmConfig;
  } catch {
    return null;
  }
}

async function setLlmConfig(config: LlmConfig): Promise<{ success: boolean }> {
  await asyncStorage.setItem('llmConfig', JSON.stringify(config));
  return { success: true };
}

async function parseTransaction({
  input,
  useLocalFallback = true,
  dateFormat,
}: {
  input: string;
  useLocalFallback?: boolean;
  dateFormat?: string;
}): Promise<{
  success: boolean;
  transaction?: ParsedTransaction;
  error?: string;
  source: 'llm' | 'local' | 'none';
}> {
  if (!input || input.trim().length === 0) {
    return {
      success: false,
      error: 'Input is empty',
      source: 'none',
    };
  }

  const trimmedInput = input.trim();
  const config = await getLlmConfig();

  if (config?.enabled && config.apiKey) {
    const result: ParseResult = await parseWithLlm(config, trimmedInput);

    if (result.success && result.transaction) {
      return {
        success: true,
        transaction: result.transaction,
        source: 'llm',
      };
    }

    if (!useLocalFallback) {
      return {
        success: false,
        error: result.error,
        source: 'llm',
      };
    }
  }

  const format = dateFormat || 'yyyy-MM-dd';
  const localResult = parseLocally(trimmedInput, format);

  if (localResult.amount !== null) {
    return {
      success: true,
      transaction: localResult,
      source: 'local',
    };
  }

  return {
    success: false,
    error: 'Could not extract amount from input',
    source: 'none',
  };
}

async function testLlmConnection({
  config,
}: {
  config: LlmConfig;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!config.apiKey) {
    return {
      success: false,
      error: 'API key is required',
    };
  }

  try {
    const result = await callLlm(
      config,
      [
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: 'Say "Hello World" in JSON format: {"message": "..."}' },
      ],
      {
        temperature: 0.1,
        maxTokens: 50,
        responseFormat: { type: 'json_object' },
      },
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Connection failed',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
