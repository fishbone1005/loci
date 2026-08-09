import { Platform } from 'react-native';

export const colors = {
  paper: '#F5EFE2',
  ink: '#221F1B',
  stampRed: '#A8443B',
  gold: '#C6A15B',
  sageOlive: '#7E8566',
  mist: '#DED5C2',
  wine: '#5C2430',
  muted: '#8A8073',
  frame: '#EADFC6',
  sand: '#E3D7BD',
  inkSoft: '#5C554A',
  sepia: '#4A3728',
} as const;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  serifItalic: Platform.select({ ios: 'Georgia-Italic', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
