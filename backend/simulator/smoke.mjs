// Orquestrador da suite de testes do backend do SGC 2 — banco descartavel,
// compartilhado por todas as suites, cada uma no seu arquivo em smoke/00N-*.mjs
// (um por spec da onda 1, mais o esqueleto em smoke/000-esqueleto.mjs).
//
// Uso: cd backend && npm run sim:smoke   (ou npm test)

import { abrirContexto } from './smoke/base.mjs';
import { suite as esqueleto } from './smoke/000-esqueleto.mjs';
import { suite as diasUteis } from './smoke/000-dias-uteis.mjs';
import { suite as fornecedores } from './smoke/001-fornecedores.mjs';
import { suite as quadro } from './smoke/002-quadro.mjs';
import { suite as itens } from './smoke/003-itens.mjs';
import { suite as agenda } from './smoke/004-agenda.mjs';
import { suite as notasFiscais } from './smoke/005-notas-fiscais.mjs';
import { suite as transito } from './smoke/006-transito.mjs';
import { suite as bo } from './smoke/007-bo.mjs';

const ctx = await abrirContexto();

await esqueleto(ctx);
await diasUteis(ctx);
await fornecedores(ctx);
await quadro(ctx);
await itens(ctx);
await agenda(ctx);
await notasFiscais(ctx);
await transito(ctx);
await bo(ctx);

console.log(`\n  ${ctx.contagem()} verificacoes passaram.`);
ctx.fechar();
