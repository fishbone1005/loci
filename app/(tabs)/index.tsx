import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '../../src/theme/tokens';
import { getCurrentAddress } from '../../src/location/reverseGeocode';
import { createPlace } from '../../src/db/placesRepo';
import { persistPhotos } from '../../src/storage/photoFiles';
import { runSync } from '../../src/sync/runSync';

export default function CaptureScreen() {
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  // A ref, not the state flag: `save()` is synchronous, so a second tap can fire
  // before React re-renders with `saving === true` and would read stale field state.
  const savingRef = useRef(false);

  // Re-arm when the user comes back to the tab after a save navigated away.
  useFocusEffect(
    useCallback(() => {
      savingRef.current = false;
      setSaving(false);
    }, [])
  );

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요해요', '설정에서 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      // Copy out of the picker's cache directory right away — the OS can purge it.
      setPhotoUris(await persistPhotos(result.assets.map((asset) => asset.uri)));
    }
  }

  async function detectLocation() {
    setLocating(true);
    const result = await getCurrentAddress();
    setLocating(false);
    if (!result) {
      Alert.alert('위치 접근 권한이 필요해요', '주소를 직접 입력해주세요.');
      return;
    }
    setAddress(result.address);
    setCoords({ latitude: result.latitude, longitude: result.longitude });
  }

  function save() {
    if (savingRef.current) return;
    if (!name.trim()) {
      Alert.alert('가게 이름을 입력해주세요.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    // Always written as an unowned local row; login claims it (claimLocalPlaces)
    // so the save path never waits on the network.
    createPlace(
      {
        name: name.trim(),
        address,
        memo,
        photoUris,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      },
      null
    );
    runSync().catch(() => {});
    setPhotoUris([]);
    setName('');
    setAddress('');
    setMemo('');
    setCoords(null);
    router.replace('/list');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>새 장소 기록</Text>

      <Pressable style={styles.photoFrame} onPress={pickPhotos}>
        {photoUris.length > 0 ? (
          <Image source={{ uri: photoUris[0] }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoPlaceholder}>사진 선택 / 촬영</Text>
        )}
      </Pressable>

      <Text style={styles.label}>가게명</Text>
      <TextInput style={styles.inputSerif} value={name} onChangeText={setName} placeholder="이름을 적어주세요" />

      <Text style={styles.label}>주소</Text>
      <View style={styles.addressRow}>
        <TextInput
          style={[styles.inputMono, styles.addressInput]}
          value={address}
          onChangeText={setAddress}
          placeholder="주소를 입력해주세요"
        />
        <Pressable style={styles.locationButton} onPress={detectLocation} disabled={locating}>
          <Text style={styles.locationButtonText}>
            {locating ? '위치 확인 중...' : '현재 위치 가져오기'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={styles.inputMono}
        value={memo}
        onChangeText={setMemo}
        placeholder="비 오는 날 가면 더 좋다..."
        multiline
      />

      <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
        <Text style={styles.saveButtonText}>
          {saving ? '저장 중...' : '오늘의 한 페이지 저장하기'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 18, gap: 14 },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginBottom: spacing.xs },
  photoFrame: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.frame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  photoPreview: { width: '100%', height: '100%', borderRadius: 2 },
  photoPlaceholder: { color: colors.ink },
  label: { fontSize: 11, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  addressInput: { flex: 1 },
  locationButton: {
    borderWidth: 1,
    borderColor: colors.sageOlive,
    borderRadius: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
  },
  locationButtonText: { fontSize: 11, color: colors.sageOlive },
  inputSerif: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: spacing.sm,
  },
  inputMono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: spacing.sm,
  },
  saveButton: {
    backgroundColor: colors.stampRed,
    borderRadius: 5,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: { color: colors.paper, fontWeight: '600' },
});
