import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { SvgExclamationOutline } from '@actual-app/components/icons/v1';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { LlmConfig } from '@actual-app/core/types/prefs';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { AccountAutocomplete } from '#components/autocomplete/AccountAutocomplete';
import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { PayeeAutocomplete } from '#components/autocomplete/PayeeAutocomplete';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import { AmountInput } from '#components/util/AmountInput';
import { DateSelect } from '#components/select/DateSelect';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useDateFormat } from '#hooks/useDateFormat';
import { useGlobalPref } from '#hooks/useGlobalPref';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import { accountQueries } from '#accounts';
import { pushModal } from '#modals/modalsSlice';

import type { ParsedTransaction } from '@actual-app/core/shared/llm/types';
import { finalizeTransaction } from '@actual-app/core/shared/llm/index';

type AiTransactionPreviewModalProps = Extract<
  ModalType,
  { name: 'ai-transaction-preview' }
>['options'];

type FormState = {
  date: string;
  amount: IntegerAmount;
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  accountId: string;
  notes: string | null;
  isExpense: boolean;
};

type ParseResponse = {
  success: boolean;
  transaction?: ParsedTransaction;
  error?: string;
  source: 'llm' | 'local' | 'none';
};

export function AiTransactionPreviewModal({
  inputText,
}: AiTransactionPreviewModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';

  const { data: accounts = [] } = useAccounts();
  const { data: { list: categoryList = [], grouped: categoryGroups = [] } = {} } =
    useCategories();
  const [llmConfig] = useGlobalPref('llmConfig');

  const [isLoading, setIsLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSource, setParseSource] = useState<'llm' | 'local' | 'none'>('none');
  const [originalInput, setOriginalInput] = useState(inputText);

  const [formState, setFormState] = useState<FormState>({
    date: monthUtils.currentDay(),
    amount: 0 as IntegerAmount,
    payeeId: null,
    payeeName: null,
    categoryId: null,
    accountId: accounts[0]?.id || '',
    notes: null,
    isExpense: true,
  });

  const validAccounts = useMemo(() => {
    return accounts.filter(a => !a.closed);
  }, [accounts]);

  const fetchParseResult = useCallback(
    async (text: string) => {
      setIsLoading(true);
      setParseError(null);

      try {
        const result: ParseResponse = await send('llm/parse', {
          input: text,
          useLocalFallback: true,
          dateFormat,
        });

        setParseSource(result.source);

        if (!result.success || !result.transaction) {
          setParseError(result.error || t('Failed to parse transaction'));
          setIsLoading(false);
          return;
        }

        const parsed = result.transaction;

        const defaultAccountId =
          (llmConfig as LlmConfig | null)?.defaultAccountId || validAccounts[0]?.id || '';

        const finalized = finalizeTransaction(parsed, {
          accounts: validAccounts,
          categories: categoryList,
          payees: [],
          defaultAccountId,
        });

        const amount = parsed.amount !== null ? parsed.amount : (0 as IntegerAmount);
        const signedAmount = parsed.isExpense
          ? (-Math.abs(amount) as IntegerAmount)
          : (Math.abs(amount) as IntegerAmount);

        setFormState({
          date: parsed.date || monthUtils.currentDay(),
          amount: signedAmount,
          payeeId: finalized?.payeeId || null,
          payeeName: parsed.payeeName || null,
          categoryId: finalized?.categoryId || null,
          accountId: finalized?.accountId || defaultAccountId,
          notes: parsed.notes || null,
          isExpense: parsed.isExpense,
        });
      } catch (error) {
        setParseError(
          error instanceof Error ? error.message : t('Unexpected error occurred'),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [dateFormat, validAccounts, categoryList, llmConfig, t],
  );

  useEffect(() => {
    fetchParseResult(inputText);
  }, []);

  const handleAmountChange = useCallback((newAmount: IntegerAmount) => {
    setFormState(prev => ({
      ...prev,
      amount: newAmount,
    }));
  }, []);

  const handleDateChange = useCallback((newDate: string) => {
    setFormState(prev => ({
      ...prev,
      date: newDate,
    }));
  }, []);

  const handleAccountChange = useCallback((accountId: string) => {
    setFormState(prev => ({
      ...prev,
      accountId,
    }));
  }, []);

  const handleCategoryChange = useCallback((categoryId: string, _categoryName: string) => {
    setFormState(prev => ({
      ...prev,
      categoryId,
    }));
  }, []);

  const handlePayeeChange = useCallback(
    (payeeId: string, payeeName?: string) => {
      setFormState(prev => ({
        ...prev,
        payeeId,
        payeeName: payeeName || prev.payeeName,
      }));
    },
    [],
  );

  const handleNotesChange = useCallback((notes: string) => {
    setFormState(prev => ({
      ...prev,
      notes: notes || null,
    }));
  }, []);

  const handleReparse = useCallback(() => {
    if (originalInput.trim()) {
      fetchParseResult(originalInput);
    }
  }, [originalInput, fetchParseResult]);

  const handleSave = useCallback(async () => {
    if (!formState.accountId) {
      setParseError(t('Please select an account'));
      return;
    }

    if (formState.amount === 0) {
      setParseError(t('Amount cannot be zero'));
      return;
    }

    const newTransaction = {
      id: crypto.randomUUID(),
      account: formState.accountId,
      amount: formState.amount,
      date: formState.date,
      category: formState.categoryId || undefined,
      payee: formState.payeeId || undefined,
      notes: formState.notes || undefined,
      imported_payee: formState.payeeId ? undefined : formState.payeeName || undefined,
    };

    try {
      await send('transaction-add', newTransaction);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : t('Failed to save transaction'),
      );
    }
  }, [formState, t]);

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return '';
    const cat = categoryList.find(c => c.id === categoryId);
    return cat?.name || '';
  };

  const getAccountName = (accountId: string): string => {
    const acc = validAccounts.find(a => a.id === accountId);
    return acc?.name || '';
  };

  return (
    <Modal
      name="ai-transaction-preview"
      isLoading={isLoading}
      containerProps={{
        style: {
          width: '600px',
          maxWidth: '90vw',
          maxHeight: '80vh',
        },
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={t('New Transaction')} />}
            rightContent={
              <ModalCloseButton
                onPress={() => state.close()}
                style={{ color: theme.pageText }}
              />
            }
          />

          <View style={{ gap: 15, padding: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                padding: 8,
                backgroundColor: theme.pillBackground,
                borderRadius: 4,
              }}
            >
              <Text style={{ color: theme.pageTextSubdued, flexShrink: 0 }}>
                {t('Input:')}
              </Text>
              <Input
                value={originalInput}
                onChangeValue={setOriginalInput}
                style={{ flex: 1 }}
                placeholder={t('e.g. "咖啡 38" or "昨天打车 26"')}
              />
              <Button
                variant="primary"
                onPress={handleReparse}
                isDisabled={isLoading || !originalInput.trim()}
              >
                {t('Reparse')}
              </Button>
            </View>

            {parseSource !== 'none' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 8px',
                  backgroundColor:
                    parseSource === 'llm' ? theme.noticeBackground : theme.pillBackground,
                  borderRadius: 4,
                  alignSelf: 'flex-start',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: parseSource === 'llm' ? theme.noticeText : theme.pageTextSubdued,
                  }}
                >
                  {parseSource === 'llm'
                    ? t('Parsed by AI')
                    : t('Parsed locally (fallback)')}
                </Text>
              </View>
            )}

            {parseError && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: 10,
                  backgroundColor: theme.errorBackground,
                  borderRadius: 4,
                }}
              >
                <SvgExclamationOutline
                  style={{ color: theme.errorText, flexShrink: 0, marginTop: 2 }}
                  width={16}
                  height={16}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.errorText, fontWeight: 500 }}>
                    {t('Parse Error')}
                  </Text>
                  <Text style={{ color: theme.errorText, fontSize: 13, marginTop: 4 }}>
                    {parseError}
                  </Text>
                </View>
              </View>
            )}

            <View
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 15,
              }}
              className={css({
                [`@media (max-width: 500px)`]: {
                  gridTemplateColumns: '1fr',
                },
              })}
            >
              <FormField>
                <FormLabel title={t('Date')} />
                <DateSelect
                  value={formState.date}
                  dateFormat={dateFormat}
                  onSelect={handleDateChange}
                />
              </FormField>

              <FormField>
                <FormLabel title={t('Amount')} />
                <AmountInput
                  value={formState.amount}
                  onUpdate={handleAmountChange}
                  autoDecimals
                />
              </FormField>
            </View>

            <FormField>
              <FormLabel title={t('Account')} />
              <AccountAutocomplete
                type="single"
                value={formState.accountId}
                onSelect={handleAccountChange}
                openOnFocus
                includeClosedAccounts={false}
                inputProps={{
                  placeholder: t('Select account'),
                  onClick: () => {
                    dispatch(
                      pushModal({
                        modal: {
                          name: 'account-autocomplete',
                          options: {
                            onSelect: handleAccountChange,
                            includeClosedAccounts: false,
                            hiddenAccounts: [],
                          },
                        },
                      }),
                    );
                  },
                }}
              />
            </FormField>

            <FormField>
              <FormLabel title={t('Payee')} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PayeeAutocomplete
                  type="single"
                  value={formState.payeeId || ''}
                  showMakeTransfer={false}
                  openOnFocus
                  onSelect={handlePayeeChange}
                  inputProps={{
                    placeholder: t('Select or type payee'),
                    onClick: () => {
                      dispatch(
                        pushModal({
                          modal: {
                            name: 'payee-autocomplete',
                            options: {
                              onSelect: newPayeeId => {
                                handlePayeeChange(newPayeeId);
                              },
                            },
                          },
                        }),
                      );
                    },
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.pageTextSubdued,
                  marginTop: 4,
                }}
              >
                {t('Tip: Type to create a new payee')}
              </Text>
            </FormField>

            <FormField>
              <FormLabel title={t('Category')} />
              <CategoryAutocomplete
                type="single"
                value={formState.categoryId || ''}
                categoryGroups={categoryGroups}
                openOnFocus
                showHiddenCategories
                onSelect={handleCategoryChange}
                inputProps={{
                  placeholder: t('Select category'),
                  onClick: () => {
                    dispatch(
                      pushModal({
                        modal: {
                          name: 'category-autocomplete',
                          options: {
                            onSelect: handleCategoryChange,
                            categoryGroups,
                            showHiddenCategories: true,
                          },
                        },
                      }),
                    );
                  },
                }}
              />
            </FormField>

            <FormField>
              <FormLabel title={t('Notes')} />
              <Input
                value={formState.notes || ''}
                onChangeValue={handleNotesChange}
                placeholder={t('Optional notes')}
              />
            </FormField>
          </View>

          <ModalButtons style={{ padding: '0 10px 10px' }}>
            <Button onPress={() => state.close()}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              onPress={async () => {
                await handleSave();
                state.close();
              }}
              isDisabled={isLoading || !formState.accountId || formState.amount === 0}
            >
              <Trans>Save Transaction</Trans>
            </Button>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
