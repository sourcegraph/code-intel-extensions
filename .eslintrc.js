module.exports = {
  extends: '@sourcegraph/eslint-config',
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    project: ['extensions/**/tsconfig.json', 'shared/tsconfig.json'],
  },
  ignorePatterns: ['temp'],
  rules: {},
}
