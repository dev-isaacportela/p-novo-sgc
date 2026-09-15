// add-004 — Server Functions da spec 001 (fornecedores): cadastro do ERP e
// parametrização de compra por fornecedor. Ver docs/specs/001-fornecedores/.
//
// Faixa de id local: 71xx — leituras e JAVASCRIPT a partir de 7101
// (sgcFornecedorListar…), escritas a partir de 7150 (sgcEscFornecedorInserir…).
// O marcador de ids das escritas internas (chamadas só por id, nunca
// diretamente pela tela) segue o padrão de add-001-kanban.mjs: o id local vem
// de SERVER_FUNCTIONS em frontend/src/lib/server-functions.ts até o
// sync-server-function-map.mjs trazer os reais do sandbox.
//
// sgcWintFornecedores e sgcWintFiliais (Oracle) resolvem o jdbcId por NOME,
// com `jdbcIdWinthor` de add-003-jdbc-winthor.mjs — nunca por id numérico
// fixo. No simulador o jdbcId é ignorado.
//
// Ainda SEM Server Function: a spec 001 entra aqui. `definitions = []` até lá.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-004-fornecedores.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-004-fornecedores: nenhuma server function ainda — stub da spec 001 (fornecedores).');
}
