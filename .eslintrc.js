module.exports = {
  extends: '@sourcegraph/eslint-config',
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    project: ['template/tsconfig.json', 'shared/tsconfig.json', 'dev/scripts/tsconfig.json'],
  },
  ignorePatterns: ['temp', '**/dist', 'samples'],
  rules: {},
}
