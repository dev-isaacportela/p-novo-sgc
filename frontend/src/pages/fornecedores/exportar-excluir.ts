// Spec 018 — orquestração da exportação e da exclusão da parametrização, fora
// do JSX das duas telas de fornecedores. A regra (blocos da planilha, ordem das
// escritas, cópia) é de `lib/fornecedor-planilha.ts`; aqui só as chamadas.
import { acao, linhas } from '@/lib/mitra-api';
import { baixarCsv } from '@/lib/csv';
import { hojeIso } from '@/lib/formato';
import {
  ESCRITAS_EXCLUSAO, copiaParaExclusao, juntarPaginas, nomeArquivoPlanilha, textoPlanilha,
  type DadosExportacao,
} from '@/lib/fornecedor-planilha';

/** RNF-001: 300 fornecedores = 3 execuções. */
const BLOCO = 100;

const agora = () => new Date().toISOString().slice(0, 19);

/**
 * RF-001/RF-002: baixa a parametrização (todos com `codfornec` 0) e devolve
 * quantos fornecedores foram no arquivo — 0 é "nada para exportar" (C-004) e
 * nada é baixado.
 */
export async function exportarParametrizacao(codfornec = 0): Promise<number> {
  const paginas: Partial<DadosExportacao>[] = [];
  for (let offset = 0; ; offset += BLOCO) {
    const pagina = (await acao('sgcFornecedorExportar', { codfornec, limite: BLOCO, offset })) as Partial<DadosExportacao>;
    paginas.push(pagina);
    if (!Array.isArray(pagina.fornecedores) || pagina.fornecedores.length < BLOCO) break;
  }
  const dados = juntarPaginas(paginas);
  if (!dados.fornecedores.length) return 0;
  baixarCsv(nomeArquivoPlanilha(hojeIso(), codfornec), textoPlanilha(dados));
  return dados.fornecedores.length;
}

/**
 * RF-006..RF-010: relê o que está gravado, guarda a cópia e apaga na ordem de
 * `ESCRITAS_EXCLUSAO`; depois relê de novo (RN-PAR-08 "relê para confirmar").
 * `true` = a parametrização sumiu. A guarda recusa sem erro (a escrita só não
 * afeta linha), por isso a resposta é a releitura, não o retorno das escritas.
 */
export async function excluirParametrizacao(codfornec: number): Promise<boolean> {
  const gravado = await acao('sgcFornecedorCarregar', { codfornec });
  if (!gravado.fornecedor) return true;
  const detalhe = JSON.stringify(copiaParaExclusao(gravado));
  const momento = agora();
  for (const nome of ESCRITAS_EXCLUSAO) await linhas(nome, { codfornec, detalhe, agora: momento });
  const depois = await acao('sgcFornecedorCarregar', { codfornec });
  return !depois.fornecedor;
}
