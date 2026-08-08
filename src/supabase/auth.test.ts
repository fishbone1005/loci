import '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../supabase/client', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

import { mapAuthError } from './auth';

describe('mapAuthError', () => {
  test('maps invalid credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.'
    );
  });

  test('maps duplicate signup', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe('이미 가입된 이메일입니다.');
  });

  test('maps weak password', () => {
    expect(mapAuthError({ message: 'Password should be at least 6 characters' })).toBe(
      '비밀번호는 6자 이상이어야 합니다.'
    );
  });

  test('maps network errors', () => {
    expect(mapAuthError({ message: 'Network request failed' })).toBe('네트워크 연결을 확인해주세요.');
  });

  test('falls back to a generic message for unknown errors', () => {
    expect(mapAuthError({ message: 'weird server blip' })).toBe(
      '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.'
    );
  });

  test('returns empty string for no error', () => {
    expect(mapAuthError(null)).toBe('');
  });
});
