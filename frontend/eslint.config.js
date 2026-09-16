import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Teto de tamanho de arquivo (lição do SGC anterior: um PipeWorkspace.tsx
      // de 17 mil linhas). Tela que passa disso se divide, não pede exceção.
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
      // Guarda-corpo dos SDKs Mitra — NUNCA desabilitar estas regras.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'mitra-sdk',
              allowImportNames: ['manageUserAccessMitra', 'listProjectUsersMitra'],
              message:
                'mitra-sdk é exclusiva de scripts de backend — em telas use mitra-interactions-sdk (mesmos nomes de função). Única exceção permitida: manageUserAccessMitra/listProjectUsersMitra em tela de gestão de usuários restrita a dev, com avisos visíveis na tela.',
            },
            {
              name: 'mitra-interactions-sdk',
              importNames: [
                'listRecordsMitra',
                'getRecordMitra',
                'createRecordMitra',
                'updateRecordMitra',
                'patchRecordMitra',
                'deleteRecordMitra',
                'createRecordsBatchMitra',
              ],
              message:
                'CRUD REST NUNCA em telas (retorna 403 para usuários business). Use Server Functions via executeServerFunctionMitra.',
            },
          ],
        },
      ],
    },
  },
  {
    // Depois do bloco principal (o flat config aplica na ordem): os primitivos
    // do shadcn exportam as variantes (cva) ao lado do componente, por
    // convenção do design system, e a regra do fast refresh não vale ali.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // O vocabulário do design system (page.tsx) e os primitivos vêm do kit da
    // Benenutri e são revisados lá; o teto de linhas é para o código do projeto.
    // O bloco §8.7 (gráficos) exporta `corDeSerie`/`tomDeIntensidade` ao lado
    // dos componentes, por decisão do kit (a tela importa cor e moldura do
    // mesmo lugar, R-080) — a regra de fast refresh não vale aqui, como já não
    // vale em `ui/`.
    files: ['src/components/page.tsx', 'src/components/ui/**/*.tsx'],
    rules: { 'max-lines': 'off', 'react-refresh/only-export-components': 'off' },
  },
])
