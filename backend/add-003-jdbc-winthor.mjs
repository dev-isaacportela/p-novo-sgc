// add-003 — Conexão JDBC Oracle com o WinThor (ERP), usada pelas sgcWint* das
// specs 001, 003 e 004 (fornecedor/filial, análise de compra, prazo de
// pagamento). Idempotente por NOME: roda de novo sem duplicar a conexão.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario: a plataforma
// so gera migration/recurso quando o script roda no sandbox, com o .env real
// (WINTHOR_JDBC_URL/WINTHOR_USER/WINTHOR_PASSWORD — nunca commitados).
// Uso (no sandbox): cd backend && node add-003-jdbc-winthor.mjs
//
// Nenhuma Server Function nasce aqui: `definitions = []`. O `jdbcId` é
// resolvido POR NOME (`jdbcIdWinthor`) no isEntrypoint() de cada add-NNN que
// publica uma sgcWint* (add-004-fornecedores.mjs, add-006-itens.mjs,
// add-007-agenda.mjs), porque o id numérico muda entre sandbox e produção.
// No simulador o `jdbcId` é ignorado: as sgcWint* rodam direto sobre as
// tabelas PC* de backend/simulator/schema-winthor.mjs.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export const NOME_JDBC_WINTHOR = 'WinThor';

export const definitions = [];

/** `host:porta/serviço` ou `host:porta:sid`, com ou sem o prefixo `jdbc:oracle:thin:@`. */
export function parseWinthorUrl(url) {
  const semPrefixo = String(url || '').replace(/^jdbc:oracle:thin:@/i, '').trim();
  const m = /^([^:/]+):(\d+)[:/](.+)$/.exec(semPrefixo);
  if (!m) throw new Error(`WINTHOR_JDBC_URL num formato inesperado: "${url}". Esperado host:porta/serviço ou host:porta:sid.`);
  const [, host, port, database] = m;
  return { host, port: Number(port), database };
}

/** Resolve o id da conexão por nome — chamado pelos outros add-NNN, já com o SDK configurado. */
export async function jdbcIdWinthor(projectId) {
  const { listJdbcConnectionsMitra } = await import('mitra-sdk');
  const conexoes = (await listJdbcConnectionsMitra({ projectId })).result ?? [];
  const conexao = conexoes.find((c) => c.name === NOME_JDBC_WINTHOR);
  if (!conexao) throw new Error(`Conexão JDBC "${NOME_JDBC_WINTHOR}" não existe neste projeto — rode add-003-jdbc-winthor.mjs antes.`);
  return conexao.id;
}

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);

  const existentes = (await sdk.listJdbcConnectionsMitra({ projectId })).result ?? [];
  const ja = existentes.find((c) => c.name === NOME_JDBC_WINTHOR);
  if (ja) {
    console.log(`Conexão "${NOME_JDBC_WINTHOR}" já existe (id ${ja.id}); nada a fazer.`);
  } else {
    if (!process.env.WINTHOR_JDBC_URL) throw new Error('WINTHOR_JDBC_URL ausente no .env do sandbox.');
    const { host, port, database } = parseWinthorUrl(process.env.WINTHOR_JDBC_URL);
    const criado = await sdk.createJdbcConnectionMitra({
      projectId,
      name: NOME_JDBC_WINTHOR,
      type: 'oracle',
      host,
      port,
      database,
      user: process.env.WINTHOR_USER,
      password: process.env.WINTHOR_PASSWORD,
    });
    console.log(`Conexão "${NOME_JDBC_WINTHOR}" criada:`, JSON.stringify(criado.result));
  }
}
