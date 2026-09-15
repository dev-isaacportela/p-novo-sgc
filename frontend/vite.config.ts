import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `dedupe` e `fs.allow` existem por causa do desenvolvimento local da lib
// @benenutri/mitra-kanban linkada de ../../mitra-kanban (npm link): sem dedupe
// o React da lib seria outra cópia (hooks quebram); sem allow o Vite recusa
// servir arquivos fora da raiz. No sandbox (pacote do registry) são inertes.
const LIB_LOCAL = fileURLToPath(new URL('../../mitra-kanban', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'radix-ui', 'cmdk', 'lucide-react'],
  },
  server: {
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), LIB_LOCAL] },
  },
});
