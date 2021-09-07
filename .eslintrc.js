module.exports = {
  extends: '@sourcegraph/eslint-config',
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    project: ['template/tsconfig.json', 'dev/scripts/tsconfig.json'],
  },
  ignorePatterns: ['generated-*', '**/dist', 'samples'],
  rules: {},
}
