import { fetch } from '#platform/server/fetch';
import type { LlmConfig, LlmProvider } from '#types/prefs';

import type { LlmChatMessage, LlmResponse } from './types';

function getApiBaseUrl(provider: LlmProvider, customBase: string | undefined): string {
  if (customBase) {
    return customBase.endsWith('/') ? customBase.slice(0, -1) : customBase;
  }

  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'openai-compatible':
    default:
      return customBase || 'https://api.openai.com/v1';
  }
}

function getDefaultModel(provider: LlmProvider): string {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    default:
      return 'gpt-4o-mini';
  }
}

export async function callLlm(
  config: LlmConfig,
  messages: LlmChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  },
): Promise<LlmResponse> {
  const { provider, apiKey, apiBase, model } = config;

  if (!apiKey) {
    return {
      success: false,
      error: 'API key is not configured',
    };
  }

  const baseUrl = getApiBaseUrl(provider, apiBase);
  const useModel = model || getDefaultModel(provider);
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 1000;

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(
        baseUrl,
        apiKey,
        useModel,
        messages,
        temperature,
        maxTokens,
      );
    }

    return await callOpenAiCompatible(
      baseUrl,
      apiKey,
      useModel,
      messages,
      temperature,
      maxTokens,
      options?.responseFormat,
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  temperature: number,
  maxTokens: number,
  responseFormat?: { type: 'json_object' },
): Promise<LlmResponse> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat && { response_format: responseFormat }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API request failed with status ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      // ignore parse error
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();

  return {
    success: true,
    content: data.choices?.[0]?.message?.content,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LlmChatMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: userMessages,
      system: systemMessage?.content,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API request failed with status ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      // ignore parse error
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();

  return {
    success: true,
    content: data.content?.[0]?.text,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

export function buildSystemPrompt(): string {
  return `You are a financial transaction parser. Your job is to parse natural language descriptions of expenses and income into structured data.

Input: A natural language sentence like "咖啡 38" or "昨天打车 26" or "工资 5000 收入"

Output: A JSON object with the following fields:
{
  "amount": number (required - the monetary amount, always positive),
  "amountRaw": string (the original amount string from input),
  "date": string | null (ISO date format YYYY-MM-DD, use today if not specified),
  "dateRaw": string | null (the original date description if any),
  "payeeName": string | null (the merchant/person name),
  "categoryName": string | null (suggested category name based on context),
  "categoryCandidates": string[] (3-5 suggested category names),
  "accountName": string | null (suggested account name based on payment method hints),
  "accountCandidates": string[] (2-3 suggested account names),
  "notes": string | null (any additional notes),
  "isExpense": boolean (true for expenses, false for income)
}

Important rules:
1. AMOUNT MUST be extracted correctly. This is the highest priority.
   - Look for numbers in the input
   - Examples: "咖啡 38" → amount: 38, "午餐 12.5" → amount: 12.5, "$5.99" → amount: 5.99

2. DATE parsing:
   - "昨天" → yesterday
   - "前天" → day before yesterday
   - "X天前" → X days ago
   - "上周X" → last week X
   - Use local timezone
   - If no date specified, use today

3. PAYMENT METHOD inference for accountName:
   - "刷卡", "信用卡" → 信用卡 (Credit Card)
   - "支付宝", "微信", "微信支付" → 支付宝/微信
   - "现金" → 现金 (Cash)
   - "银行卡", "借记卡" → 储蓄卡 (Debit Card)

4. CATEGORY suggestions:
   - 咖啡, 奶茶 → 食品, 餐饮
   - 打车, 地铁, 公交 → 交通
   - 工资, 奖金 → 收入
   - 购物, 买衣服 → 购物
   - 房租, 水电 → 住房

5. Always return valid JSON. If you're unsure about a field, return null for that field but DO return the amount if you can find it.

6. If the input mentions "收入", "工资", "奖金", "退款", "报销", mark isExpense as false.

7. For categoryCandidates and accountCandidates, provide relevant suggestions in Chinese.`;
}

export function buildUserPrompt(input: string): string {
  return `Parse this transaction: "${input}"

Return ONLY a JSON object. No extra text.`;
}
