import * as monthUtils from '#shared/months';
import type { LlmConfig } from '#types/prefs';

import {
  buildSystemPrompt,
  buildUserPrompt,
  callLlm,
} from './service';
import type {
  FinalizedTransaction,
  ParseResult,
  ParsedTransaction,
  TransactionContext,
} from './types';
import {
  extractPayeeName,
  inferAccountFromPaymentMethod,
  inferCategoryFromKeywords,
  isIncomeInput,
  parseAmount,
  parseDateInput,
} from './parser';
import type { IntegerAmount } from '#shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '#types/models';

export async function parseWithLlm(
  config: LlmConfig,
  input: string,
): Promise<ParseResult> {
  if (!config.apiKey) {
    return {
      success: false,
      error: 'LLM API key not configured',
    };
  }

  try {
    const response = await callLlm(
      config,
      [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      {
        temperature: 0.2,
        maxTokens: 800,
        responseFormat: { type: 'json_object' },
      },
    );

    if (!response.success || !response.content) {
      return {
        success: false,
        error: response.error || 'LLM returned empty response',
      };
    }

    const parsed = JSON.parse(response.content) as ParsedTransaction;

    if (parsed.amount === null || parsed.amount === undefined) {
      const fallbackAmount = parseAmount(input);
      if (fallbackAmount.amount !== null) {
        parsed.amount = fallbackAmount.amount;
        parsed.amountRaw = fallbackAmount.raw;
        return {
          success: true,
          transaction: parsed,
          partiallyParsed: true,
        };
      }
      return {
        success: false,
        error: 'Could not extract amount from input',
      };
    }

    return {
      success: true,
      transaction: parsed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Parse error',
    };
  }
}

export function parseLocally(input: string, dateFormat: string): ParsedTransaction {
  const { amount, raw: amountRaw } = parseAmount(input);
  const payeeName = extractPayeeName(input, amountRaw);
  const categoryName = inferCategoryFromKeywords(input);
  const accountName = inferAccountFromPaymentMethod(input);
  const isExpense = !isIncomeInput(input);

  const date = parseDateInput(input, dateFormat) || monthUtils.currentDay();

  let categoryCandidates: string[] = [];
  if (categoryName) {
    categoryCandidates = [categoryName];
  }

  let accountCandidates: string[] = [];
  if (accountName) {
    accountCandidates = [accountName];
  }

  return {
    amount,
    amountRaw,
    date,
    dateRaw: null,
    payeeName,
    categoryName,
    categoryCandidates,
    accountName,
    accountCandidates,
    notes: null,
    isExpense,
  };
}

export function findBestAccountMatch(
  accountName: string | null | undefined,
  accounts: Array<Pick<AccountEntity, 'id' | 'name'>>,
): AccountEntity['id'] | null {
  if (!accountName || accounts.length === 0) {
    return null;
  }

  const lowerName = accountName.toLowerCase();

  for (const account of accounts) {
    if (account.name.toLowerCase() === lowerName) {
      return account.id;
    }
  }

  for (const account of accounts) {
    if (account.name.toLowerCase().includes(lowerName)) {
      return account.id;
    }
  }

  for (const account of accounts) {
    if (lowerName.includes(account.name.toLowerCase())) {
      return account.id;
    }
  }

  const keywordMap: Record<string, string[]> = {
    '信用卡': ['信用卡', 'credit', 'visa', 'mastercard'],
    '支付宝': ['支付宝', 'alipay'],
    '微信': ['微信', 'wechat'],
    '微信支付': ['微信支付', 'wechat pay'],
    '现金': ['现金', 'cash'],
    '储蓄卡': ['储蓄卡', '借记卡', '银行卡', 'debit', 'checking'],
  };

  for (const [keyword, aliases] of Object.entries(keywordMap)) {
    if (aliases.some(alias => lowerName.includes(alias))) {
      for (const account of accounts) {
        const accountLower = account.name.toLowerCase();
        if (aliases.some(alias => accountLower.includes(alias))) {
          return account.id;
        }
      }
    }
  }

  return null;
}

export function findBestCategoryMatch(
  categoryName: string | null | undefined,
  categories: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>>,
): CategoryEntity['id'] | null {
  if (!categoryName || categories.length === 0) {
    return null;
  }

  const lowerName = categoryName.toLowerCase();

  for (const category of categories) {
    if (category.name.toLowerCase() === lowerName) {
      return category.id;
    }
  }

  for (const category of categories) {
    if (category.name.toLowerCase().includes(lowerName)) {
      return category.id;
    }
  }

  for (const category of categories) {
    if (lowerName.includes(category.name.toLowerCase())) {
      return category.id;
    }
  }

  const keywordMap: Record<string, string[]> = {
    '餐饮': ['餐饮', '咖啡', '奶茶', '吃饭', '餐厅', '外卖', '午餐', '晚餐', '早餐'],
    '交通': ['交通', '打车', '地铁', '公交', '滴滴', '出租车'],
    '购物': ['购物', '淘宝', '京东', '衣服', '鞋子', '包包', '化妆品'],
    '娱乐': ['娱乐', '电影', 'KTV', '游戏', '旅游'],
    '住房': ['住房', '房租', '水电', '物业', '房贷'],
    '医疗': ['医疗', '医院', '看病', '买药', '体检', '保险'],
    '教育': ['教育', '学习', '课程', '书', '培训'],
    '通讯': ['通讯', '话费', '流量', '手机'],
    '汽车': ['汽车', '加油', '停车', '洗车', '保养'],
    '收入': ['收入', '工资', '奖金', '补贴', '报销', '退款'],
  };

  for (const [keyword, aliases] of Object.entries(keywordMap)) {
    if (aliases.some(alias => lowerName.includes(alias))) {
      for (const category of categories) {
        const categoryLower = category.name.toLowerCase();
        if (aliases.some(alias => categoryLower.includes(alias))) {
          return category.id;
        }
      }
    }
  }

  return null;
}

export function findOrCreatePayeeId(
  payeeName: string | null | undefined,
  payees: Array<Pick<PayeeEntity, 'id' | 'name'>>,
): { id: PayeeEntity['id'] | null; name: string | null } {
  if (!payeeName || payeeName.trim().length === 0) {
    return { id: null, name: null };
  }

  const trimmedName = payeeName.trim();
  const lowerName = trimmedName.toLowerCase();

  for (const payee of payees) {
    if (payee.name.toLowerCase() === lowerName) {
      return { id: payee.id, name: payee.name };
    }
  }

  return { id: null, name: trimmedName };
}

export function finalizeTransaction(
  parsed: ParsedTransaction,
  context: {
    accounts: Array<Pick<AccountEntity, 'id' | 'name'>>;
    categories: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>>;
    payees: Array<Pick<PayeeEntity, 'id' | 'name'>>;
    defaultAccountId?: string;
  },
): FinalizedTransaction | null {
  if (parsed.amount === null) {
    return null;
  }

  const { accounts, categories, payees, defaultAccountId } = context;

  let accountId = findBestAccountMatch(parsed.accountName, accounts);
  if (!accountId && defaultAccountId) {
    accountId = defaultAccountId;
  }
  if (!accountId && accounts.length > 0) {
    accountId = accounts[0].id;
  }
  if (!accountId) {
    return null;
  }

  const categoryId = findBestCategoryMatch(parsed.categoryName, categories);

  const { id: payeeId, name: payeeName } = findOrCreatePayeeId(
    parsed.payeeName,
    payees,
  );

  const amount = parsed.isExpense ? -Math.abs(parsed.amount) : Math.abs(parsed.amount);

  const date = parsed.date || monthUtils.currentDay();

  return {
    amount: amount as IntegerAmount,
    date,
    accountId,
    categoryId,
    payeeId,
    payeeName: payeeName || undefined,
    notes: parsed.notes,
  };
}
