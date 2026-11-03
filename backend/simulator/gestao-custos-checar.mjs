// Checagem MANUAL do Gestão de Custos ao vivo (regra 7 do CLAUDE.md: vazio não
// é verde). Só roda com SIMULATOR_GESTAO_CUSTOS=mitra e as credenciais no
// backend/.env; prova que a plataforma devolve contagem > 0 de produtos com
// UNIDADES_POR_CAIXA > 1 no projeto GESTAO_CUSTOS_PROJECT_ID (60574), e por qual
// caminho (runQuery ou o REST records). Quando a PRODUTOS do projeto não traz a
// coluna em linha nenhuma, diz isso — é a diferença entre "projeto errado" e
// "coluna vazia".
//
// Uso: cd backend && npm run sim:gestao-custos
import { abrirGestaoCustos } from './gestao-custos.mjs';

const executor = await abrirGestaoCustos();
if (!executor || !executor.produtos) {
  console.error('SIMULATOR_GESTAO_CUSTOS=mitra não está ligado no backend/.env — nada a checar.');
  process.exit(2);
}
const produtos = await executor.produtos();
const comColuna = produtos.filter((p) => p.UNIDADES_POR_CAIXA !== undefined && p.UNIDADES_POR_CAIXA !== null);
const acimaDeUm = comColuna
  .filter((p) => Number(p.UNIDADES_POR_CAIXA) > 1)
  .sort((a, b) => Number(a.CODPROD) - Number(b.CODPROD));
const exemplos = acimaDeUm.slice(0, 5).map((p) => ({ CODPROD: Number(p.CODPROD), UNIDADES_POR_CAIXA: Number(p.UNIDADES_POR_CAIXA) }));
console.log(`Gestão de Custos (${executor.descricao}): ${produtos.length} produtos, ${comColuna.length} com UNIDADES_POR_CAIXA, ${acimaDeUm.length} com UNIDADES_POR_CAIXA > 1`);
console.log('Exemplos:', JSON.stringify(exemplos));
if (!(acimaDeUm.length > 0)) {
  if (produtos.length > 0 && comColuna.length === 0) {
    console.error('FALHOU: a PRODUTOS deste projeto não traz UNIDADES_POR_CAIXA em linha nenhuma — confira GESTAO_CUSTOS_PROJECT_ID.');
  } else {
    console.error('FALHOU: contagem zero — vazio não é verde.');
  }
  process.exit(1);
}

// R-128: o custo padrão atual (CUSTOPRODUTO) também tem de vir com contagem > 0.
if (typeof executor.executar === 'function') {
  const { definitions } = await import('../add-013-compras-inteligentes.mjs');
  const def = definitions.find((d) => d.name === 'sgcCustoPadraoAtual');
  const amostra = produtos.slice(0, 500).map((p) => Number(p.CODPROD)).filter((n) => n > 0).join(',');
  const custos = await executor.executar(def, { codprods: amostra });
  console.log(`Custo padrão (sgcCustoPadraoAtual) para ${amostra.split(',').length} produtos: ${custos.length} com custo · ex.: ${JSON.stringify(custos.slice(0, 3))}`);
  if (!(custos.length > 0)) {
    console.error('FALHOU: custo padrão com contagem zero — vazio não é verde.');
    process.exit(1);
  }
}
