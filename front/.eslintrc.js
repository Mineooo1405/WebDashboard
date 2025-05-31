module.exports = {
  // Tạm thời vô hiệu hóa parser
  // parser: '@typescript-eslint/parser',
  extends: [
    'react-app',
    'react-app/jest',
  ],
  rules: {
    // Các rule khác
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};