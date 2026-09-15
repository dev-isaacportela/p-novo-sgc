// add-002 — Perfil de acesso do projeto.
//
// Usuario business precisa de perfil para executar Server Function — sem ele
// a plataforma responde 400 "User has no profile assigned". O perfil libera
// TODAS as SFs (as publicas kb*/sgc* e as internas kbEsc*, que as JAVASCRIPT
// chamam por id) e as tabelas (KB_*, e SGC_* quando existirem) para SELECT.
// Quem administra cada quadro e decidido pelo proprio motor (KB_BOARD.ADMINS_IDS).
//
// ATENCAO — este script executa NO IMPORT (nao so no entrypoint) e lanca sem
// MITRA_BASE_URL: por isso fica FORA do PUBLISH_ORDER do simulador
// (config.mjs) e roda POR ULTIMO no sandbox, depois de add-001 e dos demais
// add-00N da onda. Nao apague este aviso.
//
// Aditivo e idempotente: reaproveita o perfil se ja existir.
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.

import 'dotenv/config';
import {
  configureSdkMitra, listProfilesMitra, createProfileMitra,
  setProfileServerFunctionsMitra, setProfileSelectTablesMitra, setProfileUsersMitra,
  listServerFunctionsMitra, listTablesMitra, listProjectUsersMitra,
} from 'mitra-sdk';

if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const NOME_PERFIL = 'Equipe Compras';

async function acharPerfil() {
  const perfis = (await listProfilesMitra({ projectId })).result ?? [];
  return perfis.find((p) => p.name === NOME_PERFIL);
}

// createProfileMitra nao devolve o id de forma confiavel: releio a lista depois.
let perfil = await acharPerfil();
if (!perfil) {
  await createProfileMitra({ projectId, name: NOME_PERFIL, color: '#156b16' });
  perfil = await acharPerfil();
}
const profileId = perfil.id;
console.log(`Perfil: ${NOME_PERFIL} (id ${profileId})`);

const sfs = (await listServerFunctionsMitra({ projectId })).result ?? [];
await setProfileServerFunctionsMitra({ projectId, profileId, serverFunctionIds: sfs.map((f) => f.id) });
console.log(`Server functions liberadas: ${sfs.length}`);

const tabelas = ((await listTablesMitra({ projectId })).result ?? [])
  .map((t) => t.name ?? t.NAME ?? t.tableName)
  .filter((n) => n && n !== 'INT_USER');
await setProfileSelectTablesMitra({
  projectId, profileId, jdbcConnectionConfigId: 1,
  tables: tabelas.map((tableName) => ({ tableName })),
});
console.log(`Tabelas liberadas para SELECT: ${tabelas.join(', ')}`);

const usuarios = (await listProjectUsersMitra({ projectId })).result ?? [];
await setProfileUsersMitra({ projectId, profileId, userIds: usuarios.map((u) => u.userId) });
console.log(`Usuarios no perfil: ${usuarios.map((u) => `${u.email} (${u.userType})`).join(', ')}`);
