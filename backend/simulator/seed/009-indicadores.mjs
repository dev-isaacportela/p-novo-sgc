// Seção Simulador da spec 009 (indicadores e relatórios). Ver
// docs/specs/009-indicadores-e-relatorios/plan.md §Simulador.
//
// SÓ relatórios salvos (R-062). Nenhum card, pedido, NF, agendamento, item de
// B.O. ou solicitação nasce aqui: os indicadores desta spec leem exatamente o
// que as ondas 1 e 2 (e o seed da 008) semearam, e é isso que torna as
// asserções interessantes — um seed próprio de pedido tornaria todo número
// desta feature uma cópia do que o próprio seed escreveu.
//
// Os estados de SLA e de agenda que os cenários precisam (um pedido ligado a
// um agendamento, um fornecedor sem prazo de entrega) são arranjados DENTRO do
// próprio `teste()` por `UPDATE` direto e desfeitos no fim — C-10 do plan. A
// suíte 009 é a última do smoke.mjs, então nenhuma outra depende do que ela toca.
//
// `RELATORIOS_009` existe pelo mesmo motivo de `CARDS_003`: o smoke recorta a
// galeria por id e nunca por total absoluto (R-045).

/** Ids das quatro linhas de SGC_RELATORIO, para o smoke recortar (R-045). */
export const RELATORIOS_009 = {};

// `visao` ausente e `zoom` desconhecida: é sobre esta linha que `lerConfig`
// prova a tolerância de C-018 (chave desconhecida descartada, chave faltando no
// padrão) — relatório salvo antes de uma mudança abre, não quebra.
const CONFIG_ANTIGO = {
  filtros: { fase: 'enviado', codfornec: 0, codfilial: '', responsavelId: 0, prioridade: '', dataInicio: '', dataFim: '' },
  colunas: ['numero', 'fornecedor', 'valor'],
  agrupamento: 'filial',
  grafico: { tipo: 'barra', eixo: 'filial', medida: 'valor' },
  zoom: 1.5,
};

const config = (filtros, agrupamento, medida, visao = 'tabela') => ({
  filtros: {
    fase: '', codfornec: 0, codfilial: '', responsavelId: 0, prioridade: '',
    dataInicio: '', dataFim: '', ...filtros,
  },
  colunas: ['numero', 'titulo', 'fase', 'fornecedor', 'filial', 'responsavel', 'prioridade', 'valor', 'criado_em', 'dias_na_fase'],
  agrupamento,
  grafico: { tipo: 'barra', eixo: agrupamento, medida },
  visao,
});

export function seed009(db, cenario) {
  const U = cenario.usuarios;
  const agora = new Date().toISOString().slice(0, 19);

  const inserir = db.prepare(`INSERT INTO SGC_RELATORIO
    (TITULO, DESCRICAO, CONFIG_JSON, COMPARTILHADO, CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const linha = (titulo, descricao, configJson, compartilhado, dono) => Number(inserir.run(
    titulo, descricao, JSON.stringify(configJson), compartilhado, dono, agora, dono, agora,
  ).lastInsertRowid);

  RELATORIOS_009.porFase = linha(
    'Pedidos por fase', 'Quantos pedidos e quanto valor em cada etapa do funil.',
    config({}, 'fase', 'contagem', 'grafico'), 1, U.ana,
  );
  RELATORIOS_009.valorPorFornecedor = linha(
    'Valor por fornecedor', 'Soma do valor dos pedidos por fornecedor.',
    config({}, 'fornecedor', 'valor', 'grafico'), 1, U.gil,
  );
  RELATORIOS_009.meusEmAnalise = linha(
    'Meus pedidos em análise', 'Recorte pessoal da Ana: só a fase de análise.',
    config({ fase: 'analise' }, 'fornecedor', 'contagem'), 0, U.ana,
  );
  RELATORIOS_009.antigo = linha(
    'Relatório antigo', 'Salvo antes de a forma do recorte ganhar a visão.',
    CONFIG_ANTIGO, 1, U.admin,
  );
}
