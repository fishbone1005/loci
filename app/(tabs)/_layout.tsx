import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { colors } from '../../src/theme/tokens';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.stampRed,
        tabBarInactiveTintColor: colors.muted,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: '보관함',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
