import React, { useCallback, useState } from 'react';

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
  ['openai-compatible', 'OpenAI 兼容'],
];

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  'openai-compatible': 'gpt-4o-mini',
};

export function LlmSettings() {
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
        setTestError(result.error || '连接失败');
      }
    } catch (error) {
      setTestStatus('error');
      setTestError(
        error instanceof Error ? error.message : '未知错误',
      );
    }
  }, [config]);

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
                启用 AI 交易解析
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
                  <FormLabel title="提供商" />
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
                  <FormLabel title="模型" />
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder="例如: gpt-4o-mini, claude-3-5-sonnet"
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
                <FormLabel title="API Key" />
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => updateConfig({ apiKey: e.target.value })}
                  placeholder="请输入您的 API Key"
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
                  <FormLabel title="API Base URL" />
                  <input
                    type="text"
                    value={config.apiBase}
                    onChange={(e) => updateConfig({ apiBase: e.target.value })}
                    placeholder="例如: https://api.openai.com/v1"
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
                <FormLabel title="默认账户" />
                <AccountAutocomplete
                  type="single"
                  value={config.defaultAccountId}
                  onSelect={(accountId) =>
                    updateConfig({ defaultAccountId: accountId })
                  }
                  openOnFocus
                  inputProps={{
                    placeholder: '选择默认账户',
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
                    '测试中...'
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
                      已连接
                    </View>
                  ) : (
                    '测试连接'
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
                    连接失败: {testError}
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
                <strong>工作原理：</strong> 当您输入交易描述如
                "咖啡 38" 或 "昨天打车 26" 时，AI
                将自动解析金额、日期、分类和账户。您可以在保存前查看和编辑解析的信息。
                <br />
                <br />
                <strong>支持的提供商：</strong> OpenAI（推荐 GPT-4o-mini）、Anthropic
                Claude，或任何 OpenAI 兼容的 API。
              </Block>
            </View>
          )}
        </View>
      }
    >
      <Text>
        <strong>AI 记账</strong>
        让您可以使用自然语言快速添加交易记录。
      </Text>
    </Setting>
  );
}
