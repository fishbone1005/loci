// app/(tabs)/categories.tsx
import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { listCategoriesWithCounts } from '../../src/db/categoriesRepo';
import type { CategorySummary } from '../../src/types';

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      setCategories(listCategoriesWithCounts());
    }, [])
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>분류</Text>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable
            style={styles.tile}
            onPress={() =>
              router.push({ pathname: '/list', params: { categoryId: item.id, categoryName: item.name } })
            }
          >
            {item.thumb ? (
              <Image source={{ uri: item.thumb }} style={styles.tileImage} />
            ) : (
              <View style={styles.tileImage} />
            )}
            <Text style={styles.tileName}>{item.name}</Text>
            <Text style={styles.tileCount}>{item.placeCount}곳</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>아직 만든 분류가 없어요. 장소를 기록할 때 카테고리를 추가해보세요.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  title: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, paddingHorizontal: 18, paddingTop: 18, marginBottom: 12 },
  grid: { paddingHorizontal: 14, paddingBottom: 24 },
  row: { gap: 12, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, borderRadius: 4, padding: 10 },
  tileImage: { width: '100%', aspectRatio: 1, borderRadius: 2, marginBottom: 8, backgroundColor: colors.sand },
  tileName: { fontSize: 14, color: colors.ink },
  tileCount: { fontFamily: fonts.mono, fontSize: 11, color: colors.gold, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
});
