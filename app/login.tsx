import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme/tokens';
import { signIn, signUp, signOut } from '../src/supabase/auth';
import { supabase } from '../src/supabase/client';
import { pullRemotePlaces } from '../src/sync/pull';

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
        await signUp(email, password);
      }
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (userId) {
        await pullRemotePlaces(userId);
        setSession({ email: data.session!.user.email ?? '' });
      }
      router.replace('/list');
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message);
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
  screen: { flex: 1, backgroundColor: colors.paper, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 32, color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.sageOlive, textAlign: 'center', marginBottom: 20 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 10 },
  button: { backgroundColor: colors.stampRed, borderRadius: 5, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: colors.paper, fontWeight: '600' },
  switch: { textAlign: 'center', color: colors.sageOlive, marginTop: 16, fontSize: 12 },
  skip: { textAlign: 'center', color: '#8A8073', marginTop: 8, fontSize: 12 },
});
