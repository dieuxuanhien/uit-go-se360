module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['**/*.d.ts', 'dist', 'node_modules', 'coverage', '.eslintrc.js', '*.config.*js'],
  rules: {
    '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
  overrides: [
    {
      files: ['*.spec.ts', '*.test.ts', '**/*.e2e-spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-console': 'off',
      },
    },
  ],
};
