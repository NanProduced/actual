import { createApp } from '#server/app';
import { get } from '#server/post';
import type { LlmConfig } from '#types/prefs';

import { callLlm } from '#shared/llm/service';
import { parseWithLlm, parseLocally } from '#shared/llm/index';
import type { ParseResult, ParsedTransaction } from '#shared/llm/types';
import * as asyncStorage from '#platform/server/asyncStorage';
import * as monthUtils from '#shared/months';
import type {
  AccountEntity,
  CategoryEntity,
  CategoryGroupEntity,
  PayeeEntity,
} from '#types/models';
import * as db from '#server/db';

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
  accounts,
  categories,
  categoryGroups,
  payees,
}: {
  input: string;
  useLocalFallback?: boolean;
  dateFormat?: string;
  accounts?: Array<Pick<AccountEntity, 'id' | 'name'>>;
  categories?: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>>;
  categoryGroups?: Array<Pick<CategoryGroupEntity, 'id' | 'name'>>;
  payees?: Array<Pick<PayeeEntity, 'id' | 'name'>>;
}): Promise<{
  success: boolean;
  transaction?: ParsedTransaction;
  error?: string;
  source: 'llm' | 'local' | 'none';
}> {
  if (!input || input.trim().length === 0) {
    return {
      success: false,
      error: '输入为空',
      source: 'none',
    };
  }

  const trimmedInput = input.trim();
  const config = await getLlmConfig();

  let contextAccounts: Array<Pick<AccountEntity, 'id' | 'name'>> = accounts || [];
  let contextCategories: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>> = categories || [];
  let contextCategoryGroups: Array<Pick<CategoryGroupEntity, 'id' | 'name'>> = categoryGroups || [];
  let contextPayees: Array<Pick<PayeeEntity, 'id' | 'name'>> = payees || [];

  if (contextAccounts.length === 0) {
    const dbAccounts = await db.all<db.DbAccount>(
      'SELECT id, name FROM accounts WHERE tombstone = 0',
    );
    contextAccounts = dbAccounts.map(a => ({ id: a.id, name: a.name }));
  }

  if (contextCategories.length === 0 || contextCategoryGroups.length === 0) {
    const dbCategories = await db.all<db.DbCategory>(
      'SELECT id, name, cat_group as "group" FROM categories WHERE tombstone = 0 AND hidden = 0',
    );
    const dbGroups = await db.all<db.DbCategoryGroup>(
      'SELECT id, name FROM category_groups WHERE tombstone = 0',
    );
    contextCategories = dbCategories.map(c => ({ id: c.id, name: c.name, group: c.cat_group }));
    contextCategoryGroups = dbGroups.map(g => ({ id: g.id, name: g.name }));
  }

  if (contextPayees.length === 0) {
    const dbPayees = await db.all<db.DbPayee>(
      'SELECT id, name FROM payees WHERE tombstone = 0 ORDER BY name LIMIT 50',
    );
    contextPayees = dbPayees.map(p => ({ id: p.id, name: p.name }));
  }

  if (config?.enabled && config.apiKey) {
    const result: ParseResult = await parseWithLlm(config, trimmedInput, {
      accounts: contextAccounts,
      categories: contextCategories,
      categoryGroups: contextCategoryGroups,
      payees: contextPayees,
    });

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
    error: '无法从输入中提取金额',
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
      error: '需要 API Key',
    };
  }

  try {
    const result = await callLlm(
      config,
      [
        { role: 'system', content: '你是一个测试助手。' },
        { role: 'user', content: '用 JSON 格式回复: {"message": "你好"}' },
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
        error: result.error || '连接失败',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}
