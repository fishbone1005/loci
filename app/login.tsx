import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '../src/theme/tokens';
import { signIn, signUp, signOut } from '../src/supabase/auth';
import { supabase } from '../src/supabase/client';
import { claimLocalPlaces } from '../src/db/placesRepo';
import { claimLocalCategories } from '../src/db/categoriesRepo';
import { pullRemoteData } from '../src/sync/pull';
import { runSync } from '../src/sync/runSync';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ email: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession({ email: data.session.user.email ?? '' });
    });
  }, []);

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password);
        if (!result.session) {
          // Email confirmation is on: there's no session yet, so nothing to sync.
          Alert.alert('가입 완료!', '이메일을 확인해주세요. 인증 후 로그인할 수 있어요.');
          setMode('signIn');
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (userId) {
        // Adopt everything recorded while logged out before pulling/pushing —
        // `user_id = NULL` rows can never pass the RLS policy otherwise.
        claimLocalPlaces(userId);
        claimLocalCategories(userId);
        await pullRemoteData(userId);
        runSync().catch(() => {});
        setSession({ email: data.session!.user.email ?? '' });
      }
      router.replace('/list');
    } catch (error: any) {
      Alert.alert(mode === 'signIn' ? '로그인 실패' : '회원가입 실패', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut();
    setSession(null);
  }

  if (session) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Loci</Text>
        <Text style={styles.subtitle}>{session.email}로 로그인됨</Text>
        <Pressable style={styles.button} onPress={logout}>
          <Text style={styles.buttonText}>로그아웃</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Loci</Text>
      <Text style={styles.subtitle}>클라우드 백업을 위해 로그인하세요</Text>

      <TextInput
        style={styles.input}
        placeholder="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />

      <Pressable style={styles.button} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? '처리 중...' : mode === 'signIn' ? '로그인' : '회원가입'}</Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        <Text style={styles.switch}>{mode === 'signIn' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/list')}>
        <Text style={styles.skip}>나중에 하기 (로그인 없이 계속)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, justifyContent: 'center', gap: 12 },
  title: { fontSize: 32, color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.sageOlive, textAlign: 'center', marginBottom: 20 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 10 },
  button: { backgroundColor: colors.stampRed, borderRadius: 5, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: colors.paper, fontWeight: '600' },
  switch: { textAlign: 'center', color: colors.sageOlive, marginTop: spacing.md, fontSize: 12 },
  skip: { textAlign: 'center', color: colors.muted, marginTop: spacing.sm, fontSize: 12 },
});
