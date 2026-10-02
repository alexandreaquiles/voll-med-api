/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/test/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/test/ambiente.ts'],
  // Os imports relativos usam extensão .js (ESM), mas os arquivos de origem são .ts
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }]
  }
}
