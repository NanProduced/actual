import React, { useCallback, useState } from 'react';

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
        aria-label="快速记账输入"
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
          {hasAiEnabled ? 'AI 记账' : '快速添加'}
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
                  {hasAiEnabled ? 'AI 智能记账' : '快速记账'}
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
              placeholder='例如: "咖啡 38" 或 "昨天打车 26"'
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
                用自然语言描述你的交易，AI 将自动解析金额、日期、分类和账户。
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageTextSubdued,
                }}
              >
                请在设置中启用 AI 功能以获得更智能的解析体验。
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
                取消
              </Button>
              <Button
                variant="primary"
                onPress={() => handleSubmit(quickInputValue)}
                isDisabled={!quickInputValue.trim()}
              >
                继续
              </Button>
            </View>
          </View>
        </Popover>
    </>
  );
}
