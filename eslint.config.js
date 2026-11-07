import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'cdk.out'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Plugins e handlers do Fastify são async por contrato, mesmo sem await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
