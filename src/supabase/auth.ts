import { supabase } from './client';

export function mapAuthError(error: { message: string } | null): string {
  if (!error) return '';
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('already registered')) return '이미 가입된 이메일입니다.';
  if (msg.includes('password')) return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('network')) return '네트워크 연결을 확인해주세요.';
  return '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.';
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(mapAuthError(error));
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error));
  return data;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
