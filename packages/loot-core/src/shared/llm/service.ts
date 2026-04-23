import { fetch } from '#platform/server/fetch';
import type { LlmConfig, LlmProvider } from '#types/prefs';

import type {
  AccountWithName,
  CategoryWithName,
  LlmChatMessage,
  LlmResponse,
  PayeeWithName,
} from './types';

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

export function buildSystemPrompt(options: {
  today: string;
  accounts: AccountWithName[];
  categories: CategoryWithName[];
  categoryGroups: { id: string; name: string }[];
  payees: PayeeWithName[];
}): string {
  const { today, accounts, categories, categoryGroups, payees } = options;

  const accountsList = accounts.length > 0
    ? accounts.map(a => `- ${a.name}`).join('\n')
    : '(用户还没有创建账户)';

  const categoriesByGroup: Record<string, string[]> = {};
  for (const group of categoryGroups) {
    categoriesByGroup[group.name] = [];
  }
  for (const cat of categories) {
    const group = categoryGroups.find(g => g.id === cat.group);
    if (group) {
      categoriesByGroup[group.name]?.push(cat.name);
    }
  }

  let categoriesList = '';
  for (const [groupName, catNames] of Object.entries(categoriesByGroup)) {
    if (catNames.length > 0) {
      categoriesList += `【${groupName}】: ${catNames.join('、')}\n`;
    }
  }

  const recentPayeesList = payees.length > 0
    ? payees.slice(0, 20).map(p => `- ${p.name}`).join('\n')
    : '(用户还没有收款人记录)';

  return `你是一个专业的个人财务交易解析助手。用户会用自然语言描述一笔收入或支出，你的任务是将其解析为结构化的 JSON 数据。

【重要规则 - 金额提取是最高优先级】
1. 必须准确提取金额，这是最重要的字段
2. 金额格式支持：
   - 纯数字："38" → 38.00 元
   - 带单位："38元"、"¥38"、"$5.99"、"12.5块"
   - 小数："38.5" → 38.50 元，"12.50" → 12.50 元
3. 金额始终以分为单位存储（乘以 100），例如：
   - 38 元 → 3800 分
   - 12.5 元 → 1250 分
   - 5.99 元 → 599 分
4. 如果无法确定金额，返回 null，但要尽力尝试

【日期解析规则】
今天是：${today}
支持的日期格式：
- "今天"、"今日" → ${today}
- "昨天"、"昨日" → 昨天的日期
- "前天" → 前天的日期
- "3天前"、"两天前" → N天前的日期
- "上周一"、"上周六" → 上周的星期X
- 没有日期描述 → 今天

【用户已有数据 - 优先从以下选择】

账户列表（用于支付方式推断）：
${accountsList}

分类列表（按分组）：
${categoriesList}

最近收款人（用于收款人匹配）：
${recentPayeesList}

【解析策略】
1. 优先匹配用户已有数据：
   - 如果用户输入"支付宝"，检查用户账户中是否有"支付宝"账户
   - 如果用户输入"美团"，检查已有收款人，有则匹配，没有则返回名称供用户新建
   - 分类也是一样，优先从用户已有分类中选择

2. 如果没有完全匹配：
   - 收款人：返回提取的名称，前端会让用户选择或新建
   - 分类：从用户分类中选择最相关的，或返回 null 让用户选择
   - 账户：从用户账户中选择最相关的

【输出 JSON 格式】
{
  "amount": number | null,  // 金额，以分为单位，始终为正数
  "amountRaw": string | null,  // 原始金额字符串
  "date": string | null,  // 日期格式 YYYY-MM-DD
  "dateRaw": string | null,  // 原始日期描述
  "payeeName": string | null,  // 收款人名称（商家/个人）
  "categoryName": string | null,  // 分类名称（从用户分类中选择）
  "categoryId": string | null,  // 分类 ID（如果能确定）
  "accountName": string | null,  // 账户名称（从用户账户中选择）
  "accountId": string | null,  // 账户 ID（如果能确定）
  "notes": string | null,  // 备注
  "isExpense": boolean  // true 为支出，false 为收入
}

【收入判断】
以下词汇表示收入（isExpense: false）：
- 工资、奖金、补贴、报销、退款、收入、理财收益、利息、红包
- "收了"、"收到"、"入账"

【支出判断】
- 没有明确的收入词汇时，默认为支出（isExpense: true）

【重要提示】
1. 只返回 JSON，不要有其他文字
2. 如果某个字段不确定，返回 null，但金额必须尽力提取
3. 分类和账户优先从用户已有数据中选择名称，不要自己发明
4. 收款人如果在用户列表中没有，返回提取的名称，前端会处理新建
5. 日期使用 YYYY-MM-DD 格式`;
}

export function buildUserPrompt(input: string): string {
  return `请解析以下交易："${input}"

只返回 JSON 对象，不要其他文字。`;
}
