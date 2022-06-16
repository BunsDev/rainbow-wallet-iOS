import analytics from '@segment/analytics-react-native';
import lang from 'i18n-js';
import React, { useCallback } from 'react';
import LinearGradient from 'react-native-linear-gradient';
import { useSelector } from 'react-redux';
import { useNavigation } from '../../navigation/Navigation';
import { ButtonPressAnimation } from '../animations';
import { CoinIcon } from '../coin-icon';
import {
  AccentColorProvider,
  Bleed,
  Box,
  ColorModeProvider,
  Column,
  Columns,
  Cover,
  Heading,
  Inset,
  Stack,
  Text,
  useForegroundColor,
} from '@rainbow-me/design-system';
import { useAccountSettings } from '@rainbow-me/hooks';
import { DPI_ADDRESS } from '@rainbow-me/references';
import Routes from '@rainbow-me/routes';
import { useTheme } from '@rainbow-me/theme';
import { ethereumUtils } from '@rainbow-me/utils';

export default function DPICard() {
  const { nativeCurrency } = useAccountSettings();
  const { navigate } = useNavigation();
  const { genericAssets } = useSelector(({ data: { genericAssets } }) => ({
    genericAssets,
  }));
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    const asset = ethereumUtils.formatGenericAsset(
      genericAssets[DPI_ADDRESS],
      nativeCurrency
    );

    analytics.track('Pressed DPI Button', { category: 'discover' });

    navigate(Routes.TOKEN_INDEX_SHEET, {
      asset,
      backgroundOpacity: 1,
      cornerRadius: 39,
      fromDiscover: true,
      type: 'token_index',
    });
  }, [genericAssets, nativeCurrency, navigate]);

  const shadow = useForegroundColor('shadow');
  const shadowColor = useForegroundColor({
    custom: {
      dark: shadow,
      light: '#8360F7',
    },
  });

  return (
    <ButtonPressAnimation
      onPress={handlePress}
      scaleTo={0.92}
      testID="ens-register-name-banner"
    >
      <AccentColorProvider color={shadowColor}>
        <Box
          background="body"
          borderRadius={24}
          shadow={{
            custom: {
              android: {
                color: 'accent',
                elevation: 24,
                opacity: 0.5,
              },
              ios: [
                {
                  blur: 24,
                  color: 'accent',
                  offset: { x: 0, y: 8 },
                  opacity: 0.35,
                },
              ],
            },
          }}
        >
          <ColorModeProvider value="darkTinted">
            <Box
              as={LinearGradient}
              background="body"
              borderRadius={24}
              colors={['#6D58F5', '#A970FF']}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
            >
              <Inset
                bottom={{ custom: 20 }}
                horizontal={{ custom: 20 }}
                top={{ custom: 25 }}
              >
                <Stack space={{ custom: 20 }}>
                  <Columns
                    alignHorizontal="justify"
                    alignVertical="top"
                    space="12px"
                  >
                    <Stack space={{ custom: 13 }}>
                      <Heading color="primary" size="20px" weight="bold">
                        {lang.t('discover.dpi.title')}
                      </Heading>
                      <Text color="secondary60" size="15px" weight="semibold">
                        {lang.t('discover.dpi.body')}
                      </Text>
                    </Stack>
                    <Column width="content">
                      <Bleed top="5px">
                        <CoinIcon
                          address={DPI_ADDRESS}
                          forcedShadowColor={colors.shadowBlack}
                          shadowOpacity={0.1}
                          symbol="DPI"
                        />
                      </Bleed>
                    </Column>
                  </Columns>
                  <ButtonPressAnimation onPress={handlePress} scaleTo={0.92}>
                    <Box
                      style={{
                        shadowColor: colors.shadowBlack,
                        shadowOffset: { height: 4, width: 0 },
                        shadowOpacity: 0.15,
                        shadowRadius: 6,
                      }}
                    >
                      <Box
                        as={LinearGradient}
                        background="body"
                        borderRadius={18}
                        colors={['#5236C2', '#7533D6']}
                        end={{ x: 1, y: 0.5 }}
                        height="36px"
                        start={{ x: 0, y: 0.5 }}
                        width="full"
                      >
                        <Cover alignHorizontal="center" alignVertical="center">
                          <Text align="center" size="15px" weight="heavy">
                            􀦌 {lang.t('discover.dpi.view')}
                          </Text>
                        </Cover>
                      </Box>
                    </Box>
                  </ButtonPressAnimation>
                </Stack>
              </Inset>
            </Box>
          </ColorModeProvider>
        </Box>
      </AccentColorProvider>
    </ButtonPressAnimation>
  );
}
