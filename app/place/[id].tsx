import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TextInput, Pressable, Alert, StyleSheet, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { getPlaceWithPhotos, updatePlace, deletePlace } from '../../src/db/placesRepo';
import type { Place, Photo } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!id) return;
    const result = getPlaceWithPhotos(id);
    if (!result) return;
    setPlace(result.place);
    setPhotos(result.photos);
    setName(result.place.name);
    setAddress(result.place.address);
    setMemo(result.place.memo);
  }, [id]);

  function saveEdits() {
    if (!place) return;
    updatePlace(place.id, { name, address, memo });
    setEditing(false);
    setPlace({ ...place, name, address, memo });
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

  if (!place) return null;

  return (
    <ScrollView style={styles.screen}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {photos.map((photo) => (
          <Image key={photo.id} source={{ uri: photo.localUri }} style={{ width: screenWidth, height: 260 }} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {editing ? (
          <>
            <TextInput style={styles.inputSerif} value={name} onChangeText={setName} />
            <TextInput style={styles.inputMono} value={address} onChangeText={setAddress} />
            <TextInput style={styles.inputMono} value={memo} onChangeText={setMemo} multiline />
          </>
        ) : (
          <>
            <Text style={styles.name}>{place.name}</Text>
            <Text style={styles.addr}>{place.address}</Text>
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
  body: { padding: 18, gap: 10 },
  name: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  addr: { fontFamily: fonts.mono, fontSize: 12, color: colors.sageOlive },
  memo: { fontFamily: fonts.serifItalic, fontSize: 14, color: '#4A3728', marginTop: 8 },
  inputSerif: { fontFamily: fonts.serif, fontSize: 20, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  inputMono: { fontFamily: fonts.mono, fontSize: 13, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  iconBtn: { borderWidth: 1, borderColor: colors.mist, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 16 },
  deleteBtn: { borderColor: colors.stampRed },
});
