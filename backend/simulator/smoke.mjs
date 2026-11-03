// Orquestrador da suite de testes do backend do SGC 2 — banco descartavel,
// compartilhado por todas as suites, cada uma no seu arquivo em smoke/00N-*.mjs
// (um por spec, mais o esqueleto em smoke/000-esqueleto.mjs e os dois
// contratos de base: 000-dias-uteis.mjs e 000-dialeto.mjs).
//
// Uso: cd backend && npm run sim:smoke   (ou npm test)

import { abrirContexto } from './smoke/base.mjs';
import { suite as esqueleto } from './smoke/000-esqueleto.mjs';
import { suite as diasUteis } from './smoke/000-dias-uteis.mjs';
import { suite as dialeto } from './smoke/000-dialeto.mjs';
import { suite as winthorReal } from './smoke/000-winthor-real.mjs';
import { suite as gestaoCustos } from './smoke/000-gestao-custos.mjs';
import { suite as fornecedores } from './smoke/001-fornecedores.mjs';
import { suite as quadro } from './smoke/002-quadro.mjs';
import { suite as itens } from './smoke/003-itens.mjs';
import { suite as agenda } from './smoke/004-agenda.mjs';
import { suite as notasFiscais } from './smoke/005-notas-fiscais.mjs';
import { suite as transito } from './smoke/006-transito.mjs';
import { suite as bo } from './smoke/007-bo.mjs';
import { suite as solicitacoes } from './smoke/008-solicitacoes.mjs';
import { suite as indicadores } from './smoke/009-indicadores.mjs';
import { suite as comprasInteligentes } from './smoke/011-compras-inteligentes.mjs';
import { suite as coberturas } from './smoke/012-coberturas.mjs';
import { suite as galderma } from './smoke/014-galderma.mjs';
import { suite as movimentacao } from './smoke/013-movimentacao.mjs';
import { suite as empenhos } from './smoke/015-empenhos.mjs';
import { suite as fornecedoresExportarExcluir } from './smoke/018-fornecedores-exportar-excluir.mjs';

const ctx = await abrirContexto();

await esqueleto(ctx);
await diasUteis(ctx);
await dialeto(ctx);
await winthorReal(ctx);
await gestaoCustos(ctx);
await fornecedores(ctx);
await quadro(ctx);
await itens(ctx);
// A 012 revalida o smoke da 003 e é dona das linhas de SGC_COBERTURA do seed
// dela nesta onda (R-096/R-107): vem logo depois de `itens`.
await coberturas(ctx);
await agenda(ctx);
await notasFiscais(ctx);
await transito(ctx);
await bo(ctx);
await solicitacoes(ctx);
await indicadores(ctx);
await comprasInteligentes(ctx);
// Onda 5 (R-150): pedido Galderma — produtos, clientes e competência próprios.
await galderma(ctx);
// Onda 5 (R-160): quadro de empenhos — quadro, produtos e clientes próprios.
await empenhos(ctx);
// R-190: exportar e excluir a parametrização (018) — parametriza e apaga o próprio 1099.
await fornecedoresExportarExcluir(ctx);
// Onda 5 (R-140): por último — a suíte cria um usuário somente-leitura próprio.
await movimentacao(ctx);

console.log(`\n  ${ctx.contagem()} verificacoes passaram.`);
ctx.fechar();
