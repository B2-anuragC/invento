// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Icon fonts must go through components/ui/icon.tsx, which hides them from screen readers.
    files: ['app/**', 'components/**'],
    ignores: ['components/ui/icon.tsx', 'components/ui/icon-symbol.tsx', 'components/ui/icon-symbol.ios.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: '@expo/vector-icons', message: "Use Ionicons from '@/components/ui/icon'." }], patterns: [{ group: ['@expo/vector-icons/*'], message: "Use Ionicons from '@/components/ui/icon'." }] }],
    },
  },
]);
