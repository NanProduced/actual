import * as monthUtils from '#shared/months';
import type { LlmConfig } from '#types/prefs';

import { buildSystemPrompt, buildUserPrompt, callLlm } from './service';
import type {
  FinalizedTransaction,
  ParseResult,
  ParsedTransaction,
  TransactionContext,
} from './types';
import { parseAmount, parseDateInput } from './parser';
import type { IntegerAmount } from '#shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '#types/models';

export async function parseWithLlm(
  config: LlmConfig,
  input: string,
  context: {
    accounts: Array<Pick<AccountEntity, 'id' | 'name'>>;
    categories: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>>;
    categoryGroups: Array<{ id: string; name: string }>;
    payees: Array<Pick<PayeeEntity, 'id' | 'name'>>;
  },
): Promise<ParseResult> {
  if (!config.apiKey) {
    return {
      success: false,
      error: 'LLM API key not configured',
    };
  }

  const today = monthUtils.currentDay();

  try {
    const response = await callLlm(
      config,
      [
        {
          role: 'system',
          content: buildSystemPrompt({
            today,
            accounts: context.accounts,
            categories: context.categories,
            categoryGroups: context.categoryGroups,
            payees: context.payees,
          }),
        },
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

    let parsed: ParsedTransaction;
    try {
      parsed = JSON.parse(response.content) as ParsedTransaction;
    } catch {
      return {
        success: false,
        error: 'LLM returned invalid JSON',
      };
    }

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
  const date = parseDateInput(input, dateFormat) || monthUtils.currentDay();

  return {
    amount,
    amountRaw,
    date,
    dateRaw: null,
    payeeName: null,
    categoryName: null,
    categoryId: null,
    categoryCandidates: [],
    accountName: null,
    accountId: null,
    accountCandidates: [],
    notes: null,
    isExpense: true,
  };
}

export function findBestAccountMatch(
  accountName: string | null | undefined,
  accountIdFromLlm: string | null | undefined,
  accounts: Array<Pick<AccountEntity, 'id' | 'name'>>,
): AccountEntity['id'] | null {
  if (accountIdFromLlm) {
    const matched = accounts.find(a => a.id === accountIdFromLlm);
    if (matched) {
      return accountIdFromLlm;
    }
  }

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

  return null;
}

export function findBestCategoryMatch(
  categoryName: string | null | undefined,
  categoryIdFromLlm: string | null | undefined,
  categories: Array<Pick<CategoryEntity, 'id' | 'name' | 'group'>>,
): CategoryEntity['id'] | null {
  if (categoryIdFromLlm) {
    const matched = categories.find(c => c.id === categoryIdFromLlm);
    if (matched) {
      return categoryIdFromLlm;
    }
  }

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
  parsed: ParsedTransaction & { categoryId?: string | null; accountId?: string | null },
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

  let accountId = findBestAccountMatch(parsed.accountName, parsed.accountId || null, accounts);
  if (!accountId && defaultAccountId) {
    accountId = defaultAccountId;
  }
  if (!accountId && accounts.length > 0) {
    accountId = accounts[0].id;
  }
  if (!accountId) {
    return null;
  }

  const categoryId = findBestCategoryMatch(parsed.categoryName, parsed.categoryId || null, categories);

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
