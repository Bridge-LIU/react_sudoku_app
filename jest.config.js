module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/ui/**/*.test.tsx', '**/src/state/**/*.test.tsx'],
  // @testing-library/react-native v12+ 是 matcher を自動登録するので setup 不要
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
