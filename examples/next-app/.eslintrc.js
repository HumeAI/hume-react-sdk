/*eslint-env commonjs*/
// @ts-check
/** @type {import('eslint').ESLint.Options} */
module.exports = {
  root: true,
  plugins: [
    'jest',
    'import',
    '@typescript-eslint',
    'prettier',
    'react',
    'react-hooks',
    'jsx-a11y',
    'storybook',
    'filename-rules',
    'compat',
  ],
  extends: [
    'eslint:recommended',
    'plugin:jsx-a11y/strict',
    'plugin:@next/next/core-web-vitals',
    'plugin:prettier/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:storybook/recommended',
    'plugin:tailwindcss/recommended',
    'plugin:compat/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  ignorePatterns: [
    'src/containers/Views/Playground/mocks/*.ts',
    '!.storybook',
    '!.lintstagedrc.js',
    '!.prettierrc.js',
    '!next-env.d.ts',
    'e2e/**/*',
  ],
  settings: {
    react: {
      version: 'detect',
    },
    tailwindcss: {
      config: 'tailwind.config.ts',
      callees: ['classnames', 'cn', 'cva'],
      cssFiles: [
        // load valid classnames from css files
        './src/**/*.css',
        '!**/node_modules',
      ],
    },
  },
  overrides: [
    // don't use default exports unless exporting a next.js api handler or page component
    {
      files: ['./src/**/*.ts', './src/**/*.tsx'],
      excludedFiles: [
        'src/pages/**/*',
        'src/**/?(*.)stories.tsx',
        '.storybook/main.ts',
      ],
      rules: {
        'import/no-default-export': 'error',
      },
    },
    // don't import "boring-avatars" from outside of the /components/core/Avatar folder
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      excludedFiles: ['src/components/core/Avatar/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: ['boring-avatars'],
          },
        ],
      },
    },
    // don't import "@radix-ui/react-alert-dialog" outside of the /components/core/AlertDialog folder
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      excludedFiles: ['src/components/core/AlertDialog/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: ['@radix-ui/react-alert-dialog'],
          },
        ],
      },
    },
    // don't import "react-query" from outside of the /api folder
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      excludedFiles: ['src/api/**/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@tanstack/react-query',
                importNames: ['useQuery', 'useMutation', 'useInfiniteQuery'],
                message: 'Please create a hook inside `$/api` folder instead',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      extends: [
        'airbnb-typescript',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
      ],
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/quotes': 'off',
        '@typescript-eslint/indent': 'off',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/dot-notation': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
        '@typescript-eslint/no-use-before-define': [2, { functions: false }],
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'variable',
            format: ['PascalCase', 'camelCase', 'UPPER_CASE'],
            leadingUnderscore: 'allow',
            trailingUnderscore: 'allow',
          },
        ],
        'import/extensions': 'off',
      },
    },
    {
      files: [
        './src/**/*.ts',
        './src/**/*.tsx',
        './src/**/*.js',
        './src/**/*.jsx',
      ],
      rules: {
        'no-restricted-imports': [
          'warn',
          {
            paths: ['styled-components', '@mui/material'],
          },
        ],
      },
    },
    {
      files: ['./e2e/**/*.ts', './e2e/**/*.tsx'],
      extends: ['plugin:playwright/recommended'],
      rules: {
        // Relax strict TypeScript rules for e2e tests
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        'playwright/expect-expect': 'off',
        'prettier/prettier': 'off',
      },
    },
  ],
  rules: {
    'arrow-body-style': 'off',
    'no-debugger': 'error',
    'no-nested-ternary': 'error',
    'prettier/prettier': 'error',
    eqeqeq: 'error',
    'jest/no-focused-tests': 'error',
    'react/jsx-key': [
      'error',
      {
        checkFragmentShorthand: true,
      },
    ],
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/hook-use-state': 'error',
    'react/jsx-no-leaked-render': 'error',
    'import/no-unresolved': 'off',
    'no-void': 'off',
    'no-console': 'error',
    'sort-imports': [
      'error',
      {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      },
    ],
    'import/order': [
      'error',
      {
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
        groups: [
          //
          ['external', 'builtin'],
          ['internal'],
          ['index', 'sibling', 'parent'],
        ],
        // keep "$/" imports within the "external" group
        pathGroups: [
          { group: 'external', pattern: '$/**' },
          { group: 'external', pattern: '$storybook/**' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
      },
    ],
    'jsx-a11y/label-has-associated-control': [
      2,
      {
        labelComponents: ['Label'],
        labelAttributes: ['label', 'aria-label'],
        controlComponents: [
          'Input',
          'Select',
          'Textarea',
          'Checkbox',
          'Radio',
          'Switch',
        ],
        depth: 3,
      },
    ],
    'filename-rules/not-match': [
      'warn',
      /(types|styles|logic|connect)\.ts(x)?$/,
    ],
    // cspell:ignore classname
    'tailwindcss/no-custom-classname': 'error',
  },
};
