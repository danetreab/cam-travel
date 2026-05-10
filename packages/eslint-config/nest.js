import { config as baseConfig } from "./base.js";

/**
 * Shared ESLint configuration for NestJS backend apps.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
