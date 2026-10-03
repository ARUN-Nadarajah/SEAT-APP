/**
 * Jest setup for component tests.
 *
 * Keeps tests hermetic: no network, no storage, no native modules.
 */
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiUrl: 'http://localhost:5000/api' } },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Silence React Native's experimental renderer noise in test output.
jest.spyOn(console, 'warn').mockImplementation(() => {});

// RNTL v14 custom matchers, e.g. toHaveAccessibilityState.
require('@testing-library/react-native/matchers');
