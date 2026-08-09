// app/(tabs)/list.tsx
import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { colors } from '../../src/theme/tokens';
import { listPlaces } from '../../src/db/placesRepo';
import type { Place } from '../../src/types';

type MonthFilter = 'all' | 'this' | 'last';

function monthRange(offset: number): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export default function ListScreen() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all');

  const reload = useCallback(() => {
    const range = monthFilter === 'this' ? monthRange(0) : monthFilter === 'last' ? monthRange(-1) : {};
    setPlaces(listPlaces({ sort, query, ...range }));
  }, [sort, query, monthFilter]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Loci</Text>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={styles.account}>계정</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="이름, 주소로 검색"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={reload}
      />

      <View style={styles.filterRow}>
        <Pressable onPress={() => setSort('recent')}>
          <Text style={sort === 'recent' ? styles.filterActive : styles.filter}>최근순</Text>
        </Pressable>
        <Pressable onPress={() => setSort('name')}>
          <Text style={sort === 'name' ? styles.filterActive : styles.filter}>이름순</Text>
        </Pressable>
        <View style={{ width: 16 }} />
        <Pressable onPress={() => setMonthFilter('all')}>
          <Text style={monthFilter === 'all' ? styles.filterActive : styles.filter}>전체</Text>
        </Pressable>
        <Pressable onPress={() => setMonthFilter('this')}>
          <Text style={monthFilter === 'this' ? styles.filterActive : styles.filter}>이번달</Text>
        </Pressable>
        <Pressable onPress={() => setMonthFilter('last')}>
          <Text style={monthFilter === 'last' ? styles.filterActive : styles.filter}>지난달</Text>
        </Pressable>
      </View>

      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/place/${item.id}`)}>
            <View style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardAddr}>{item.address}</Text>
              <Text style={styles.cardMemo} numberOfLines={2}>
                {item.memo}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>아직 기록된 장소가 없어요.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  title: { fontSize: 24, color: colors.ink },
  account: { fontSize: 12, color: colors.sageOlive },
  search: { marginHorizontal: 18, marginTop: 10, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 8 },
  filterRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 18, paddingTop: 10, flexWrap: 'wrap' },
  filter: { fontSize: 12, color: '#8A8073' },
  filterActive: { fontSize: 12, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.gold },
  list: { padding: 18, gap: 12 },
  card: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingBottom: 12 },
  thumb: { width: 58, height: 58, backgroundColor: '#E3D7BD', borderRadius: 2 },
  cardName: { fontSize: 15, color: colors.ink },
  cardAddr: { fontSize: 11, color: colors.sageOlive },
  cardMemo: { fontSize: 12, color: '#5c554a' },
  empty: { textAlign: 'center', color: '#8A8073', marginTop: 40 },
});
