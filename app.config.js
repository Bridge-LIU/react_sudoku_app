module.exports = {
  name: 'Sudoku',
  slug: 'sudoku',
  owner: 'bridgeliu',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'sudoku',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#FFFBF0',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'vc.bridge.sudoku',
  },
  android: {
    package: 'vc.bridge.sudoku',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#FFFBF0',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: ['expo-router', 'expo-localization'],
  experiments: { typedRoutes: true },
  extra: {
    useMocks: true,
    apiBaseUrl: '/api',
    appVersion: '0.1.0',
    eas: {
      projectId: '1adfc2fc-7fbd-417d-8157-7f1ba2e04dbe',
    },
  },
};
