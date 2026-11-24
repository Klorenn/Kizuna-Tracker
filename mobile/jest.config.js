/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}", "<rootDir>/src/**/*.test.{ts,tsx}"],
  modulePaths: ["<rootDir>/node_modules"], // so shared ../src files resolve packages from here, never from the root
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/../src/$1",
    "^~/(.*)$": "<rootDir>/src/$1",
  },
};
