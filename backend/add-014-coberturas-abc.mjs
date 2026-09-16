// add-014 — Server Functions da spec 012 (coberturas por curva): a auditoria
// campo a campo de `SGC_COBERTURA` em `SGC_COBERTURA_LOG`. Ver
// docs/specs/012-coberturas-por-curva/.
//
// STUB DA BASE (S2): o arquivo existe para o `PUBLISH_ORDER` e o mapa de ids
// nascerem com a onda 4; quem preenche `definitions` é o agente da 012 (S3).
//
// Faixa de id local: 82xx (R-081 do 000) — leitura 8201
// (sgcCoberturaLogListar) e escrita 8250 (sgcEscCoberturaLogInserir), R-102.
// `sgcCoberturaListar` (7307), `sgcEscCoberturaGravar` (7358) e
// `sgcEscCoberturaExcluir` (7359) continuam no `add-006`, com os ids delas:
// nenhuma SF das ondas 1-3 muda de id (R-081). As colunas de curva de
// `SGC_COBERTURA` e o tipo de `SGC_PEDIDO_ITEM.COBERTURA_LIMITE` são da 012 na
// S3, num commit só com o código que os lê (R-113) — a base entregou só a
// tabela `SGC_COBERTURA_LOG`.
//
// O padrão a seguir é o de `add-010-bo.mjs`: guarda de persona única (R-013),
// `montarDefinitions(ids)` + `export const definitions`, publicação em dois
// passos e `isEntrypoint()` guardado por `MITRA_BASE_URL`. Esta spec não fala
// com o WinThor, não tem JAVASCRIPT e não tem cron: a régua do limite é pura
// (`lib/cobertura.ts`, R-089/R-111).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-014-coberturas-abc.mjs

import 'dotenv/config';

/** Nenhuma SF desta spec fala com o WinThor — o log vive no banco interno. */
export const WINTHOR = [];

export const definitions = [];
