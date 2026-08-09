import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { getCurrentAddress } from '../../src/location/reverseGeocode';
import { createPlace } from '../../src/db/placesRepo';
import { runSync } from '../../src/sync/runSync';
import { getCurrentUserId } from '../../src/supabase/auth';

export default function CaptureScreen() {
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

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
      setPhotoUris(result.assets.map((asset) => asset.uri));
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

  async function save() {
    if (!name.trim()) {
      Alert.alert('가게 이름을 입력해주세요.');
      return;
    }
    const userId = await getCurrentUserId();
    createPlace(
      {
        name: name.trim(),
        address,
        memo,
        photoUris,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      },
      userId
    );
    runSync().catch(() => {});
    setPhotoUris([]);
    setName('');
    setAddress('');
    setMemo('');
    setCoords(null);
    router.push('/list');
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

      <Text style={styles.label}>주소 · GPS 자동입력</Text>
      <Pressable onPress={detectLocation}>
        <TextInput
          style={styles.inputMono}
          value={address}
          onChangeText={setAddress}
          placeholder={locating ? '위치 확인 중...' : '탭해서 현재 위치 가져오기'}
        />
      </Pressable>

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={styles.inputMono}
        value={memo}
        onChangeText={setMemo}
        placeholder="비 오는 날 가면 더 좋다..."
        multiline
      />

      <Pressable style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>오늘의 한 페이지 저장하기</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 18, gap: 14 },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginBottom: 4 },
  photoFrame: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: '#EADFC6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  photoPreview: { width: '100%', height: '100%', borderRadius: 2 },
  photoPlaceholder: { color: colors.ink },
  label: { fontSize: 11, letterSpacing: 1, color: '#8A8073', textTransform: 'uppercase' },
  inputSerif: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: 8,
  },
  inputMono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: 8,
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
