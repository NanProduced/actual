import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { SvgAdd, SvgLightBulb } from '@actual-app/components/icons/v1';
import { useHotkeys } from 'react-hotkeys-hook';
import { css } from '@emotion/css';
import { theme } from '@actual-app/components/theme';
import { Popover } from '@actual-app/components/popover';

import { useGlobalPref } from '#hooks/useGlobalPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type AiTransactionInputProps = {
  style?: React.CSSProperties;
};

export function AiTransactionInput({ style }: AiTransactionInputProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [llmConfig] = useGlobalPref('llmConfig');

  const [showQuickInput, setShowQuickInput] = useState(false);
  const [quickInputValue, setQuickInputValue] = useState('');
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const hasAiEnabled = llmConfig && 'enabled' in llmConfig && llmConfig.enabled;

  const handleSubmit = useCallback(
    (value: string) => {
      if (value.trim()) {
        dispatch(
          pushModal({
            modal: {
              name: 'ai-transaction-preview',
              options: {
                inputText: value.trim(),
              },
            },
          }),
        );
        setShowQuickInput(false);
        setQuickInputValue('');
      }
    },
    [dispatch],
  );

  useHotkeys(
    'ctrl+shift+n, cmd+shift+n, meta+shift+n',
    () => {
      setShowQuickInput(true);
    },
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [],
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="bare"
        onPress={() => setShowQuickInput(true)}
        aria-label={t('Quick transaction input')}
        style={{
          ...style,
          padding: '4px 8px',
          gap: 4,
          borderRadius: 4,
        }}
      >
        {hasAiEnabled ? (
          <SvgLightBulb style={{ width: 14, height: 14 }} />
        ) : (
          <SvgAdd style={{ width: 14, height: 14 }} />
        )}
        <Text style={{ fontSize: 13 }}>
          {hasAiEnabled ? t('AI Input') : t('Quick Add')}
        </Text>
      </Button>

      <Popover
        triggerRef={triggerRef}
        placement="bottom"
        offset={4}
        isOpen={showQuickInput}
        onOpenChange={isOpen => {
          if (!isOpen) {
            setShowQuickInput(false);
          }
        }}
        style={{
          minWidth: 350,
          backgroundColor: theme.menuBackground,
          borderRadius: 6,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          zIndex: 3001,
        }}
      >
          <View
            style={{
              padding: 12,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {hasAiEnabled ? (
                  <SvgLightBulb
                    style={{
                      width: 16,
                      height: 16,
                      color: theme.pageText,
                    }}
                  />
                ) : (
                  <SvgAdd
                    style={{
                      width: 16,
                      height: 16,
                      color: theme.pageText,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.pageText,
                  }}
                >
                  {hasAiEnabled
                    ? t('AI Transaction Input')
                    : t('Quick Transaction Input')}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                }}
              >
                Ctrl+Shift+N
              </Text>
            </View>

            <Input
              autoFocus
              placeholder={t('e.g. "咖啡 38" or "昨天打车 26"')}
              value={quickInputValue}
              onChangeValue={setQuickInputValue}
              onEnter={(value) => {
                handleSubmit(value);
              }}
              style={{
                width: '100%',
              }}
            />

            {hasAiEnabled ? (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>
                  Describe your transaction naturally. AI will parse amount,
                  date, category, and account.
                </Trans>
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>
                  Enable AI in Settings for smarter parsing.
                </Trans>
              </Text>
            )}

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 4,
              }}
            >
              <Button
                variant="bare"
                onPress={() => {
                  setShowQuickInput(false);
                  setQuickInputValue('');
                }}
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="primary"
                onPress={() => handleSubmit(quickInputValue)}
                isDisabled={!quickInputValue.trim()}
              >
                <Trans>Continue</Trans>
              </Button>
            </View>
          </View>
        </Popover>
    </>
  );
}
