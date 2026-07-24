import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Sudoku',
  slug: 'sudoku',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'sudoku',
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: true },
  android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' } },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router', 'expo-localization'],
  experiments: { typedRoutes: true },
  extra: {
    useMocks: true,
    apiBaseUrl: '/api',
    appVersion: '0.1.0',
  },
};

export default config;
