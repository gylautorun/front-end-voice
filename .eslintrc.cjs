module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'backend'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  overrides: [
    {
      // server 使用 Node CommonJS，不能套用根配置的浏览器全局变量规则。
      files: ['server/**/*.js'],
      // 启用 process、require 等 Node 全局变量，并关闭浏览器全局变量。
      env: { node: true, browser: false },
      rules: {
        // server/package.json 未声明 ESM，因此允许使用 CommonJS require。
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
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
