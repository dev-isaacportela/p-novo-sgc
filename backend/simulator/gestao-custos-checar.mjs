// Checagem MANUAL do Gestão de Custos ao vivo (regra 7 do CLAUDE.md: vazio não
// é verde). Só roda com SIMULATOR_GESTAO_CUSTOS=mitra e as credenciais no
// backend/.env; prova que a plataforma devolve contagem > 0 de produtos com
// UNIDADES_POR_CAIXA > 1 no projeto 60574, e por qual caminho.
//
// Uso: cd backend && npm run sim:gestao-custos
import { abrirGestaoCustos } from './gestao-custos.mjs';

const executor = await abrirGestaoCustos();
if (!executor || !executor.consultar) {
  console.error('SIMULATOR_GESTAO_CUSTOS=mitra não está ligado no backend/.env — nada a checar.');
  process.exit(2);
}
const [total] = await executor.consultar('SELECT COUNT(*) AS N FROM PRODUTOS WHERE UNIDADES_POR_CAIXA > 1');
const n = Number(total?.N ?? total?.n ?? 0);
const exemplos = await executor.consultar('SELECT CODPROD, UNIDADES_POR_CAIXA FROM PRODUTOS WHERE UNIDADES_POR_CAIXA > 1 ORDER BY CODPROD LIMIT 5');
console.log(`Gestão de Custos (${executor.descricao}): ${n} produtos com UNIDADES_POR_CAIXA > 1`);
console.log('Exemplos:', JSON.stringify(exemplos));
if (!(n > 0)) {
  console.error('FALHOU: contagem zero — vazio não é verde.');
  process.exit(1);
}
