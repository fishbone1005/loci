import { Ionicons } from '@expo/vector-icons';
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
          tabBarIcon: ({ color }) => <Ionicons name="camera" color={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: '보관함',
          tabBarIcon: ({ color }) => <Ionicons name="file-tray-stacked" color={color} size={26} />,
        }}
      />
    </Tabs>
  );
}
