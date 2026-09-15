# Constitution — SGC 2 (p-novo-sgc)

Princípios inegociáveis deste projeto. Toda `spec`, `plan` e `tasks` é checada
contra este documento. Violação exige justificativa explícita registrada no
`plan.md` da feature (seção *Complexity Tracking*) — ou não passa.

**Versão:** 2.2.0 · **Ratificada:** 2026-09-15 (adotada do CRM Ativa, p-57803, versão 2.2.0 de 2026-09-10) · **Última alteração:** 2026-09-15

O sistema visual é normativo e mora em [`design.md`](design.md). Onde este
documento e o `design.md` se sobrepuserem, o `design.md` decide a aparência e
esta constitution decide o processo.

---

## I. Spec antes de código

Nenhuma feature vira código sem `docs/specs/NNN-slug/spec.md` aprovada.

O fluxo é sequencial e cada artefato tem um dono de pergunta distinta:

| Artefato | Pergunta que responde | Proíbe |
|---|---|---|
| `spec.md` | O QUÊ e o PORQUÊ | qualquer menção a stack, tabela, componente |
| `plan.md` | O COMO técnico | requisito novo que não está na spec |
| `tasks.md` | Em que ORDEM, quem faz | decisão de design não resolvida no plan |

Requisito ambíguo é marcado `[NEEDS CLARIFICATION: pergunta]` na spec e
**bloqueia** o `plan.md`. Nunca se resolve ambiguidade adivinhando.

## II. Requisitos são testáveis ou não são requisitos

Todo requisito funcional (`RF-NNN`) precisa ter um critério de aceite que uma
pessoa consiga verificar sem ler código. "A tela deve ser rápida" não é
requisito. "A listagem responde em até 2s com 10k registros" é.

Escrito na linguagem do negócio, não na do sistema. Se o usuário final não
entende a frase, ela está no documento errado.

## III. Escopo negativo é obrigatório

Toda spec declara **Fora de escopo** explicitamente. Ausência dessa seção é
defeito de spec. O que não está escrito como incluído está excluído.

## IV. Migrations são append-only

Mudança de schema/recurso do backend vira migration em `backend/migrations/`.

- Migration aplicada **nunca** é editada, renumerada ou fundida. Correção é
  sempre migration nova.
- Esses arquivos são gerados e commitados **pelo sistema**, fora do turno do
  agente. Ninguém cria, edita ou faz `git add` neles manualmente.
- `mergeBaseline` só com ordem explícita do usuário.

## V. Duas camadas de componente, nenhuma terceira

A UI tem exatamente dois níveis, definidos em `design.md` §7 e §8:

- **Primitivos** — `frontend/src/components/ui/`, gerados por `npx shadcn add` e
  **ajustados no próprio arquivo** (raio, altura, tamanho de fonte, cor). Rodar
  `shadcn add` de novo reescreve o arquivo: reaplique o diff da §7 ou o ajuste
  se perde em silêncio.
- **Vocabulário do produto** — `frontend/src/components/page.tsx`. É daqui que
  as telas montam listagem, filtro e cabeçalho.

A fronteira: nome que só faz sentido neste sistema (`Panel`, `Status`, `Code`)
mora no `page.tsx`; nome genérico (`Button`, `Input`, `Table`) é reexport ou
envoltório fino sobre o primitivo.

**Tela não escreve classe Tailwind solta.** Se uma página precisou de classe
crua, ou falta um nome no `page.tsx` ou o primitivo está mal ajustado — corrija
lá, não na tela.

Dependência nova exige justificativa no `plan.md`. As ausências de `design.md`
§1.4 (form lib, estado global, date picker, toast lib, CSS-in-JS) são decisões
tomadas, não lacunas: reverter qualquer uma exige emenda, não `npm i`. O tema
escuro existe desde a 2.1.0 como camada `.dark` de tokens (`design.md` §2.1):
toda cor nova nasce em `:root` **e** em `.dark`, nunca só num deles.

## VI. Design tokens, nunca cor literal

Cor vem dos tokens de `frontend/src/index.css`, consumidos pelos apelidos do
bloco `@theme inline` do próprio arquivo (`bg-card`, `text-ink-secondary`,
`border-rule-row`, `bg-brand-50`…). No Tailwind 4 não existe
`tailwind.config.js`, e os valores são `hsl(...)` completo — o modificador de
opacidade (`bg-primary/90`) opera sobre a cor pronta.

**Cor de série de gráfico vem da rampa de dados** (`--data-1…8`), nunca da
rampa da marca e nunca da paleta de estado: são três famílias com três
trabalhos — marca é superfície, estado é julgamento, dado é identidade.

São defeito, não questão de gosto:

- hex cru (`bg-[#156b16]`) ou cor do Tailwind (`text-green-700`) em componente;
- azul como **acento estrutural** em tela operacional — botão, link, foco,
  seleção. Dentro de um gráfico a regra não vale: ali o matiz identifica uma
  série e não sinaliza nada;
- série de gráfico pintada com cor de estado, ou estado sinalizado só por cor,
  sem rótulo ao lado;
- `ink-muted` (3,8:1) em corpo de texto — ele é só rótulo em caixa alta;
- inativo pintado de vermelho.

Trocar a paleta é mexer em `index.css`. O *contrato* de nomes dos tokens não é
personalizável — é ele que faz o `design.md` ser portável.

A lista de anti-padrões de `design.md` §14 é critério de revisão: item marcado
lá reprova o `plan.md` ou o código, sem discussão de mérito.

## VII. Simplicidade é o default

Comece pela solução mais direta que funciona. Não entram sem necessidade
comprovada e escrita:

- abstração com uma única implementação;
- camada de configuração para valor que nunca muda;
- estrutura "para o futuro" que nenhuma spec pede.

Atalho deliberado com teto conhecido é marcado no código com comentário
`ponytail:` nomeando o limite e o caminho de upgrade.

## VIII. Build e sincronização

- Build **sempre** em `frontend/`: `cd frontend && npm run build`. Nunca da raiz.
- `main` é a baseline compartilhada; o trabalho vive em `user/20500`.
- Todo turno começa com sync (`git fetch && git merge origin/main`) e termina
  com **um** commit + push se houve mudança.
- Conflito de merge nunca é resolvido pelo agente — a decisão é do usuário.
- Nunca `--force`, nunca `--rebase`, nunca deletar branch remota.
- Nunca trailer `Co-Authored-By: Claude …` (nem outra assinatura de agente)
  na mensagem de commit: a autoria é de quem publica.

## IX. Segurança e credenciais

Credenciais Mitra (`MITRA_TOKEN`, `VITE_MITRA_AUTH_URL`, `PROJECT_ID`) vêm de
`.env`, populado pelo servidor. Valor real **nunca** é hardcoded, commitado ou
colado em documento. `.env.example` carrega só as chaves, vazias.

Token de sessão trafega no fragment (`#`) da URL justamente para não vazar em
log ou `Referer` — nenhuma mudança pode movê-lo para query string.

---

## Governança

Esta constitution prevalece sobre qualquer outra prática do projeto.

**Emenda:** requer (1) o texto novo, (2) a justificativa do que na prática
falhou com a regra antiga, (3) bump de versão semântico —
`MAJOR` remoção/redefinição de princípio · `MINOR` princípio novo ·
`PATCH` ajuste de redação.

**Checagem:** todo `plan.md` abre com uma *Constitution Check* — lista os
princípios que a feature toca e como os atende. Falha na checagem é
replanejamento, não exceção informal.

### Histórico de emendas

**2.2.0 — 2026-09-10.** Gráficos e BI. O princípio VI ganha a **rampa de
dados** (`--data-1…8`) como origem única da cor de série, separada da rampa da
marca e da paleta de estado, e a proibição de azul passa a valer só para
*acento estrutural* — dentro de um gráfico, matiz identifica série e não
sinaliza nada. Justificativa: a regra anterior mandava usar a rampa `brand-*`
como cor de série, e ela reprova quando medida — ΔE 12,7 entre dois verdes
vizinhos na visão normal, abaixo do piso de 15, ou seja, indistinguíveis mesmo
para quem enxerga cor por completo. Nesta emenda também caem duas heranças do
Tailwind 3 que o texto ainda repetia e que o `design.md` §2 e §3 já
contradiziam: os apelidos não vêm de `tailwind.config.js`, que não existe na
v4, e os valores não são triplas HSL sem `hsl()`.

**2.1.0 — 2026-09-09.** Tema escuro. A ausência "sem tema escuro" da §1.4 do
`design.md` deixa de valer: entra a camada `.dark` de tokens em `index.css`
(mesmos nomes, valores invertidos, contrastes medidos), a classe é aplicada por
`src/lib/theme.ts` com três estados (claro, escuro, sistema) e persistida em
`localStorage`. O princípio VI ganha a regra "toda cor nova nasce em `:root` e
em `.dark`". Justificativa: o padrão claro-único falhou para uso prolongado em
tela operacional à noite, e o custo é só a duplicação dos tokens — nenhum
componente muda.

**2.0.0 — 2026-08-27.** Adoção do design system de `design.md` (Busca 360 /
Banco de Produtos Benenutri). Redefine os princípios V e VI: a UI passa a ter
duas camadas (primitivos shadcn ajustados + vocabulário em `page.tsx`) e os
tokens passam a ser as triplas HSL do `index.css`. A versão 1.0.0 descrevia os
componentes e tokens do template inicial da Mitra — dark, tokens `--color-*`,
componentes escritos à mão —, que este projeto abandona.

**1.0.0 — 2026-08-27.** Ratificação inicial.
