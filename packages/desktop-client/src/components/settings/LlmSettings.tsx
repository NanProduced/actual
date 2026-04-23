import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { SvgLightBulb } from '@actual-app/components/icons/v1';
import { SvgCheck } from '@actual-app/components/icons/v2';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { LlmConfig, LlmProvider } from '@actual-app/core/types/prefs';
import { css } from '@emotion/css';

import { Checkbox, FormField, FormLabel } from '#components/forms';
import { AccountAutocomplete } from '#components/autocomplete/AccountAutocomplete';
import { useAccounts } from '#hooks/useAccounts';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { Column, Setting } from './UI';

const DEFAULT_CONFIG: LlmConfig = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  apiBase: '',
  model: 'gpt-4o-mini',
  defaultAccountId: '',
};

const PROVIDER_OPTIONS: Array<[LlmProvider, string]> = [
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['openai-compatible', 'OpenAI Compatible'],
];

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  'openai-compatible': 'gpt-4o-mini',
};

export function LlmSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: allAccounts = [] } = useAccounts();

  const [llmConfig, setLlmConfig] = useGlobalPref('llmConfig');

  const config: LlmConfig = llmConfig
    ? (llmConfig as LlmConfig)
    : DEFAULT_CONFIG;

  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const validAccounts = allAccounts.filter((a) => !a.closed);

  const updateConfig = useCallback(
    (updates: Partial<LlmConfig>) => {
      const newConfig: LlmConfig = {
        ...config,
        ...updates,
      };
      setLlmConfig(newConfig);
    },
    [config, setLlmConfig],
  );

  const handleToggleEnabled = useCallback(() => {
    updateConfig({ enabled: !config.enabled });
  }, [config.enabled, updateConfig]);

  const handleProviderChange = useCallback(
    (provider: LlmProvider) => {
      updateConfig({
        provider,
        model: DEFAULT_MODELS[provider],
      });
    },
    [updateConfig],
  );

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestError(null);

    try {
      const result: { success: boolean; error?: string } = await send(
        'llm/test',
        {
          config: {
            ...config,
            apiKey: config.apiKey || '',
            apiBase: config.apiBase || '',
          },
        },
      );

      if (result.success) {
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('error');
        setTestError(result.error || t('Connection failed'));
      }
    } catch (error) {
      setTestStatus('error');
      setTestError(
        error instanceof Error ? error.message : t('Unexpected error'),
      );
    }
  }, [config, t]);

  const getAccountName = (accountId: string): string => {
    const acc = validAccounts.find((a) => a.id === accountId);
    return acc?.name || '';
  };

  return (
    <Setting
      primaryAction={
        <View
          style={{
            flexDirection: 'column',
            gap: '1em',
            width: '100%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Checkbox
              id="settings-llm-enabled"
              checked={config.enabled}
              onChange={handleToggleEnabled}
            />
            <label
              htmlFor="settings-llm-enabled"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SvgLightBulb
                style={{
                  width: 16,
                  height: 16,
                  color: config.enabled
                    ? theme.pageTextPositive
                    : theme.pageTextSubdued,
                }}
              />
              <Text
                style={{
                  fontWeight: 600,
                  color: config.enabled
                    ? theme.pageText
                    : theme.pageTextSubdued,
                }}
              >
                <Trans>Enable AI Transaction Parsing</Trans>
              </Text>
            </label>
          </View>

          {config.enabled && (
            <View
              style={{
                flexDirection: 'column',
                gap: 16,
                paddingTop: 8,
              }}
            >
              <View
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}
                className={css({
                  [`@media (max-width: 500px)`]: {
                    gridTemplateColumns: '1fr',
                  },
                })}
              >
                <FormField>
                  <FormLabel title={t('Provider')} />
                  <Select<LlmProvider>
                    value={config.provider}
                    onChange={handleProviderChange}
                    options={PROVIDER_OPTIONS}
                    className={css({
                      '&[data-hovered]': {
                        backgroundColor: theme.buttonNormalBackgroundHover,
                      },
                    })}
                  />
                </FormField>

                <FormField>
                  <FormLabel title={t('Model')} />
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder={t('e.g. gpt-4o-mini, claude-3-5-sonnet')}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.formInputBorder}`,
                      borderRadius: 4,
                      backgroundColor: theme.formInputBackground,
                      color: theme.formInputText,
                      fontSize: 13,
                    }}
                  />
                </FormField>
              </View>

              <FormField>
                <FormLabel title={t('API Key')} />
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => updateConfig({ apiKey: e.target.value })}
                  placeholder={t('Enter your API key')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${theme.formInputBorder}`,
                    borderRadius: 4,
                    backgroundColor: theme.formInputBackground,
                    color: theme.formInputText,
                    fontSize: 13,
                  }}
                />
              </FormField>

              {config.provider === 'openai-compatible' && (
                <FormField>
                  <FormLabel title={t('API Base URL')} />
                  <input
                    type="text"
                    value={config.apiBase}
                    onChange={(e) => updateConfig({ apiBase: e.target.value })}
                    placeholder={t('e.g. https://api.openai.com/v1')}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${theme.formInputBorder}`,
                      borderRadius: 4,
                      backgroundColor: theme.formInputBackground,
                      color: theme.formInputText,
                      fontSize: 13,
                    }}
                  />
                </FormField>
              )}

              <FormField>
                <FormLabel title={t('Default Account')} />
                <AccountAutocomplete
                  type="single"
                  value={config.defaultAccountId}
                  onSelect={(accountId) =>
                    updateConfig({ defaultAccountId: accountId })
                  }
                  openOnFocus
                  inputProps={{
                    placeholder: t('Select default account'),
                    onClick: () => {
                      dispatch(
                        pushModal({
                          modal: {
                            name: 'account-autocomplete',
                            options: {
                              onSelect: (newAccountId) => {
                                updateConfig({ defaultAccountId: newAccountId });
                              },
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

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <Button
                  variant="normal"
                  onPress={handleTestConnection}
                  isDisabled={testStatus === 'testing' || !config.apiKey}
                >
                  {testStatus === 'testing' ? (
                    <Trans>Testing...</Trans>
                  ) : testStatus === 'success' ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <SvgCheck
                        style={{
                          width: 14,
                          height: 14,
                          color: theme.pageTextPositive,
                        }}
                      />
                      <Trans>Connected</Trans>
                    </View>
                  ) : (
                    <Trans>Test Connection</Trans>
                  )}
                </Button>
              </View>

              {testStatus === 'error' && testError && (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: theme.errorBackground,
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ color: theme.errorText, fontSize: 13 }}>
                    <Trans>Connection failed:</Trans> {testError}
                  </Text>
                </View>
              )}

              <Block
                style={{
                  marginTop: 8,
                  padding: 12,
                  backgroundColor: theme.pillBackground,
                  borderRadius: 4,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>
                  <strong>How it works:</strong> When you enter a transaction
                  description like "咖啡 38" or "昨天打车 26", the AI will
                  automatically parse the amount, date, category, and account. You
                  can review and edit the parsed information before saving.
                </Trans>
                <br />
                <br />
                <Trans>
                  <strong>Supported providers:</strong> OpenAI (GPT-4o-mini
                  recommended), Anthropic Claude, or any OpenAI-compatible API.
                </Trans>
              </Block>
            </View>
          )}
        </View>
      }
    >
      <Text>
        <Trans>
          <strong>AI Transaction Input</strong> lets you quickly add transactions
          using natural language.
        </Trans>
      </Text>
    </Setting>
  );
}
