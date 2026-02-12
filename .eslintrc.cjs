module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // 显式 any 只产生警告
    '@typescript-eslint/no-explicit-any': 'warn',
    // 禁用未使用变量的检查
    '@typescript-eslint/no-unused-vars': 'off',
    // 禁用未使用参数的检查
    'no-unused-vars': 'off',
  },
}
