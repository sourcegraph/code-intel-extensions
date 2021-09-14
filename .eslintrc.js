module.exports = {
  extends: '@sourcegraph/eslint-config',
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    project: ['template/tsconfig.json', 'scripts/tsconfig.json'],
  },
  ignorePatterns: ['generated-*', '**/dist'],
  rules: {
    // [...a] breaks when Array.from(a) works
    // when a is not an array but an iterable
    'unicorn/prefer-spread': 0,
  },
}
