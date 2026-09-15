// Schema do projeto — SGC 2 (Sistema de Gestão de Compras da Benenutri).
//
// Ainda sem tabelas próprias: o schema de hoje é só o da biblioteca
// @benenutri/mitra-kanban (13 tabelas KB_*), criado por `add-001-kanban.mjs`.
// As tabelas `SGC_*` da onda 1 entram AQUI, quando as specs 003+ chegarem: um
// template literal `CREATE TABLE IF NOT EXISTS` POR TABELA, sem repetir a
// frase de abertura do DDL em comentário — o simulador local lê o DDL por
// texto (backend/simulator/schema.mjs) e NÃO aplica `ALTER TABLE`; coluna
// nova em tabela já existente é upgrade aditivo no `add-NNN` que a introduzir
// e, também, no CREATE aqui (quem instala do zero e o simulador acompanham).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL sem decisao explicita do usuario:
// o mitra-sdk e um cliente HTTP puro e nao gera migration; quem materializa a
// migration e a plataforma, ao fim de um turno no sandbox.
//
// Uso (no sandbox): cd backend && node setup-backend.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const { configureSdkMitra } = await import('mitra-sdk');
  configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  // Nenhuma tabela SGC_* ainda — nada para rodar além do aviso.
  console.log('p-novo-sgc: nenhuma tabela própria ainda. O schema vem da lib — rode `node add-001-kanban.mjs`.');
}
