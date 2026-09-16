// T-005 — o documento impresso do extrato (spec 010): template de texto,
// montado em cima do `ModeloExtrato` puro de `lib/extrato.ts`. Retrato,
// monocromático, sempre claro — R-060/R-078 (000): a janela `about:blank` do
// extrato não carrega o CSS do app (sem `:root`/`.dark` para herdar), e o
// documento precisa imprimir igual em impressora P&B e ficar estável quando
// arquivado. Por isso ESTE é o único arquivo do projeto com cor literal
// (R-078 é a exceção declarada; a tela — botões e `Alert` em
// `AcoesDoPedido.tsx` — continua nos tokens).
//
// `?inline` (D-007, plan.md): força o Vite a resolver a logo como `data:`
// URI, independente do tamanho do arquivo — a janela sem base URL não
// resolveria um caminho de arquivo comum.
import logoBenenutri from '@/assets/logo-benenutri.png?inline';
import type { ModeloExtrato } from '@/lib/extrato';
import { fmtData, moeda } from '@/lib/formato';

const TEXTO_MARCA: Record<'nao_aprovado' | 'cancelado', string> = {
  nao_aprovado: 'NÃO APROVADO',
  cancelado: 'CANCELADO',
};

/** Escapa texto livre (fornecedor, descrição de item, motivo…) antes de entrar no `document.write`. */
function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const tra = (valor: string) => esc(valor) || '—';

function linhaDeItem(item: ModeloExtrato['itens'][number]): string {
  const total = item.qtPedida * item.precoCusto;
  return `<tr>
    <td>${esc(item.codprod)}</td>
    <td>${esc(item.descricao)}</td>
    <td>${esc(item.embalagem)}</td>
    <td class="num">${esc(item.qtPedida)}</td>
    <td class="num">${esc(moeda(item.precoCusto))}</td>
    <td class="num">${esc(moeda(total))}</td>
  </tr>`;
}

function blocoPrazo(modelo: ModeloExtrato): string {
  const { prazo } = modelo;
  const justificativa = prazo.exigeJustificativa
    ? (prazo.justificativa || 'Justificativa ainda não registrada.')
    : '';
  return `
    <table>
      <thead><tr><th>Prazo padrão do fornecedor</th><th>Prazo acordado neste pedido</th><th>Situação</th></tr></thead>
      <tbody>
        <tr>
          <td>${tra(prazo.padrao)}</td>
          <td>${tra(prazo.acordado)}</td>
          <td>${esc(prazo.rotulo)}</td>
        </tr>
      </tbody>
    </table>
    ${justificativa ? `<p class="justificativa"><strong>Justificativa da diferença:</strong> ${esc(justificativa)}</p>` : ''}
  `;
}

function blocoDecisoes(modelo: ModeloExtrato): string {
  if (!modelo.decisoes.length) return '';
  return `
    <div class="secao-titulo">Decisões registradas</div>
    ${modelo.decisoes.map((decisao) => `<p><strong>${esc(decisao.titulo)}:</strong> ${esc(decisao.texto)}</p>`).join('')}
  `;
}

function blocoFaturamento(modelo: ModeloExtrato): string {
  if (!modelo.faturamento.temNota) return '';
  const linhas = modelo.faturamento.notas.map((nota) => `<tr>
      <td>${esc(nota.numero)}</td>
      <td>${esc(fmtData(nota.data))}</td>
      <td class="num">${esc(moeda(nota.valor))}</td>
    </tr>`).join('');
  return `
    <div class="secao-titulo">Faturamento — ${esc(modelo.faturamento.percentual)} % do pedido</div>
    <table>
      <thead><tr><th>Nota fiscal</th><th>Emissão</th><th>Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

function blocoAssinaturas(): string {
  return `
    <div class="assinaturas">
      <div class="assinatura">Comprador responsável</div>
      <div class="assinatura">Aprovação técnica</div>
      <div class="assinatura">Aprovação da diretoria</div>
    </div>
  `;
}

/** T-005 — monta o documento completo. Chamado depois que os dados chegam (D-005); o `<script>` imprime ao carregar. */
export function extratoHtml(modelo: ModeloExtrato): string {
  const { cabecalho } = modelo;
  const marcaDagua = modelo.marca
    ? `<div class="marca-dagua">${TEXTO_MARCA[modelo.marca]}</div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Extrato do pedido ${esc(cabecalho.idCard)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
  .marca-dagua {
    position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 64px; font-weight: 700; color: #d5d5d5; letter-spacing: 6px;
    z-index: 0; pointer-events: none; white-space: nowrap;
  }
  .conteudo { position: relative; z-index: 1; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  header img { height: 30px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .subtitulo { font-size: 10px; color: #555; }
  .cabecalho-dados { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; margin-bottom: 12px; font-size: 10.5px; }
  .cabecalho-dados div span { display: block; color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
  .secao-titulo { font-size: 12px; font-weight: 700; margin: 14px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #999; padding: 3px 6px; text-align: left; font-size: 10px; }
  th { background: #eee; }
  td.num, th.num { text-align: right; }
  .num { text-align: right; }
  .total-pedido { text-align: right; font-weight: 700; font-size: 12px; margin: 6px 0 4px; }
  .justificativa { font-size: 10px; }
  .assinaturas { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; }
  .assinatura { flex: 1; border-top: 1px solid #111; text-align: center; padding-top: 4px; font-size: 9.5px; }
  .rodape { margin-top: 18px; font-size: 9px; color: #555; border-top: 1px solid #ccc; padding-top: 4px; }
  @media print { .rodape { position: fixed; bottom: 6mm; left: 0; right: 0; } }
</style>
</head>
<body>
  ${marcaDagua}
  <div class="conteudo">
    <header>
      <div>
        <h1>Extrato do pedido de compra ${esc(cabecalho.idCard)}</h1>
        <div class="subtitulo">${esc(cabecalho.filial)} · ${esc(cabecalho.fornecedor)}</div>
      </div>
      <img src="${logoBenenutri}" alt="Benenutri">
    </header>

    <div class="cabecalho-dados">
      <div><span>Fornecedor</span>${tra(cabecalho.fornecedor)}</div>
      <div><span>Filial</span>${tra(cabecalho.filial)}</div>
      <div><span>Número no fornecedor</span>${tra(cabecalho.numeroWinthor)}</div>
      <div><span>Período de vendas analisado</span>${esc(fmtData(cabecalho.periodoInicio))} a ${esc(fmtData(cabecalho.periodoFim))}</div>
      <div><span>Criado por</span>${tra(cabecalho.criador)}</div>
      <div><span>Emitido em</span>${esc(modelo.geradoEm)}</div>
    </div>

    <div class="secao-titulo">Prazo de pagamento</div>
    ${blocoPrazo(modelo)}

    <div class="secao-titulo">Itens do pedido</div>
    <table>
      <thead>
        <tr><th>Código</th><th>Descrição</th><th>Embalagem</th><th class="num">Quantidade</th><th class="num">Custo unitário</th><th class="num">Total</th></tr>
      </thead>
      <tbody>
        ${modelo.itens.map(linhaDeItem).join('') || '<tr><td colspan="6">Nenhum item com quantidade pedida.</td></tr>'}
      </tbody>
    </table>
    <div class="total-pedido">Total do pedido: ${esc(moeda(modelo.totalPedido))}</div>

    ${blocoDecisoes(modelo)}
    ${blocoFaturamento(modelo)}
    ${modelo.assinaturas ? blocoAssinaturas() : ''}

    <div class="rodape">Extrato gerado em ${esc(modelo.geradoEm)} — documento derivado do pedido, não é gravado no sistema.</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}
