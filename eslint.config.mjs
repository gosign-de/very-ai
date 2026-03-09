import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";
import tailwindcss from "eslint-plugin-tailwindcss";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/build/**",
      "**/.contentlayer/**",
      "**/public/**",
      "**/.supabase/**",
      "**/supabase/types.ts",
      "**/coverage/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      tailwindcss,
      "unused-imports": unusedImports,
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
        config: "tailwind.config.js",
      },
      react: {
        version: "detect",
      },
    },

    rules: {
      "tailwindcss/no-custom-classname": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "unused-imports/no-unused-imports": "error",
      "no-console": "off",
    },
  },
];
