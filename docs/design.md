# Design System — painel administrativo (versão portável)

Documento autocontido do sistema visual usado no **Busca 360 / Banco de
Produtos Benenutri**, escrito para ser levado para **outro projeto**. Renomeie
para `design.md` no destino.

Ele descreve três coisas, nesta ordem de importância:

1. **as bibliotecas** e por que cada uma está lá (e o que deliberadamente não está);
2. **os tokens** — cor, fonte, raio — que moram em um único arquivo CSS;
3. **os componentes** — dois níveis: primitivos do shadcn/ui e o vocabulário do produto.

O tom é *light*, superfície branca sólida sobre fundo cinza-esverdeado, acento
verde corporativo, tabela minimalista sem zebra e sem selo preenchido. É um
painel operacional: densidade alta, ruído baixo, nada decorativo.

Regra de ouro herdada: **onde este documento e o código divergirem, um dos dois
está errado — descubra qual antes de mudar qualquer coisa.**

> **Quadro adicionado em 2026-09-09** (§8.5 e §9.6): `Board`, `BoardColumn` e
> `BoardCard`, com a coluna de altura fixa em que só a pilha de cartões rola.
> A altura é do quadro, pelo `height` do `Board` (`curto` / `padrao` / `alto`),
> não da coluna. Nenhum componente existente mudou; a numeração de §8 abriu
> espaço (o antigo §8.5 Tabela virou §8.6).
>
> **Tema escuro adicionado em 2026-09-09** (§2.1): uma camada `.dark` de tokens
> em `index.css`, `src/lib/theme.ts` e `ThemeToggle`. Nenhum componente mudou.
> A ausência "sem tema escuro" da §1.4 deixou de valer (constitution 2.1.0).
>
> **Portado para Tailwind 4 em 2026-08-27.** A versão original deste documento
> descrevia Tailwind 3 (triplas HSL cruas + `<alpha-value>` + `tailwind.config.js`).
> Este projeto ficou na v4, que o template da Mitra já trazia, então §1, §2 e §3
> descrevem a mecânica da v4: as cores são `hsl()` completo, o modificador de
> opacidade é nativo, e o antigo `tailwind.config.js` virou um bloco `@theme`
> dentro do próprio `index.css`. **O contrato de nomes de token não mudou** —
> `bg-card`, `text-ink-secondary`, `border-rule-row` e `bg-brand-50` significam
> exatamente o mesmo, que é o que mantém as §4 a §14 válidas sem uma linha de
> alteração.

---

## 1. Stack e bibliotecas

### 1.1 Base

| Biblioteca | Versão de referência | Papel |
| --- | --- | --- |
| `react` / `react-dom` | ^19.2 | UI |
| `typescript` | ~5.9 | Tipos; `tsc -b` roda **antes** do build (a checagem é parte do build, não um script opcional) |
| `vite` | ^7.2 | Dev server e bundler |
| `@vitejs/plugin-react` | ^5.1 | HMR + JSX |
| `tailwindcss` | ^4.1 | **Tailwind 4.** Sem `tailwind.config.js`: o tema mora num bloco `@theme` no `index.css` |
| `@tailwindcss/vite` | ^4.1 | Pipeline do Tailwind. Substitui o par `postcss` + `autoprefixer` da v3 |
| `react-router-dom` | ^7.16 | Rotas |
| `mitra-interactions-sdk` | 1.0.61 | Acesso a dado e autenticação. **Ocupa o lugar do `axios`** da versão original: aqui a camada de dados é a da plataforma, e adicionar um cliente HTTP em paralelo contrariaria a §1.4 |

### 1.2 Camada visual

| Biblioteca | Versão | Papel | Por que ela e não outra |
| --- | --- | --- | --- |
| `radix-ui` | ^1.6 | Diálogo, popover, abas, rótulo e `Slot` | Pacote **unificado**. O shadcn atual gera `import { Dialog } from "radix-ui"`, não os `@radix-ui/react-*` avulsos — instalar os avulsos junto duplica a biblioteca em memória |
| `cmdk` | ^1.1 | Lista filtrável do combobox | Type-ahead, que o `<select>` nativo dava de graça |
| `class-variance-authority` | ^0.7 | Variantes de componente | `cva` é o formato que o shadcn gera |
| `clsx` + `tailwind-merge` | ^2.1 / ^3.6 | `cn()` | `twMerge` desempata classe Tailwind conflitante na hora de sobrescrever |
| `tw-animate-css` | ^1.4 | `data-[state=open]:animate-in` | Animação de entrada/saída dos componentes Radix. É o sucessor do `tailwindcss-animate`, que era plugin de config e não tem lugar na v4 |
| `lucide-react` | ^0.563 | Ícones | Traço 2px, tamanho em `em`, casa com o peso da tipografia |
| `recharts` | ^3.8 | Gráficos | Só onde há gráfico (tela de estatísticas). O `chart.tsx` do shadcn atual já é o da v3 |

### 1.3 shadcn/ui — não é dependência

O shadcn/ui **não aparece no `package.json`**. Ele é um gerador: `npx shadcn add`
copia o `.tsx` para dentro do projeto. A partir daí **o arquivo é seu**, e é
nele que o padrão desta página está gravado.

Consequência prática: rodar `npx shadcn add button` de novo **reescreve** o
arquivo e apaga os ajustes. Ao trazer um componente novo, ajuste raio, altura,
tamanho de fonte e cor no próprio arquivo — é assim que nenhuma tela precisa
repetir classe.

### 1.4 O que deliberadamente **não** existe

Cada ausência abaixo é uma decisão, não um esquecimento:

- **Sem biblioteca de formulário** (react-hook-form, formik). Os formulários
  são `useState` + `onSubmit`; o volume de campos não paga uma camada.
- **Sem gerenciador de estado global** (redux, zustand). Contexto de auth e
  estado local por tela bastam.
- **Sem date picker.** Data é `<input type="date">` nativo: o calendário do
  sistema já traz teclado, leitor de tela e formato local prontos, e
  reescrevê-lo custaria mais do que a consistência visual ganharia.
- **Sem CSS-in-JS, sem CSS Modules.** Tailwind + um arquivo de tokens.
- **Sem biblioteca de toast.** Aviso é `Alert` no fluxo da tela, onde a ação
  aconteceu, e não some sozinho.
- **Sem `<select>` nativo** em painel (ver §9.3).
- **Sem biblioteca de drag-and-drop.** No quadro, o estado muda por um controle
  explícito dentro do cartão (§9.6): funciona no teclado e no toque, respeita
  permissão e não custa uma dependência para uma interação que exclui gente.

### 1.5 Instalação em um projeto novo

```bash
npm create vite@latest meu-painel -- --template react-ts
```

```bash
npm i react-router-dom class-variance-authority clsx tailwind-merge tw-animate-css lucide-react cmdk radix-ui
```

```bash
npm i -D tailwindcss @tailwindcss/vite @types/node
```

Na v4 não existe `npx tailwindcss init`: o plugin entra no `vite.config.ts` e o
tema vai para o `index.css`.

Alias `@` → `src` (necessário para o shadcn), em `vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

plugins: [react(), tailwindcss()],
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }
```

e o par correspondente em `tsconfig.app.json` **e também no `tsconfig.json` raiz**:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

O raiz não é opcional: num setup de *project references* ele costuma ter só
`files` e `references`, e é justamente ele que o CLI do shadcn lê. Sem os
`paths` lá, o CLI não resolve o alias e escreve os componentes numa pasta
literal chamada `@/` na raiz do projeto, em vez de `src/components/ui/`.

`components.json` na raiz do frontend — é o que o CLI do shadcn lê:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Componentes usados por este sistema:

```bash
npx shadcn@latest add alert badge button card chart command dialog input label popover table tabs textarea
```

`src/lib/utils.ts` (o CLI cria; conteúdo integral):

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Fontes no `index.html`, com `preconnect` para não pagar dois RTTs:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Work+Sans:wght@400;500;600;700&display=swap" />
<meta name="theme-color" content="#156b16" />
```

---

## 2. Tokens — `src/index.css`

**Fonte única de cor do projeto.** Trocar a paleta é mexer neste arquivo, não
em trezentas classes espalhadas pelas telas.

Na v4 o valor é **`hsl()` completo** — `hsl(120.7 67.2% 25.1%)` — e não a tripla
crua da v3. O modificador de opacidade (`bg-primary/90`) passou a ser nativo do
Tailwind e não precisa mais interpolar `<alpha-value>` dentro de uma função,
que era a única razão de a tripla existir. O hex legível continua no comentário
ao lado.

A estrutura são três blocos, e a ordem importa:

| Bloco | Papel |
| --- | --- |
| `:root` | Os valores crus. É aqui, e só aqui, que se troca a paleta |
| `@theme` | Tipografia. Declarada direto, sem passar por `:root` |
| `@theme inline` | Mapeia token → utilitária. `inline` faz a classe apontar para `var(--token)` em vez de copiar o valor — é o que mantém `:root` como fonte única |

Duas armadilhas específicas da v4, ambas resolvidas no arquivo abaixo:

1. **`@custom-variant dark` prende o tema a uma classe, não ao sistema.** Os
   primitivos do shadcn vêm com classes `dark:` embutidas e, na v4, `dark:`
   segue o `prefers-color-scheme` do SO por padrão — a paleta escura acenderia
   sozinha na máquina de quem usa o SO no escuro, mesmo que a pessoa quisesse o
   claro. Presa à classe `.dark` no `<html>`, a variante só acende quando
   `src/lib/theme.ts` decide (§2.1), e "seguir o sistema" vira uma das três
   escolhas em vez de o único comportamento.
2. **Nome de token não pode colidir com nome de utilitária.** `--font-title` no
   `@theme` gera a classe `font-title`; se `:root` também tivesse `--font-title`,
   um `@theme inline` referenciando a si mesmo daria referência circular. Por
   isso a tipografia vai direto no `@theme`, sem indireção.

```css
@import 'tailwindcss';
@import 'tw-animate-css';

/* ═══════════════════════════════════════════════════════════════════════
   Tema escuro por CLASSE, não por sistema (design.md §2.1). No Tailwind 4,
   `dark:` segue o prefers-color-scheme do SO por padrão; aqui a variante é
   presa à classe `.dark` no <html>, aplicada por src/lib/theme.ts (e pelo
   script inline do index.html, antes do React montar). Assim o tema é uma
   escolha da pessoa — claro, escuro ou "seguir o sistema" — e os `dark:`
   embutidos nos primitivos do shadcn só acendem quando a paleta escura
   abaixo está de fato ativa.
   ═══════════════════════════════════════════════════════════════════════ */
@custom-variant dark (&:is(.dark *));

/* ═══════════════════════════════════════════════════════════════════════
   FONTE ÚNICA DE COR DO PROJETO — design.md §2
   Trocar a paleta é mexer aqui, não nas telas. O hex legível fica no
   comentário; o valor é hsl() completo porque no Tailwind 4 o modificador
   de opacidade (bg-primary/90) opera sobre a cor pronta, sem precisar da
   tripla crua que a v3 exigia.
   ═══════════════════════════════════════════════════════════════════════ */
:root {
  /* ── vocabulário do shadcn/ui ── */
  --background: hsl(90 9.1% 95.7%);            /* #f4f5f3 — fundo da tela */
  --foreground: hsl(90 3.7% 10.6%);            /* #1b1c1a — texto */
  --card: hsl(0 0% 100%);                      /* #ffffff — superfície de componente */
  --card-foreground: hsl(90 3.7% 10.6%);
  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(90 3.7% 10.6%);
  --primary: hsl(120.7 67.2% 25.1%);           /* #156b16 — verde corporativo */
  --primary-foreground: hsl(0 0% 100%);
  --secondary: hsl(90 9.1% 95.7%);             /* #f4f5f3 — área rebaixada dentro de um componente */
  --secondary-foreground: hsl(90 3.7% 10.6%);
  --muted: hsl(90 9.1% 95.7%);
  --muted-foreground: hsl(103.6 5.6% 38.2%);   /* #5f675c — secundário, 5,9:1 sobre branco */
  --accent: hsl(109.1 40.7% 94.7%);            /* #eef7ec — realce e hover */
  --accent-foreground: hsl(120.8 67.6% 21.8%); /* #125d13 */
  --destructive: hsl(4.2 76.5% 40%);           /* #b42318 — risco e ação destrutiva */
  --destructive-foreground: hsl(0 0% 100%);
  --border: hsl(90 18.5% 89.4%);               /* #e4e9df — borda externa e de controle */
  --input: hsl(90 18.5% 89.4%);
  --ring: hsl(120.7 67.2% 25.1%);

  /* ── rampa da marca ── */
  --brand-50: hsl(109.1 40.7% 94.7%);          /* #eef7ec */
  --brand-100: hsl(111.8 36.7% 88.2%);         /* #d9ecd6 */
  --brand-200: hsl(112.5 36.4% 78.4%);         /* #b9dcb4 */
  --brand-300: hsl(115.1 35.3% 66.1%);         /* #8fc78a */
  --brand-400: hsl(120.8 33.6% 46.7%);         /* #4f9f50 */
  --brand-500: hsl(122 49.4% 34.9%);           /* #2d8530 */
  --brand-600: hsl(120.6 64.9% 29%);           /* #1a7a1b */
  --brand-800: hsl(120.8 67.6% 21.8%);         /* #125d13 */
  --brand-900: hsl(121 66.3% 17.5%);           /* #0f4a10 */
  --brand-950: hsl(121.7 71.4% 9.6%);          /* #072a08 */

  /* ── o que este design nomeia e o shadcn não tem ── */
  --row-border: hsl(94.3 21.2% 93.5%);         /* #eef2eb — separador entre linhas */
  --ink-muted: hsl(105 4.7% 49.8%);            /* #7c8579 — 3,8:1: só rótulo em caixa alta */
  --attention: hsl(35.1 74.5% 36.9%);          /* #a46a18 — atenção */
  --attention-bg: hsl(30 100% 97.3%);          /* #fff8f1 */
  --destructive-bg: hsl(5 85.7% 97.3%);        /* #fef3f2 */

  /* Contorno geral. Translúcido de propósito — nenhum uso precisa de
     modificador de opacidade em cima dele. */
  --border-soft: rgba(191, 202, 184, 0.38);

  /* Verde da MARCA (design.md §11). Não é --primary e não muda com o tema:
     existe como token só para a classe `text-brand-mark` não precisar de hex
     solto em componente. */
  --brand-mark: #45963d;

  /* Rampa de DADOS — cor de série (§12). Oito matizes em ordem fixa, mais
     quatro passos sequenciais. Não é a rampa da marca e não é paleta de
     estado. */
  --data-1: hsl(212.8 67.7% 50.2%);            /* #2a78d6 — azul */
  /* … --data-2 a --data-8, --data-seq-1 a --data-seq-4 */

  --radius: 0.75rem;

  color-scheme: light;
  /* Preço, contagem e código são lidos em coluna, não dentro de uma frase,
     e só alinham com figuras tabulares. */
  font-variant-numeric: tabular-nums;
}

/* ═══════════════════════════════════════════════════════════════════════
   TEMA ESCURO — design.md §2.1
   Mesmos nomes, valores invertidos; nenhum componente muda. Todo token de
   cor que existir em :root PRECISA existir aqui, senão a tela escura herda
   o valor claro naquele ponto. A rampa brand-* é invertida de propósito:
   `bg-brand-50` continua sendo "superfície sutil" e `text-brand-800`
   continua sendo "texto forte" nos dois temas. Contrastes medidos sobre
   --card (#1c1f1c): texto 13,9:1 · secundário 7,8:1 · primary 6,6:1 ·
   destructive 6,2:1 · attention 8,1:1 · ink-muted 4,6:1 (segue só rótulo).
   ═══════════════════════════════════════════════════════════════════════ */
.dark {
  /* ── vocabulário do shadcn/ui ── */
  --background: hsl(120 5% 7.8%);              /* #131513 — fundo da tela */
  --foreground: hsl(94.3 14.9% 90.8%);         /* #e7ebe4 — texto */
  --card: hsl(120 5.1% 11.6%);                 /* #1c1f1c — superfície de componente */
  --card-foreground: hsl(94.3 14.9% 90.8%);
  --popover: hsl(120 5.1% 11.6%);
  --popover-foreground: hsl(94.3 14.9% 90.8%);
  --primary: hsl(120.7 36.2% 53.9%);           /* #5fb460 — verde claro: o #156b16 some no escuro */
  --primary-foreground: hsl(123.6 73.3% 8.8%); /* #062708 — 6,3:1 sobre primary */
  --secondary: hsl(120 5.4% 14.5%);            /* #232723 — área rebaixada dentro de um componente */
  --secondary-foreground: hsl(94.3 14.9% 90.8%);
  --muted: hsl(120 5.4% 14.5%);
  --muted-foreground: hsl(101.5 7.9% 67.6%);   /* #aab3a6 — secundário, 7,8:1 sobre card */
  --accent: hsl(123.3 22.5% 15.7%);            /* #1f3120 — realce e hover */
  --accent-foreground: hsl(112.5 36.4% 78.4%); /* #b9dcb4 */
  --destructive: hsl(4.6 83.3% 69.4%);         /* #f27a70 — risco; o botão usa text-white sobre /60 */
  --destructive-foreground: hsl(5 60% 10%);    /* #290e0b */
  --border: hsl(120 5% 19.8%);                 /* #303530 — borda externa e de controle */
  --input: hsl(120 5% 19.8%);
  --ring: hsl(120.7 36.2% 53.9%);

  /* ── rampa da marca (invertida) ── */
  --brand-50: hsl(120 24.6% 13.5%);            /* #1a2b1a */
  --brand-100: hsl(113.1 29.5% 17.3%);         /* #22391f */
  --brand-200: hsl(116.7 29.5% 23.9%);         /* #2d4f2b */
  --brand-300: hsl(117.7 31.3% 32.5%);         /* #3b6d39 */
  --brand-400: hsl(120.8 33.6% 46.7%);         /* #4f9f50 */
  --brand-500: hsl(120 36.1% 57.6%);           /* #6cba6c */
  --brand-600: hsl(118.1 38.2% 67.6%);         /* #8fcc8d */
  --brand-800: hsl(112.5 36.4% 78.4%);         /* #b9dcb4 */
  --brand-900: hsl(111.8 36.7% 88.2%);         /* #d9ecd6 */
  --brand-950: hsl(109.1 40.7% 94.7%);         /* #eef7ec */

  /* ── o que este design nomeia e o shadcn não tem ── */
  --row-border: hsl(120 6.2% 15.9%);           /* #262b26 — separador entre linhas */
  --ink-muted: hsl(105 4.8% 51%);              /* #7f887c — 4,6:1: continua só rótulo em caixa alta */
  --attention: hsl(35.8 75.1% 60.6%);          /* #e6a94f — atenção */
  --attention-bg: hsl(37.9 51.4% 14.5%);       /* #382a12 */
  --destructive-bg: hsl(5.5 39.8% 16.3%);      /* #3a1c19 */

  /* Contorno geral, mais discreto que no claro: no escuro o filete
     translúcido clareia em vez de escurecer. */
  --border-soft: rgba(191, 202, 184, 0.16);

  /* A marca não muda com o tema. Onde o verde dela não lê (monograma sobre
     accent), o componente troca para accent-foreground — ver Logo.tsx. */
  --brand-mark: #45963d;

  /* Rampa de dados repassada para a superfície escura — mesma ordem, passos
     próprios: os oito passam de 3:1 contra o --card (§12). */
  --data-1: hsl(212.8 76.8% 56.1%);            /* #3987e5 — azul */
  /* … idem */

  /* Controles nativos (date, scrollbar, seleção) escurecem junto. */
  color-scheme: dark;
}

/* Tipografia — declarada direto no @theme: no Tailwind 4 as variáveis do
   tema já são custom properties reais, então não há ganho em passar por
   :root antes. */
@theme {
  --font-sans: 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-title: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* `inline` faz as utilitárias apontarem para var(--token) em vez de copiar
   o valor — é o que mantém :root como fonte única. */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-bg: var(--destructive-bg);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Apelidos do domínio. Existem porque `text-ink-secondary` diz mais numa
     tela do que `text-muted-foreground`. */
  --color-brand-50: var(--brand-50);
  --color-brand-100: var(--brand-100);
  --color-brand-200: var(--brand-200);
  --color-brand-300: var(--brand-300);
  --color-brand-400: var(--brand-400);
  --color-brand-500: var(--brand-500);
  --color-brand-600: var(--brand-600);
  --color-brand-700: var(--primary);
  --color-brand-800: var(--brand-800);
  --color-brand-900: var(--brand-900);
  --color-brand-950: var(--brand-950);
  --color-brand-mark: var(--brand-mark); /* verde da marca, fixo nos dois temas */

  --color-ground: var(--background);
  --color-paper: var(--card);
  --color-paper-sunken: var(--muted);

  --color-nav: var(--card);
  --color-nav-text: var(--muted-foreground);
  --color-nav-active: var(--primary);
  --color-nav-hover: var(--accent);

  /* Três pesos de filete, um por trabalho. */
  --color-rule: var(--border-soft);   /* contorno geral */
  --color-rule-table: var(--border);  /* fecha tabela e controle */
  --color-rule-row: var(--row-border);/* separa linhas */

  --color-ink: var(--foreground);
  --color-ink-secondary: var(--muted-foreground);
  --color-ink-muted: var(--ink-muted);

  --color-attention: var(--attention);
  --color-attention-bg: var(--attention-bg);
  --color-alert: var(--destructive);
  --color-alert-bg: var(--destructive-bg);

  /* Séries de gráfico — a rampa de dados, oito slots (§12). O nome é
     `data-N`, não `chart-N`. Mais `--color-data-seq-1…4`, a sequencial. */
  --color-data-1: var(--data-1);
  --color-data-2: var(--data-2);
  /* … até --color-data-8 e a rampa sequencial */

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
    margin: 0;
    min-height: 100vh;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    font-family: var(--font-sans);
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-title);
  }

  img {
    display: block;
    max-width: 100%;
  }

  /* Rede de segurança de foco: cada componente traz o próprio anel, este
     pega o que passar sem classe. */
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
}

/* Sanfona sem altura fixa: 0fr -> 1fr anima sem precisar medir o conteúdo. */
.collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 180ms ease;
}
.collapsible[data-open='true'] {
  grid-template-rows: 1fr;
}
.collapsible > * {
  overflow: hidden;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background-color: var(--background);
}
::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background-color: var(--muted-foreground);
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2.1 Tema escuro

O tema escuro é **uma camada de tokens**, não um segundo conjunto de
componentes: o bloco `.dark` em `index.css` redefine os mesmos nomes de
`:root` com valores invertidos, e todo `bg-card`, `text-ink-secondary` ou
`border-rule-row` das telas passa a resolver para o valor escuro. Se um
componente precisou de `dark:` solto, ou falta token ou a cor estava crua.

**Como a classe chega ao `<html>`.** `src/lib/theme.ts` guarda a escolha em
`localStorage` (chave `theme`: `light`, `dark` ou `system`), aplica a classe e,
em `system`, acompanha o SO enquanto a página está aberta. O `index.html` tem
um script inline que lê a mesma chave **antes** do React montar — sem ele a
tela pisca clara e escurece em seguida. `ThemeToggle` (Sol/Lua sobre
`IconButton`, em **tom neutro**, não no verde padrão do primitivo) mora no
rodapé do menu lateral, na mesma linha da identidade e antes do botão de sair;
no mobile ele vem junto, dentro da gaveta. O `AdminLayout` de exemplo já o
monta ali. O tom é neutro porque os vizinhos de rodapé são cinza, e um sol
verde ao lado deles lê como ação primária.

**Decisões da paleta escura** (contrastes medidos sobre `--card` #1c1f1c):

| Token | Claro | Escuro | Por quê |
| --- | --- | --- | --- |
| `--background` / `--card` | #f4f5f3 / #ffffff | #131513 / #1c1f1c | fundo mais escuro que o componente, como no claro o componente é mais claro que o fundo; mesmo matiz cinza-esverdeado |
| `--primary` | #156b16 | #5fb460 | o verde corporativo tem 1,9:1 sobre preto e some; o claro dá 6,6:1 e continua sendo o verde da interface |
| `--primary-foreground` | branco | #062708 | branco sobre #5fb460 dá 3,3:1; verde-escuro dá 6,3:1 |
| `--muted-foreground` | #5f675c | #aab3a6 | 7,8:1 |
| `--ink-muted` | #7c8579 | #7f887c | 4,6:1 — continua só rótulo em caixa alta |
| `--destructive` | #b42318 | #f27a70 | 6,2:1 como texto; o botão destrutivo usa `text-white` sobre `bg-destructive/60`, que dá 5,5:1 |
| `--attention` | #a46a18 | #e6a94f | 8,1:1 |
| `--accent` / `--accent-foreground` | #eef7ec / #125d13 | #1f3120 / #b9dcb4 | 9,2:1 no par (selo e aviso) |
| `--brand-50` … `--brand-950` | claro → escuro | **invertida** | `bg-brand-50` continua "superfície sutil" e `text-brand-800` continua "texto forte" nos dois temas. **Série de gráfico não sai daqui** — sai de `--data-*` (§12); da rampa da marca só a sequencial de magnitude aproveita quatro passos |
| `--border-soft` | rgba(…, 0.38) | rgba(…, 0.16) | no escuro o filete translúcido clareia; a mesma opacidade viraria uma linha branca |
| `color-scheme` | light | dark | escurece `<input type="date">`, scrollbar e seleção nativos |

**Marca no escuro** (§11): a assinatura PNG verde `#45963d` dá 5:1 sobre o fundo
e fica como está; o favicon não muda. O monograma herda `currentColor`, e sobre
o quadrado `bg-accent` do login o verde da marca cai de 4,1:1 (claro) para
2,6:1 (escuro): ali o monograma usa `text-accent-foreground` no escuro (9,2:1),
pelo mesmo mecanismo de "branca sobre o verde" — a marca não é recolorida, o
lugar é que dita a cor. Vale para qualquer superfície que pinte o monograma com
`BRAND_GREEN` fixo: meça o par nos dois temas.

**Regras que valem a partir daqui:**

- Cor nova nasce em `:root` **e** em `.dark`, nunca só num deles — token sem
  par herda o valor claro na tela escura e ninguém vê até alguém usar à noite.
- Contraste mínimo 4,5:1 para texto e ícone **nos dois temas**; meça (o
  script de contraste do kit da skill faz isso), não estime.
- `dark:` só dentro de primitivo, e só quando o token não resolve (caso raro;
  os `dark:` que o shadcn gera são aceitáveis porque apontam para token).
- Nada de "versão escura" de imagem ou logo enquanto o `currentColor` ou o
  contraste resolverem.

---

## 3. Onde foi parar o `tailwind.config.js`

Na v4 ele **não existe**. O que era `theme.extend.colors` virou o bloco
`@theme inline` da §2, e o plugin de animação virou o `@import 'tw-animate-css'`
da primeira linha. O único config que sobra é o plugin no `vite.config.ts`.

O que **não** mudou é o que importa: os nomes semânticos que o shadcn consome
(`card`, `primary`, `muted-foreground`, `ring`…) e os apelidos de domínio
continuam idênticos. Os apelidos existem porque `text-ink-secondary` diz mais
numa tela do que `text-muted-foreground`.

| Apelido | Aponta para | Para que serve |
| --- | --- | --- |
| `brand-50`…`brand-950` | rampa própria; o `700` **é** `--primary` | Superfícies de marca. **Não** é cor de série (§12) |
| `data-1`…`data-8` | `--data-*` | Cor de série de gráfico, em ordem fixa |
| `data-seq-1`…`data-seq-4` | `--data-seq-*` | Magnitude: mapa de calor, matriz |
| `ground` | `--background` | Fundo da tela |
| `paper` / `paper-sunken` | `--card` / `--muted` | Superfície de componente / área rebaixada dentro dela |
| `nav`, `nav-text`, `nav-active`, `nav-hover` | `--card`, `--muted-foreground`, `--primary`, `--accent` | Menu lateral |
| `rule` | `--border-soft` (translúcido) | Contorno geral |
| `rule-table` | `--border` | Fecha tabela e controle |
| `rule-row` | `--row-border` | Separa linhas |
| `ink` / `ink-secondary` / `ink-muted` | `--foreground` / `--muted-foreground` / `--ink-muted` | Três pesos de texto |
| `attention` / `attention-bg` | âmbar e seu fundo | Atenção |
| `alert` / `alert-bg` | `--destructive` e seu fundo | Risco |

Na v4 o achatamento por hífen substitui o `DEFAULT` da v3: `--color-paper` gera
`bg-paper` e `--color-paper-sunken` gera `bg-paper-sunken`, sem objeto aninhado.

---

## 4. Tipografia

| Papel | Fonte | Classe | Uso |
| --- | --- | --- | --- |
| Título | Manrope 500–800 | `font-title` | `h1`–`h6`, números em destaque (`Stat`), rótulo de seção |
| Corpo | Work Sans 400–700 | padrão (`font-sans`) | Todo o resto: texto, campo, botão, tabela |

Escala real em uso — o painel é denso, então quase tudo é menor que o padrão do
Tailwind e usa valor arbitrário em vez de `text-sm`:

| Token | Onde |
| --- | --- |
| `font-title text-2xl font-bold` | Título da página (`PageHeader`) |
| `text-lg font-semibold` | Título de diálogo |
| `font-title text-[15px] font-bold` | Título de cartão, título de estado vazio |
| `text-[14px]` | Item de menu lateral |
| `text-[13px]` | **Corpo padrão**: célula de tabela, campo, botão, descrição |
| `text-[12px]` | Rótulo de campo, metadado de linha, botão `sm`, selo |
| `text-[11px] uppercase tracking-[0.14em]` | Cabeçalho de tabela, rótulo de módulo |
| `text-[10px] uppercase tracking-[0.16em]` | Título de grupo do menu |

`font-variant-numeric: tabular-nums` é global.

---

## 5. Cores — regras de uso

- **O fundo da tela é `#f4f5f3` e todo componente é branco sólido por cima
  dele.** Área rebaixada *dentro* de um componente usa a cor da página
  (`paper-sunken`) em vez de inventar um terceiro cinza.
- **Não use azul em tela operacional.** Acento estrutural fica na paleta verde;
  atenção é âmbar (`attention`), risco é vermelho (`alert`/`destructive`).
  Isso inclui a **seleção de texto**: o `::selection` do `@layer base` usa o par
  `primary`/`primary-foreground`, senão o azul do sistema entra por cima do
  texto — a única cor fora da paleta, e logo onde mais se olha. O par já é
  escolhido para ter contraste nos dois temas, então a seleção acompanha o tema
  sem inventar cor nova.
  A regra vale para o que a interface **é** — botão, link, foco, seleção, ativo
  de menu. **Não vale para matiz de dado**: dentro de um gráfico a cor
  identifica uma série, não sinaliza nada, e por isso a rampa de dados (§12)
  tem azul e tem vermelho sem que isso queira dizer "atenção". A distinção
  existe porque cinco verdes vizinhos são ilegíveis numa barra de 12px — está
  medido no §12.
- **Contraste.** `primary` (#156b16) dá 6,7:1 sobre branco e passa em corpo de
  texto, botão e ícone. `ink-secondary` (#5f675c) dá 5,9:1. **`ink-muted`
  (#7c8579) dá 3,8:1** — serve para rótulo de cabeçalho em caixa alta e
  semibold, **nunca** para corpo de texto. São três lugares, e só eles:
  rótulo em caixa alta, controle desabilitado (a WCAG isenta o inativo) e
  glifo decorativo com `aria-hidden` (lupa do campo de busca, chevron,
  separador, ponto do `Status`), que responde ao piso de 3:1 de componente,
  não ao de texto. Todo o resto é `ink-secondary`: dica de campo, placeholder
  de `SelectMenu`, `Code`, `Dash`, o "+N" de etiquetas ocultas e o texto de
  estado vazio. E os 3,8:1 são medidos sobre branco ou `card` — sobre
  `brand-50` ou `paper-sunken` o mesmo cinza cai para ~3,5:1, então até o
  rótulo em caixa alta vira `ink-secondary` quando o fundo não é o branco.
- Verde é indicador positivo ou estado vivo; âmbar é atenção; vermelho é
  atraso, risco ou ação destrutiva.
- **Toda cor existe nos dois temas.** Um par que passa no claro pode falhar
  no escuro (e vice-versa); a tabela da §2.1 lista os pares medidos. Cor nova
  entra em `:root` e em `.dark` no mesmo commit.
- **Inativo não é vermelho.** Numa listagem em que quase tudo está inativo,
  pintar de vermelho transforma o estado normal em alarme e apaga o destaque do
  que é de fato crítico — inativo é cinza (`Status tone="off"`).

---

## 6. Forma

| Elemento | Raio |
| --- | --- |
| Cartão, diálogo | `rounded-3xl` |
| Painel de tabela, aviso (`Alert`) | `rounded-2xl` |
| Controle, botão, campo, selo, popover, item de menu | `rounded-xl` |
| Ação de ícone, item de lista do combobox, botão de fechar | `rounded-lg` |

Sombra é leve (`shadow-sm`) e **só em cartão**; painel de tabela se define pela
borda. Diálogo usa `shadow-2xl`, popover `shadow-lg`. **Fundo alternado de
linha não existe.**

---

## 7. Camada 1 — primitivos em `src/components/ui/`

O que o `npx shadcn add` traz, **com os ajustes deste design já embutidos**. A
tabela abaixo é o diff conceitual contra o shadcn padrão: é isso que você
precisa reaplicar depois de qualquer `add`.

| Arquivo | Base | Ajustes obrigatórios |
| --- | --- | --- |
| `button.tsx` | cva + `Slot` do `radix-ui` | `rounded-xl`, `font-semibold`, ícone `size-3.5`; alturas `default h-9 text-[13px]`, `sm h-8 text-[12px]`, `lg h-10 text-[14px]`, `icon h-8 w-8 rounded-lg`; variante `outline` com **fundo branco** (`bg-card`), não transparente; anel `ring-ring/40` |
| `input.tsx` | — | `h-9 rounded-xl border-input bg-card text-[13px]`; foco `border-brand-400` + `ring-2 ring-ring/25`; desabilitado `bg-muted text-ink-muted opacity-100` |
| `textarea.tsx` | — | Mesmo tratamento, `min-h-[60px]` |
| `label.tsx` | `Label` do `radix-ui` | `text-[12px] font-semibold text-muted-foreground` |
| `card.tsx` | — | `rounded-3xl border-rule-table shadow-sm`, padding `p-5`; `CardTitle` em `font-title text-[15px] font-bold` |
| `badge.tsx` | cva | `rounded-xl px-2 py-0.5 text-[12px]`; variantes `neutral` (padrão), `accent`, `attention`, `destructive`, `outline` — com `border-transparent` e **fundo tonal**, não sólido |
| `alert.tsx` | cva | `rounded-2xl border-transparent`; variantes `default`, `success`, `attention`, `destructive`, cada uma com par fundo/texto da paleta |
| `table.tsx` | — | Wrapper `overflow-x-auto`; `border-collapse text-[13px]`; `TableHead` em `bg-card px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-muted`; `TableCell` `px-4 py-3 align-top`; linha com `hover:bg-accent` e `border-rule-row`; **sem zebra** |
| `dialog.tsx` | `Dialog` do `radix-ui` | `rounded-3xl max-h-[90vh]` com corpo em `flex-col` + `overflow-y-auto` (só o miolo rola); cabeçalho e rodapé com filete `rule-row`; botão de fechar `rounded-lg` no canto |
| `popover.tsx` | `Popover` do `radix-ui` | `rounded-xl border-rule-table shadow-lg` **e `pointer-events-auto`** — ver §9.3 |
| `command.tsx` | `cmdk` | `rounded-xl`; item `rounded-lg text-[13px]`, selecionado `bg-accent`; **filtro sem acento** — ver §9.3 |
| `tabs.tsx` | `Tabs` do `radix-ui` | Lista `h-10 rounded-xl bg-muted p-1`; gatilho ativo `bg-card text-primary shadow-sm` |
| `chart.tsx` | `recharts` | Wrapper padrão do shadcn, sem diff: ele já traduz os `#ccc` internos do recharts para os tokens. Só entra se houver gráfico, e a cor das séries vem do `ChartConfig` (§12.1), nunca de um `fill` cravado |

Dois acréscimos que o CLI não gera e este design precisa:

- **`DialogBody`** em `dialog.tsx`. Sem ele não existe "só o miolo rola": o
  `DialogContent` vira `flex-col` com `max-h-[90vh]`, e cabeçalho e rodapé só
  ficam parados se o meio for um irmão com `flex-1 overflow-y-auto` próprio.
- **`accentInsensitiveFilter`** em `command.tsx`, exportado ao lado dos demais
  (ver §9.3).

---

## 8. Camada 2 — vocabulário do produto em `src/components/page.tsx`

Um único arquivo, montado sobre os primitivos. **A fronteira importa:** se o
nome só faz sentido dentro deste sistema (`Panel`, `Status`, `Code`), é daqui;
se é genérico (`Button`, `Input`, `Table`), é reexport ou envoltório fino.

Isso mantém a tela curta: uma listagem inteira se escreve com estes nomes, sem
uma classe Tailwind sequer no arquivo da página.

### 8.1 Estrutura de tela

```tsx
PageHeader({ module, title, description?, actions?, meta? })
```

Cabeçalho da tela. `module` é um rótulo em caixa alta verde acima do título;
`meta` é a linha de contagens. **Gruda no topo só a partir de `lg`** — no
mobile quem já está fixo é a barra do layout, e dois cabeçalhos grudados comem
a tela inteira. O `-top-8` compensa o `lg:p-8` do `<main>`: o Chrome desconta o
padding do container de rolagem ao grudar, e com `top-0` sobra uma faixa de
32px por onde a tabela rolada continua aparecendo.

```tsx
Panel({ children, className? })           // seção rounded-2xl + border-rule-table + bg-card
PanelHeader({ title, hint?, children? })  // faixa de título dentro do painel
Card({ children, className? })            // cartão rounded-3xl com sombra leve, p-5
```

`Panel` **não tem `overflow-hidden`** de propósito: ele recortaria o menu de
filtro na borda do painel. O canto arredondado se resolve pelo fundo branco do
cabeçalho da tabela (mesma cor do painel) e pela última linha sem filete
inferior.

### 8.2 Filtros

```tsx
Toolbar({ children, className? })                       // linha de filtros, colada na tabela
FilterChip({ label, value, onClear })                   // filtro ativo, removível
MoreFilters({ count?, label? = 'Mais filtros',
              children, onClear?, className? })         // painel dos filtros raros (§9.2)
SearchInput(props: InputHTMLAttributes)                 // Input com lupa à esquerda
SelectMenu({ value, onChange, options, label,
             placeholder?, className?, disabled?,
             searchThreshold? = 10 })
SelectOption = { value: string; label: string; hint?: string }
Field({ label, hint?, children, className? })           // rótulo + controle (para o combobox)
LabelledField({ label, hint?, children, className? })   // idem, embrulhado em <label> nativo
```

### 8.3 Ações

```tsx
Button({ variant?: 'primary' | 'secondary' | 'ghost' | 'danger', size?: 'sm' | 'md', ...button })
IconButton({ label, tone?: 'neutral' | 'danger' | 'attention', ...button })
TextLink({ ...button })
```

`variant` padrão é **`secondary`** (contorno branco), não primário: numa tela
com dez botões, só um é a ação principal. `type` padrão é `"button"` — dentro
de um `<form>` o HTML assume `submit`, e um botão de ação interna acabava
salvando e fechando o diálogo. `IconButton` recebe **um** `label` que vira
`title` **e** `aria-label` de uma vez; quando eram dois atributos separados,
divergiam.

O glifo é dimensionado pelo **próprio primitivo** (`[&_svg]:size-4`: 16px num
botão de 32px), não por quem chama. Sem isso o lucide entrega o padrão dele,
24px, e o ícone encosta na borda — que era o que acontecia com o `ThemeToggle`,
enquanto a vitrine (`.iconbtn svg`) e todo ícone do `AdminLayout` já usavam 15
e 16px. Quem chama passa só o ícone, sem classe de tamanho.

`TextLink` é a ação **terciária** que se lê como link — "Esqueci minha senha",
"Criar conta", "Voltar". Continua `<button>`, e não `<a>`, porque não navega:
troca o passo da mesma tela; o sublinhado no hover é o que sinaliza que clica.
Existe para o caso em que um terceiro botão contornado na mesma coluna apagaria
qual é a ação principal — a hierarquia vira primário, secundário, texto. Não
substitui `Button variant="ghost"`, que continua sendo botão dentro de barra e
de rodapé de diálogo.

### 8.4 Estado e sinalização

```tsx
Status({ tone: 'live' | 'off' | 'attention' | 'alert', children })          // ponto + texto, em tabela
Badge({ tone?: 'neutral' | 'accent' | 'attention' | 'alert', title?, children })  // selo, FORA de tabela
Alert({ tone: 'success' | 'error' | 'warn' | 'info', children })            // role="alert" só em erro
EmptyState({ title, hint?, action? })
Code({ children, prefix?, className? })   // identificador discreto, sem selo
Dash()                                    // ausência de dado: travessão, nunca 0 nem R$ 0,00
Stat({ children })                        // número em destaque dentro de uma frase
MetaDot()                                 // separador · entre contagens
```

### 8.5 Quadro

```tsx
Board({ height?: 'curto' | 'padrao' | 'alto', children })  // grade: 1 / 2 (sm) / 4 (xl)
BoardColumn({ title, count, children })                    // altura fixa; só a pilha rola
BoardCard({ children })                                    // cartão sobre a coluna rebaixada
```

A coluna tem **altura fixa** e rolagem interna; o porquê e os limites estão no
§9.6.

A altura é do **quadro**, não da coluna: `height` mora no `Board`, que publica
`--board-column-h`, e toda `BoardColumn` dentro dele lê a mesma variável. Se
cada coluna escolhesse a sua, as fases desalinhariam — que é o que a altura
fixa existe para evitar. `curto` (22rem) cabe num cartão de dashboard, `padrao`
(30rem) é a tela de trabalho, `alto` (40rem) é para monitor grande em que o
quadro é o assunto principal. Outro valor pede **um nome novo em
`BOARD_HEIGHT`**, não uma classe na tela.

### 8.6 Tabela

```tsx
Table({ children, className? })   // remove o filete da última linha
Th({ numeric?, ...th })           // numeric alinha à direita
Td({ numeric?, ...td })
Tr({ ...tr })
RowTitle({ children })            // coluna principal: semibold, cor de texto cheia
RowMeta({ children })             // metadado sob o nome principal
Pagination({ page, lastPage, total, unit, busy?, onPrevious, onNext })
```

`<thead>`/`<tbody>` são montados na mão pelas telas, então o filete que o
`TableHeader`/`TableBody` colocaria vem de `Th`/`Td`.

### 8.7 Gráficos e painel

```tsx
corDeSerie(indice)                          // → 'var(--data-N)', índice do CONTRATO
tomDeIntensidade(valor, maximo)             // → passo da rampa sequencial; null → --muted
Delta({ valor, inverso?, sufixo? })         // variação; inverso = melhora caindo
Sparkline({ valores, className? })          // tendência sem eixo, cor por currentColor
GradeKpi({ children })                      // a faixa de números que abre o painel
Kpi({ rotulo, valor, delta?, hint?, grafico? })
GradeGraficos({ children })                 // duas colunas a partir de lg
PainelGrafico({ titulo, hint?, acoes?, altura?, largura?, rodape?, children })
```

Mais os primitivos do recharts, reexportados daqui para a tela importar de um
lugar só: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`,
`ChartLegend`, `ChartLegendContent` e o tipo `ChartConfig`.

`PainelGrafico` é quem define o tamanho, e o gráfico preenche o que recebeu —
a proporção do desenho é a do componente, não uma constante escrita no arquivo
(§12.1). Existe por uma razão mecânica, não estética: o
`ResponsiveContainer` do recharts mede **o pai**, e pai sem altura mede zero —
o gráfico simplesmente não aparece, sem erro no console. A altura vive no
`PainelGrafico` (`padrao` 220px, `alta` 320px) em vez de virar um `h-[240px]`
copiado por seis telas. `acoes` é onde mora o par Gráfico/Tabela.

`corDeSerie` recebe a posição da série **no contrato** — a ordem em que o
backend devolve as dimensões, os anos, as categorias —, nunca o índice do array
já filtrado. Cor que anda quando um filtro apaga uma série faz o leitor
comparar duas coisas diferentes achando que compara a mesma.

`Delta` é cinza abaixo de 0,05 p.p.: ruído não é conquista. `inverso` é para o
que melhora caindo — turnover, custo, prazo de entrega, ruptura.

`GradeGraficos` é de duas colunas, e `largura="total"` é a única saída para o
gráfico ímpar que sobraria sozinho na última faixa — com a condição do §9.7: a
faixa inteira é para quem tem o que fazer com ela.

---

## 9. Padrões de tela

### 9.1 Tabela — padrão minimalista

Vale para toda tabela operacional:

- Fundo branco sólido, borda externa `rule-table`, cantos `rounded-2xl`,
  separadores `rule-row` entre linhas.
- Cabeçalho em **fundo branco**, caixa alta, `tracking-[0.14em]`,
  `font-semibold`, cor `ink-muted`.
- **Identificadores** (código de produto, código auxiliar, NCM) aparecem como
  texto discreto via `Code`, **sem selo preenchido** — o código precisa estar
  disponível, não competir com o nome.
- **Coluna principal** via `RowTitle`; descrições e metadados em tom secundário.
- **Selo preenchido é evitado dentro de tabela**; estado vira `Status` (ponto
  mais texto colorido). Exceção: alerta crítico pode manter vermelho ou âmbar
  para preservar a leitura de risco.
- **Ações inline** são `IconButton`: transparente, ícone colorido, sem círculo
  preenchido. Verde para o que é neutro ou edita, vermelho para o que remove.
- Linhas compactas (`py-3`), **sem fundo alternado**. A hierarquia vem de
  tipografia, alinhamento e espaçamento.
- Números (preço, contagem, quantidade) alinham à direita (`numeric`).

### 9.2 Filtros

- O painel de filtro fica **colado na tabela que ele filtra**, dentro do mesmo
  contêiner (`Toolbar` no topo do `Panel`).
- Filtro ativo vira `FilterChip` acima da tabela, com um botão para limpar
  tudo. Um seletor fechado não mostra que está filtrando quando o rótulo saiu
  da tela; a ficha mostra, e ainda dá o clique para desfazer.
- Filtro raro fica atrás de um botão "Mais filtros" (`MoreFilters`) em vez de
  deixar uma segunda linha meio vazia em toda visita. O botão traz a contagem
  do que está ativo lá dentro e um "Limpar" que zera **só** o painel — o que
  ficou na barra é escolha visível do usuário. O painel não é `modal`: abrir um
  `SelectMenu` de dentro dele leva o foco para outro portal, e o padrão do
  Radix fecharia o painel junto — por isso o `onFocusOutside` é barrado.
- **Data continua no controle nativo** (`<input type="date">`).

### 9.3 Combobox — três armadilhas que já custaram caro

O `SelectMenu` é Popover (Radix) + `cmdk`, e não `<select>` nativo: o nativo
muda de altura e de largura conforme o sistema operacional, e uma linha com
seis deles fica irregular. Em compensação o nativo dava type-ahead de graça —
por isso lista acima de `searchThreshold` (10) ganha campo de busca.

1. **`<Popover modal>`** — sem isso, dentro de um diálogo o `FocusScope` do
   Radix rouba o foco do campo de busca (portalado para fora do diálogo) e não
   dá para digitar.
2. **`pointer-events-auto` no `PopoverContent`** — o Dialog modal do Radix zera
   `pointer-events` no `body`, e o conteúdo é portalado para lá. Sem a classe,
   o combobox dentro de um diálogo abre mas nenhuma opção é clicável: o clique
   atravessa e acerta o que está atrás.
3. **Filtro sem acento no `cmdk`** — o filtro padrão só faz `toLowerCase()`,
   então "acucar" não acha "Açúcar". Num catálogo em português isso é a busca
   dos seletores não funcionar:

```ts
import { Command as CommandPrimitive, defaultFilter } from 'cmdk';

const deburr = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const accentInsensitiveFilter = (value: string, search: string, keywords?: string[]) =>
  defaultFilter(deburr(value), deburr(search), keywords?.map(deburr));
```

A dica (`hint`) da opção vai **embaixo** do rótulo, não ao lado: lado a lado,
um texto comprido esmaga o nome até virar reticência.

### 9.4 Abas

Tela com aba usa o `Tabs` do shadcn, e vale uma regra: **a ação primária mora
na faixa do painel da aba, não no cabeçalho da página.** O cabeçalho é
compartilhado entre as abas — mostrar "Novo produto" enquanto se olha outra aba
seria mentira sobre o que o botão faz.

Aba cujo conteúdo o usuário não pode ver **não é renderizada**: a permissão some
a aba inteira, não deixa ela clicável para dar erro depois.

### 9.5 Diálogo

`max-h-[90vh]`, `flex-col`, e **só o miolo rola** — cabeçalho e rodapé ficam
parados. O cabeçalho tem `pr-10` para não passar por baixo do botão de fechar.
O rodapé é `flex-col-reverse` no mobile e `sm:flex-row sm:justify-end` no
desktop: a ação primária fica por cima no celular e à direita no desktop.

### 9.6 Quadro — altura fixa, rolagem por coluna

O quadro (kanban) é a segunda leitura de uma listagem, não uma tela à parte:
mora no mesmo `Panel`, sob a mesma `Toolbar`, e um par de botões alterna
"Quadro" / "Lista". O filtro de estado sai da barra quando a visão é quadro —
as colunas **são** o filtro de estado.

**A coluna tem altura fixa e só a pilha de cartões rola.** É o mesmo princípio
do diálogo (§9.5) e do `<main>` (§10): o quadro inteiro nunca é a coisa que
rola. A altura vem do `Board` (`height`, padrão 30rem — §8.5); o que não se
negocia é ela ser **fixa e igual em todas as fases**.

Três coisas quebram quando a coluna cresce com o conteúdo:

- **as colunas desalinham.** Uma fase com trinta itens fica com milhares de
  pixels; as outras três viram faixas curtas no topo. Comparar fases é a razão
  de existir do quadro, e a comparação some.
- **o cabeçalho da fase sai da tela.** Quem rolou até o vigésimo cartão não vê
  mais em que coluna está — o rótulo ficou lá em cima. Com a coluna fixa, o
  cabeçalho é `shrink-0` e fica parado.
- **o resto da tela é empurrado.** Rodapé, paginação e qualquer aviso vão para
  onde ninguém rola.

Mecânica, na ordem em que morde:

- O miolo que rola precisa de **`min-h-0`**. Sem ele o filho de um flex
  container se recusa a encolher abaixo do próprio conteúdo, o `overflow-y-auto`
  não tem o que cortar, e a coluna estica de novo — com a altura fixa escrita
  no arquivo e nenhum efeito na tela.
- O cabeçalho é **`shrink-0`**, senão o flex o comprime quando a pilha enche.
- Altura em `rem`, não em `vh`: a coluna acompanha a tipografia, e no mobile,
  onde as colunas empilham, `vh` daria quatro telas cheias de uma fase só.
- Altura por **nome** (`height="alto"`), nunca um valor solto na tela. Um
  `h-[34rem]` escrito numa tela é a mesma dívida de um hex cru: da próxima vez
  alguém escreve 35 e o quadro da tela ao lado deixa de ser o mesmo objeto.
- Cada coluna guarda o **próprio** scroll. Rolar "Em andamento" não move
  "A fazer" — são pilhas independentes, e é isso que se espera de um quadro.

**Não se arrasta cartão.** O estado muda por um controle explícito, que funciona
no teclado e no toque, respeita permissão e não custa uma biblioteca de
drag-and-drop. Uma tela que só oferece o arrastar exclui quem navega por
teclado.

*Emenda de 2026-09-11 (mitra-kanban):* esse controle **não precisa morar na
capa**. O cartão é para ler de relance — título, marcas, os campos que a etapa
escolheu —, e um seletor no pé dele disputa a leitura com tudo isso. Onde o
item abre (um card, uma ficha), o lugar do controle é lá dentro, numa faixa de
ação explícita. Na capa, só quando não existe o "dentro".

### 9.7 Painel — a tela de BI

Um painel se lê de cima para baixo, em três alturas, e **cada altura responde a
uma pergunta diferente**:

1. **`GradeKpi` com quatro `Kpi`, no máximo.** Quantos, quanto, como está
   contra o período anterior. Se o quinto número parecia essencial, ele não
   era: KPI é o que se olha primeiro, não o índice de tudo que existe.
2. **Dois a quatro gráficos.** Cada um responde a *uma* pergunta que o número
   de cima levantou. Painel com oito gráficos não é denso, é indeciso.
3. **A tabela.** É o destino de todo clique de gráfico e o lugar onde o dado
   vira ação — abrir o item, editar, atribuir.

**Um filtro só, no topo, valendo para a tela inteira** (`Toolbar` do §8.2, com
o ciclo/período do `AdminLayout`). Cada gráfico com o seu próprio seletor de
período é a forma mais barata de fazer dois números da mesma tela discordarem.

**O gráfico é porta de entrada da tabela, não o fim da leitura.** Clicar numa
barra filtra a tabela abaixo — e é isso que "drill-down" significa aqui:
`onClick` no `<Bar>` mudando o mesmo estado de filtro que a `Toolbar` muda.
Não é recurso de biblioteca, são três linhas. Duas regras: o clique tem que ter
alvo maior que a marca (a faixa da categoria inteira, não a barra de 12px), e
a barra ativa é a única em opacidade cheia — as outras caem para `opacity-30`,
para o filtro ficar visível sem uma segunda legenda explicando.

**Três estados, e "carregando" não é um deles no lugar do vazio:**

| Situação | O que a tela mostra |
| --- | --- |
| Buscando | esqueleto com a **altura final** do gráfico — sem pulo de layout quando o dado chega |
| Sem nenhum dado | `EmptyState` dentro do `PainelGrafico`, com a ação que cria o primeiro dado |
| Dado insuficiente | o gráfico **não** é desenhado: uma frase diz quantos períodos faltam. Uma linha de dois pontos é um gráfico mentindo sobre uma tendência |

**Nada fica sozinho numa faixa.** A grade de gráficos é de duas colunas
(`GradeGraficos`), e um número ímpar deixa o último num cartão órfão com meia
tela de vazio ao lado — que o olho lê como "faltou alguma coisa aqui", não como
espaço. O órfão tem duas saídas, e só duas:

- **ocupa a faixa inteira** (`PainelGrafico largura="total"`) — e aí ele
  precisa *merecer* a largura. Merecem: série temporal longa (oito meses ganham
  em ficar largos), mapa de calor, matriz, barra empilhada com muitas
  categorias, qualquer coisa cujo eixo x tenha o que dizer. Não merecem: quatro
  barras, um donut, dois números. Esticar um gráfico de quatro categorias por
  1200px não o torna mais legível, torna o vazio mais caro;
- **deixa de ser gráfico**: sobe para a linha de cima como `Kpi`, ou vira uma
  coluna da tabela.

Vale para qualquer componente na última faixa, não só gráfico. E vale ao
contrário também: se o candidato a faixa inteira não justifica a largura, o
painel tem um gráfico a mais, não uma linha a menos.

Cada `PainelGrafico` traz o par **Gráfico/Tabela** em `acoes`. Não é enfeite de
acessibilidade: três slots da rampa de dados ficam abaixo de 3:1 sobre o branco
(§12), leitor de tela não lê barra, e quem precisa do número exato para colar
num relatório precisa da tabela de qualquer jeito.

O painel **não** rola dentro de si mesmo: quem rola é a área de conteúdo do
`AdminLayout` (§10). Painel com scroll próprio dentro de uma janela que já não
rola é a receita de dois scrolls disputando a roda do mouse.

O contador no cabeçalho é o total **da fase**, não o que está visível.

---

## 10. Layout da aplicação

- **A janela não rola.** O contêiner é `h-screen overflow-hidden`; quem rola é
  o `<main>` (`overflow-y-auto p-4 sm:p-6 lg:p-8`). Assim o menu fica parado
  enquanto a listagem corre, e o cabeçalho grudento da tela gruda no topo da
  área de conteúdo, não do documento.
- **Menu lateral** com altura de janela, `w-60`, recolhendo para
  `lg:w-[4.5rem]` (só ícones) no desktop. A escolha vai para `localStorage` — a
  preferência acompanha a pessoa entre telas e entre sessões; reabrir o menu a
  cada navegação seria tomar a decisão de novo à toa.
- O botão de recolher mora **no rodapé do menu**, não no topo: lá em cima ele
  disputava `z-index` com o cabeçalho grudento da tela, que o cobria pela
  metade.
- **Mobile**: o menu vira gaveta (`-translate-x-full` → `translate-x-0`) com
  véu clicável e fechamento por `Escape`; uma barra de 56px com hambúrguer,
  assinatura e iniciais do usuário substitui a lateral.
- Itens de menu são filtrados por permissão **antes** de renderizar; grupo que
  fica vazio desaparece junto. Recolhido, o título do grupo vira um filete de
  24px.
- Rodapé do menu: iniciais do usuário em quadrado verde `rounded-xl`, nome e
  e-mail truncados, `ThemeToggle` (§2.1) e botão de sair com hover vermelho.

### 10.1 Tela de login

Duas metades em `lg`: à esquerda a assinatura, uma manchete em `font-title
text-4xl`/`sm:text-5xl` e um bloco de contexto em `rounded-3xl bg-brand-50`; à
direita um cartão `max-w-md rounded-3xl border-rule-table bg-paper p-8
shadow-sm` com o monograma num quadrado `rounded-2xl bg-accent`. No mobile
empilha. O botão de submit ocupa a largura toda (`w-full`).

Dentro do cartão mora o acesso inteiro, numa máquina de estados de cinco
passos — entrar, criar conta, confirmar o e-mail, recuperar senha, nova senha —
e não em cinco telas: o e-mail digitado uma vez atravessa os passos seguintes
sem ser pedido de novo. A ordem em "entrar" é Google, Microsoft, régua, e-mail
e senha; o que sai da senha ("Esqueci minha senha", "Criar conta") é `TextLink`,
nunca um terceiro botão contornado. Cada passo é um `<form>` de verdade — é o
que dá Enter para enviar e o que o gerenciador de senhas lê.

As marcas de Google e Microsoft são identidade alheia, como o verde da
Benenutri é a nossa (§11): a cor vem cravada no SVG e não sai de token nem
acompanha o tema. Ficam no arquivo da tela, não em `Logo.tsx` (que é a nossa
marca) nem no vocabulário.

Campo de código de 6 dígitos filtra para dígitos no `onChange` e **não** usa
`maxLength`: o atributo conta o que está no DOM, sujeira inclusa, e ao chegar
em seis caracteres passa a engolir dígitos bons — colar "12a3 45b6789" deixava
`1234`. Como o filtro às vezes devolve o mesmo estado (digitou-se uma letra) e
aí o React não re-renderiza, o handler também reescreve `e.target.value`, senão
a letra fica visível no campo.

Ambiente sem o backend de autenticação (no Mitra, sem `VITE_MITRA_AUTH_URL`):
os passos que só a conta real cumpre **continuam navegáveis** e recusam no
envio, dizendo o que fazer no lugar. Tela que não abre em desenvolvimento não é
revisada, e quatro botões desabilitados escondem metade do acesso de quem
trabalha local.

---

## 11. Marca

Separação que evita o erro mais comum deste tipo de painel:

**O verde da marca não é o `--primary`.** Aqui a marca é `#45963d` e a
interface é `#156b16`. São papéis diferentes: um é identidade, o outro é
interface. A marca **nunca** é recolorida para o verde da interface — a cor
dela fica explícita em `components/Logo.tsx`, não herdada do tema.

| Peça | Formato | Uso |
| --- | --- | --- |
| Assinatura | PNG a 3× a largura exibida | Menu expandido, barra do mobile, login |
| Monograma | **SVG inline** com `fill="currentColor"` | Menu recolhido, login, avatar |
| Favicon | SVG, monograma branco sobre o verde da paleta | Aba do navegador |

O monograma vem **inline** em vez de `<img>` para o `currentColor` valer: assim
a marca herda a cor de onde é usada (verde no menu, branca sobre o verde) sem
duplicar arquivo por cor. Para a marca em classe existe o token `--brand-mark`
(`text-brand-mark`), fixo nos dois temas. O quadrado do login é o `MonogramTile`
de `Logo.tsx`: verde da marca no claro, `accent-foreground` no escuro (§2.1). O `<img>` da assinatura precisa de `alt` com o nome
da marca.

A assinatura é `w-fit`, nunca `w-auto`. Dentro de um container `flex-col` o
`align-items: stretch` age sobre largura `auto` e estica o `<img>` para a
coluna inteira: na tela de login a marca saía a 347×32 quando a proporção dela
é 5,12:1 — deformada ao dobro do largo, e ninguém lê isso como bug de CSS,
só como "o logo está errado". `fit-content` não é `auto`, então o stretch não
a alcança, e em `flex-row` nada muda. Vale para qualquer `<img>` de largura
intrínseca posto numa coluna flex.

---

## 12. Gráficos

Duas leituras antes desta: o skill **`dataviz`** responde *qual forma usar* —
se é gráfico mesmo ou um número solto, magnitude x identidade x polaridade,
formato de eixo, camada de hover, o catálogo de anti-padrões. Este §12 responde
o que é **desta casa**: qual cor, qual biblioteca, dentro de qual moldura.

### 12.1 A biblioteca

`recharts` + o wrapper `chart.tsx` do shadcn (`ChartContainer` + `ChartConfig`),
que reescreve os `stroke="#ccc"` cravados no recharts para as cores do tema. É
dependência **só de projeto que tem gráfico**; sem gráfico, o `chart.tsx` e o
bloco 8.7 do `page.tsx` saem do projeto.

A tela importa tudo do `page.tsx`, nunca do `recharts` direto. Um gráfico é:

```tsx
const config = {
  realizado: { label: 'Realizado', color: corDeSerie(0) },
  meta:      { label: 'Meta',      color: corDeSerie(1) },
} satisfies ChartConfig;

<PainelGrafico titulo="Receita líquida" hint="R$ mil · ciclo 2026" acoes={<AlternaVisao />}>
  <ChartContainer config={config} className="h-full w-full">
    <BarChart data={linhas} onClick={(e) => filtrarPor(e?.activeLabel)}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="periodo" tickLine={false} axisLine={false} />
      <ChartTooltip content={<ChartTooltipContent />} />
      <ChartLegend content={<ChartLegendContent />} />
      <Bar dataKey="realizado" fill="var(--color-realizado)" radius={4} />
    </BarChart>
  </ChartContainer>
</PainelGrafico>
```

O `className="h-full w-full"` não é opcional: o `ChartContainer` vem com
`aspect-video`, e dentro da altura fixa do `PainelGrafico` isso brigaria.

**O desenho segue a proporção do componente, sempre.** Quem manda na largura e
na altura é o `PainelGrafico`; o gráfico preenche o que recebeu. Um gráfico
desenhado num tamanho fixo dentro de um painel maior fica centralizado com
sobra dos dois lados — e a sobra lê como erro, ainda mais numa faixa inteira,
onde ela é o dobro. No recharts isso é de graça: o `ResponsiveContainer` mede o
pai a cada mudança de tamanho, e é exatamente por isso que o pai **precisa** de
altura. Em SVG escrito à mão (`Sparkline`, mapa de calor, matriz), o `viewBox`
é o tamanho medido do container, não uma constante — e redesenha quando o
container muda.

**Escape hatch: ECharts.** Se uma spec pedir sankey, treemap, mapa geográfico
ou zoom numa série de milhares de pontos, o recharts não desenha — aí entra
`echarts` **naquela tela**, com um `tema.ts` que lê os tokens por
`getComputedStyle` e refaz o gráfico quando o tema muda (o ECharts tematiza por
objeto JS, não por CSS, e é esse o custo). Duas bibliotecas de gráfico no mesmo
bundle sem essa justificativa é defeito. Tremor, Nivo e AG Charts estão fora
por motivo diferente: trazem o próprio sistema de cor e de forma, e o kit já
tem um (§7).

### 12.2 A cor tem quatro trabalhos, não um

| Trabalho | Token | Quando |
| --- | --- | --- |
| **Identidade** — qual série é qual | `--data-1` … `--data-8` | categórico: dimensões, anos, produtos |
| **Magnitude** — quanto | `--data-seq-1` … `--data-seq-4` | mapa de calor, matriz de risco, intensidade |
| **Polaridade** — para que lado | dois polos + neutro | variação contra a meta. Não existe pronto: nasce em `:root` **e** `.dark` no dia em que a primeira tela precisar, com **cinza** no meio, nunca uma terceira matiz |
| **Estado** — bom, atenção, risco | `primary`, `attention`, `alert` | é a paleta do `Status` (§8.4), e ela **não** empresta slot para série |

A rampa de dados é a paleta de referência do skill `dataviz`, adotada inteira
em vez de calibrada aqui — a manutenção e a validação são de lá. Ordem fixa: a
série 3 usa `--data-3` mesmo que um filtro apague a 2 (§8.7, `corDeSerie`).

**Por que não a rampa `brand-*`, que este documento mandava usar até então:**
medida com o validador do `dataviz`, ela reprova. Três dos cinco tons caem fora
da faixa de luminosidade, e `brand-400` contra `brand-600` dá ΔE 12,7 na visão
**normal** — abaixo do piso de 15. O problema nem chega a ser daltonismo:
ninguém distingue dois verdes vizinhos numa barra de 12px. A rampa da marca
continua ótima no trabalho para o qual ela serve, que é o segundo da tabela.

**Série não é estado.** Verde e vermelho aparecem na rampa de dados como
matiz, não como julgamento. Quando o gráfico é *sobre* estado — barras de "no
prazo / atrasado / em risco" — aí sim ele usa a paleta do `Status`, e cada
segmento leva **rótulo**, não só cor.

**Contraste e a regra de alívio.** Os slots 3, 4 e 5 ficam abaixo de 3:1 contra
o branco (2,82 · 2,17 · 2,69). Isso não os proíbe: obriga o gráfico onde eles
aparecem a trazer rótulo direto ou a visão de tabela — que o `PainelGrafico` já
pede em `acoes`. No escuro os oito passam de 3:1.

**O quinto trabalho: o selo** *(emenda de 2026-09-11, spec 010 da mitra-kanban)*.
Etiqueta de card põe o **rótulo por dentro da cor** — coisa que a rampa de dados
não resolve sozinha, porque ela foi medida para marca de gráfico, não para
carregar texto em cima. A regra é uma só, e não precisa de token novo:

```css
background: color-mix(in srgb, var(--data-N) 55%, var(--foreground));
color: var(--background);
```

- **O selo contrasta com o tema, não se funde nele.** No claro ele é escuro com
  rótulo claro; no escuro, claro com rótulo escuro. A regra é simétrica e não
  tem caso por tema: o fundo mistura com a **tinta** do tema e o rótulo é a
  **superfície** do tema — os dois trocam de lado sozinhos quando o tema vira.
- **A tinta é a padrão do tema, uma só.** Tinta por matiz (uns com branco,
  outros com escuro) é o que faz uma fileira de etiquetas parecer quebrada; o
  que sustenta a legibilidade é o fundo ceder, não o texto alternar.
- **55% é o número medido**, não estimado: é onde os oito matizes ainda passam
  de 4,5:1 nos **dois** temas — pior caso amarelo 4,76:1 no claro e verde
  7,12:1 no escuro; a 62% o amarelo do claro cai para 4,11:1. Verificado por
  cálculo WCAG em teste automático.
- **A rampa não muda.** `--data-N` continua a cor crua de série, de fase e da
  bolinha de opção; quem clareia (ou escurece, no tema escuro) é o selo.
- **Selo é para etiqueta**, não para toda opção colorida: um cartão em que todo
  campo de seleção vira selo é uma parede de cor. Opção comum continua em ponto
  + rótulo.
- Selo é identidade, como o resto da rampa: **não** vira paleta de estado. "No
  prazo / atrasado" continua sendo `Status` (§8.4).

### 12.3 O que não se faz

- **Nunca dois eixos Y.** Duas medidas de escala diferente viram dois gráficos,
  pequenos múltiplos, ou ambas indexadas a uma base comum. É o erro nº 1 de
  gráfico e ele *sempre* aparece com cara de economia de espaço.
- **Pizza não entra em tela operacional.** Ângulo se compara mal; a mesma
  pergunta cabe numa barra ordenada, que ainda dá o valor de cada fatia.
- **Legenda sempre, a partir de duas séries** — e com até quatro, rótulo direto
  também. Identidade nunca é só cor.
- Grade e eixo são recessivos: `border`/`muted-foreground`, sem linha vertical,
  sem moldura em volta do desenho.
- Número em toda marca não é informação, é poeira: rotule os extremos e o
  último ponto.
- Eixo de valor **começa em zero** em gráfico de barra. Truncar a base
  multiplica visualmente uma diferença de 2%.

### 12.4 Acessibilidade e formato

- Texto do gráfico usa token de tinta (`ink`, `ink-secondary`), nunca a cor da
  série: rótulo colorido some sobre o branco e some de novo no escuro.
- Toda tela de gráfico tem a **visão de tabela**, e ela é a versão acessível —
  não um extra.
- Moeda, percentual e data formatados em pt-BR (`toLocaleString('pt-BR')`), com
  `tabular-nums` (já é global, §2). Milhar abreviado só no eixo ("1,2 mi"), o
  valor cheio no tooltip.
- Sem dado é `Dash` também no gráfico: barra de altura zero afirma "zero".

---

## 13. Movimento e acessibilidade

- **Animação só onde ela explica alguma coisa**: a sanfona (`.collapsible`,
  `0fr → 1fr`), a entrada de popover/diálogo pelo `tw-animate-css` e
  transições de cor em hover. Nada de entrada animada de página, brilho ou
  deslocamento decorativo.
- `prefers-reduced-motion: reduce` zera duração de animação e transição.
- Foco visível é garantido globalmente por `:focus-visible` em `--ring`, além
  do anel próprio de cada componente.
- **Botão de ação é desabilitado quando falta permissão, nunca escondido**: a
  pessoa vê que a ação existe.
- Ícone decorativo leva `aria-hidden`; ícone que **é** o botão leva `label`.
- Contagem que muda sozinha (paginação) fica em `aria-live="polite"`.
- Estado vazio é convite para agir, com o próximo passo à mão — não uma frase
  triste no meio de um retângulo.
- Textos de interface em português, com acentuação correta.

---

## 14. Checklist ao portar

1. Copie `src/index.css` (que na v4 já carrega os dois temas), `src/lib/utils.ts`,
   `src/lib/theme.ts`, `src/components/ui/*`, `src/components/page.tsx`,
   `src/components/Logo.tsx`, `src/components/ThemeToggle.tsx` e o script
   inline do `index.html`.
   Replique também o alias `@` nos **dois** tsconfig e no `vite.config.ts`.
2. Troque **só** os valores de `--primary`, `--accent`, `--ring` e a rampa
   `--brand-*` pela cor da nova marca, nos blocos `:root` **e** `.dark`.
   Mantenha o formato `hsl(...)` e o hex no comentário ao lado. Nenhum
   `@theme` precisa mudar. A rampa de dados (`--data-*`) **não** acompanha a
   marca: ela é neutra de propósito e validada como um conjunto (§12.2) —
   recolorir um slot para "combinar" quebra a separação entre as séries.
3. Verifique o contraste da nova primária sobre branco e sobre `--card` do
   escuro: **mínimo 4,5:1** para texto e ícone nos dois temas. Abaixo disso,
   escureça (no claro) ou clareie (no escuro) a primária em vez de aceitar.
4. Ajuste `--font-title`/`--font-body` e o `<link>` do Google Fonts juntos.
5. Substitua os arquivos de marca e o `BRAND_GREEN` do `Logo.tsx`.
6. Adapte `PageHeader`/`AdminLayout` ao vocabulário do novo domínio, mas
   **preserve as três decisões estruturais**: janela que não rola, cabeçalho
   grudento só em `lg`, menu com estado em `localStorage`.

### Anti-padrões (o que reprova numa revisão)

- Classe de cor crua (`bg-[#156b16]`, `text-green-700`) em vez do token.
- `<select>` nativo em painel de filtro.
- Selo preenchido dentro de célula de tabela.
- Zebra ou fundo alternado de linha.
- Inativo pintado de vermelho.
- `ink-muted` em corpo de texto — dica de campo, `Code`, `Dash`, estado
  vazio e placeholder são `ink-secondary`; e rótulo em caixa alta sobre
  `brand-50` ou `paper-sunken` também, que ali o 3,8:1 cai abaixo do piso.
- Azul como acento estrutural.
- Botão escondido por falta de permissão em vez de desabilitado.
- `0` ou `R$ 0,00` onde o dado simplesmente não existe — é `Dash`.
- Rodar `npx shadcn add` sobre um arquivo já ajustado sem reaplicar o diff da §7.
- Instalar `@radix-ui/react-*` avulso ao lado do pacote unificado `radix-ui`.
- Definir cor só dentro de `@theme`, fora do `:root` — quebra a fonte única.
- Token definido em `:root` sem o par em `.dark` (ou o contrário).
- `dark:` em tela ou em `page.tsx` para consertar uma cor — o lugar é o token.
- Imagem ou logo "versão escura" quando `currentColor` ou o contraste resolvem.
- Coluna de quadro que cresce com o conteúdo, em vez de altura fixa com a pilha
  rolando por dentro (§9.6) — desalinha as fases e leva o cabeçalho embora.
- `overflow-y-auto` numa coluna de quadro **sem** `min-h-0` no miolo: a altura
  fica escrita no arquivo e não acontece nada na tela.
- Arrastar cartão como único jeito de mudar o estado — exclui teclado e toque.
- `<img>` de largura intrínseca com `w-auto` dentro de um `flex-col`: o
  `align-items: stretch` deforma a imagem para a largura da coluna. É `w-fit`
  (§11) — foi assim que a assinatura foi parar esticada na tela de login.
- `maxLength` num campo que filtra o valor no `onChange` (código de 6 dígitos):
  o atributo conta os caracteres sujos do DOM e engole dígitos bons (§10.1).
- **Dois eixos Y** no mesmo gráfico (§12.3). Reprova sozinho.
- Pizza em tela operacional; barra com eixo truncado; número em cima de toda
  marca; gráfico com duas ou mais séries sem legenda.
- Série pintada com cor de estado (`primary`, `attention`, `alert`) quando o
  gráfico não é sobre estado — e o inverso: estado sinalizado só por cor,
  sem rótulo (§12.2).
- Cor de série derivada do índice do array **já filtrado**: some uma série e
  todas as outras trocam de cor (§8.7, `corDeSerie`).
- `var(--chart-1)` colado de um exemplo do shadcn: o token daqui é `--data-1`.
- `<ResponsiveContainer>` (ou `ChartContainer`) dentro de um pai sem altura —
  o gráfico não desenha e não há erro no console. A altura mora no
  `PainelGrafico` (§8.7).
- Rótulo ou eixo pintado com a cor da série em vez de token de tinta.
- Cada gráfico do painel com o seu próprio seletor de período (§9.7).
- Gráfico desenhado com dois ou três pontos, fingindo tendência.
- **Gráfico órfão**: o último de um número ímpar sobrando numa metade da grade,
  com meia faixa vazia ao lado. Ou ocupa a faixa inteira, ou não é gráfico
  (§9.7).
- Gráfico esticado por uma faixa inteira sem ter o que fazer com ela — quatro
  barras ocupando 1200px. A largura é do dado, não do buraco no layout.
- Gráfico desenhado em tamanho fixo dentro de um painel maior, sobrando espaço
  dos dois lados. O desenho segue a proporção do componente (§12.1) — em SVG à
  mão, `viewBox` é o tamanho **medido** do container, nunca uma constante.
