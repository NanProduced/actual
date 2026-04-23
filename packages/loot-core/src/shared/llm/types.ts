import type { IntegerAmount } from '#shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '#types/models';

export type ParsedTransaction = {
  amount: IntegerAmount | null;
  amountRaw: string | null;
  date: string | null;
  dateRaw: string | null;
  payeeName: string | null;
  categoryName: string | null;
  categoryId: string | null;
  categoryCandidates: string[];
  accountName: string | null;
  accountId: string | null;
  accountCandidates: string[];
  notes: string | null;
  isExpense: boolean;
};

export type LlmChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmResponse = {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type ParseResult = {
  success: boolean;
  transaction?: ParsedTransaction;
  error?: string;
  partiallyParsed?: boolean;
};

export type AccountWithName = Pick<AccountEntity, 'id' | 'name'>;
export type CategoryWithName = Pick<CategoryEntity, 'id' | 'name' | 'group'>;
export type PayeeWithName = Pick<PayeeEntity, 'id' | 'name'>;

export type TransactionContext = {
  accounts: AccountWithName[];
  categories: CategoryWithName[];
  payees: PayeeWithName[];
  categoryGroups: { id: string; name: string }[];
};

export type FinalizedTransaction = {
  amount: IntegerAmount;
  date: string;
  accountId: string;
  categoryId: string | null;
  payeeId: string | null;
  notes: string | null;
  payeeName?: string;
};
