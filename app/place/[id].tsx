import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TextInput, Pressable, Alert, StyleSheet, Dimensions, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, fonts, spacing } from '../../src/theme/tokens';
import { getPlaceWithPhotos, updatePlace, deletePlace } from '../../src/db/placesRepo';
import { usePhotoUri } from '../../src/storage/photoFiles';
import type { Place, Photo } from '../../src/types';
import { CategoryTagInput } from '../../src/components/CategoryTagInput';
import { listCategories, listCategoriesForPlace, findOrCreateCategory, assignCategories } from '../../src/db/categoriesRepo';
import type { Category } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

function CarouselPhoto({ photo }: { photo: Photo }) {
  const uri = usePhotoUri(photo);
  if (!uri) return <View style={[styles.slide, styles.slideEmpty]} />;
  return <Image source={{ uri }} style={styles.slide} />;
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    const result = getPlaceWithPhotos(id);
    setLoaded(true);
    if (!result) return;
    setPlace(result.place);
    setPhotos(result.photos);
    setName(result.place.name);
    setAddress(result.place.address);
    setMemo(result.place.memo);
    setCategories(listCategories());
    setSelectedCategoryIds(listCategoriesForPlace(id).map((c) => c.id));
  }, [id]);

  function handleCreateCategory(name: string) {
    const category = findOrCreateCategory(name, null);
    setCategories((prev) => (prev.some((c) => c.id === category.id) ? prev : [...prev, category]));
    setSelectedCategoryIds((prev) => (prev.includes(category.id) ? prev : [...prev, category.id]));
  }

  function handleToggleCategory(categoryId: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((cid) => cid !== categoryId) : [...prev, categoryId]
    );
  }

  function saveEdits() {
    if (!place) return;
    updatePlace(place.id, { name, address, memo });
    assignCategories(place.id, selectedCategoryIds);
    setEditing(false);
    setPlace({ ...place, name, address, memo });
  }

  async function copyAddress() {
    if (!place) return;
    await Clipboard.setStringAsync(place.address);
    Alert.alert('주소를 복사했어요');
  }

  function openInMaps() {
    if (!place) return;
    const label = encodeURIComponent(place.name);
    const query = encodeURIComponent(place.address);
    const hasCoords = place.latitude != null && place.longitude != null;
    const fallback = `https://maps.google.com/?q=${query}`;
    const url =
      Platform.select({
        ios: hasCoords ? `maps://?ll=${place.latitude},${place.longitude}&q=${label}` : `maps://?q=${query}`,
        android: hasCoords ? `geo:${place.latitude},${place.longitude}?q=${place.latitude},${place.longitude}(${label})` : `geo:0,0?q=${query}`,
        default: fallback,
      }) ?? fallback;
    Linking.openURL(url).catch(() => Linking.openURL(fallback));
  }

  function openAddressOptions() {
    if (!place || !place.address) return;
    Alert.alert('주소', undefined, [
      { text: '주소 복사', onPress: copyAddress },
      { text: '지도에서 보기', onPress: openInMaps },
      { text: '취소', style: 'cancel' },
    ]);
  }

  function confirmDelete() {
    if (!place) return;
    Alert.alert('삭제할까요?', `"${place.name}" 기록을 삭제합니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deletePlace(place.id);
          router.back();
        },
      },
    ]);
  }

  if (!place) {
    // Reached via a stale deep link, or the record was deleted on another screen.
    if (!loaded) return null;
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>찾을 수 없는 기록이에요.</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.replace('/list')}>
          <Text>보관함으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {photos.map((photo) => (
          <CarouselPhoto key={photo.id} photo={photo} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {editing ? (
          <>
            <TextInput style={styles.inputSerif} value={name} onChangeText={setName} />
            <TextInput style={styles.inputMono} value={address} onChangeText={setAddress} />
            <TextInput style={styles.inputMono} value={memo} onChangeText={setMemo} multiline />
            <CategoryTagInput
              allCategories={categories}
              selectedIds={selectedCategoryIds}
              onToggle={handleToggleCategory}
              onCreate={handleCreateCategory}
            />
          </>
        ) : (
          <>
            <Text style={styles.name}>{place.name}</Text>
            <Pressable onPress={openAddressOptions}>
              <Text style={styles.addr}>{place.address}</Text>
            </Pressable>
            <Text style={styles.memo}>{place.memo}</Text>
          </>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={() => (editing ? saveEdits() : setEditing(true))}>
            <Text>{editing ? '저장' : '수정'}</Text>
          </Pressable>
          <Pressable style={[styles.iconBtn, styles.deleteBtn]} onPress={confirmDelete}>
            <Text style={{ color: colors.stampRed }}>삭제</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  slide: { width: screenWidth, height: 260 },
  slideEmpty: { backgroundColor: colors.sand },
  missing: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  missingText: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted },
  body: { padding: 18, gap: 10 },
  name: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  addr: { fontFamily: fonts.mono, fontSize: 12, color: colors.sageOlive },
  memo: { fontFamily: fonts.serifItalic, fontSize: 14, color: colors.sepia, marginTop: spacing.sm },
  inputSerif: { fontFamily: fonts.serif, fontSize: 20, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  inputMono: { fontFamily: fonts.mono, fontSize: 13, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  iconBtn: { borderWidth: 1, borderColor: colors.mist, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 16 },
  deleteBtn: { borderColor: colors.stampRed },
});
