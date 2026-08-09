import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../src/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '이런' }} />
      <View style={styles.container}>
        <Text style={styles.title}>없는 화면이에요.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>처음 화면으로 돌아가기</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.paper,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
  },
  link: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  linkText: {
    fontSize: 14,
    color: colors.stampRed,
  },
});
