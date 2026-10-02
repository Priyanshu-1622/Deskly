const noUnsanitized = require('eslint-plugin-no-unsanitized');
module.exports = [{ ignores: ['node_modules/**', 'dist/**', '.cache/**', 'src/renderer/vendor/**'] }, {
  files: ['src/**/*.js', 'tools/**/*.cjs', 'test/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
  plugins: { 'no-unsanitized': noUnsanitized },
  rules: { 'no-unsanitized/method': 'error', 'no-unsanitized/property': ['error', { escape: { methods: ['md', 'DesklyUI.md'] } }], 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
}];
