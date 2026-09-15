// Seção Simulador do plan da 001 (fornecedores): 3 fornecedores (1015
// Fresenius Kabi, 1042 Nestlé, 1088 Danone inativo), filiais atendidas,
// linhas de produto com contatos e faixas de prazo, um documento com
// vencimento (C-007), e as tabelas PC* do WinThor (PCFORNEC/PCFILIAL — schema
// em backend/simulator/schema-winthor.mjs) com os mesmos fornecedores e
// filiais mais os registros que a consulta precisa descartar (999999, '99',
// C-008). Fonte única do cadastro simulado (R-017, B-04, B-06): a 003 e a 004
// reaproveitam estes mesmos fornecedores e filiais, sem inserir os seus.
//
// Personas (SGC_USUARIO_PERSONA) são gravadas aqui SÓ SE a tabela estiver
// vazia — o dado é da spec 002; enquanto ela não existir, a 001 não fica sem
// persona para os smokes que guardam escrita (C-003).
//
// Ver docs/specs/001-fornecedores/plan.md §Simulador.

const iso = () => new Date().toISOString().slice(0, 19);

export function seed001(db, cenario) {
  const U = cenario.usuarios;

  /* ── PCFORNEC / PCFILIAL (ERP simulado) — fonte única, B-04/B-06/R-017 ── */
  db.prepare(`INSERT INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA, CGC, EMAIL, UF) VALUES (?, ?, ?, ?, ?, ?)`).run(
    1015, 'FRESENIUS KABI BRASIL LTDA', 'FRESENIUS KABI', '49324221000104', 'contato@fresenius-kabi.com', 'SP',
  );
  db.prepare(`INSERT INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA, CGC, EMAIL, UF) VALUES (?, ?, ?, ?, ?, ?)`).run(
    1042, 'NESTLE BRASIL LTDA', 'NESTLE', '60409075000132', 'contato@nestle.com', 'SP',
  );
  db.prepare(`INSERT INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA, CGC, EMAIL, UF) VALUES (?, ?, ?, ?, ?, ?)`).run(
    1088, 'DANONE NUTRICAO ESPECIALIZADA LTDA', 'DANONE', '02414711000138', 'contato@danone.com', 'RJ',
  );
  // Fornecedor genérico do WinThor — a consulta precisa descartá-lo (C-008).
  db.prepare(`INSERT INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA, CGC, EMAIL, UF) VALUES (?, ?, ?, ?, ?, ?)`).run(
    999999, 'FORNECEDOR GENERICO', 'GENERICO', '00000000000000', '', 'SP',
  );

  db.prepare(`INSERT INTO PCFILIAL (CODIGO, RAZAOSOCIAL, CGC, UF) VALUES (?, ?, ?, ?)`).run('1', 'Benenutri Matriz', '11111111000101', 'SP');
  db.prepare(`INSERT INTO PCFILIAL (CODIGO, RAZAOSOCIAL, CGC, UF) VALUES (?, ?, ?, ?)`).run('2', 'Benenutri Filial Norte', '11111111000202', 'SP');
  db.prepare(`INSERT INTO PCFILIAL (CODIGO, RAZAOSOCIAL, CGC, UF) VALUES (?, ?, ?, ?)`).run('3', 'Benenutri Filial Sul', '11111111000303', 'PR');
  // Filial descartada pela consulta (C-008).
  db.prepare(`INSERT INTO PCFILIAL (CODIGO, RAZAOSOCIAL, CGC, UF) VALUES (?, ?, ?, ?)`).run('99', 'Filial Interna', '11111111009999', 'SP');

  /* ── SGC_FORNECEDOR — 1015 ativo, 1042 ativo, 1088 inativo (C-002) ── */
  const inserirFornecedor = db.prepare(`INSERT INTO SGC_FORNECEDOR
    (CODFORNEC, FORNECEDOR, CNPJ, CNPJ_FORMATADO, PRAZO_ENTREGA_DIAS, PRAZO_ENTREGA_TIPO, PEDIDO_MINIMO,
     FECHAMENTO_DIA_INICIO, FECHAMENTO_DIA_FIM, LINK_PLATAFORMA, VALIDADE_MINIMA_DIAS, SLA_ANALISE_DIAS,
     SLA_FATURAMENTO_DIAS, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const agora = iso();
  const id1015 = inserirFornecedor.run(
    1015, 'FRESENIUS KABI BRASIL LTDA', '49324221000104', '49.324.221/0001-04',
    7, 'uteis', 5000.00, 7, 15, '', 120, 0, 0, 1, U.admin, agora, U.admin, agora,
  ).lastInsertRowid;
  const id1042 = inserirFornecedor.run(
    1042, 'NESTLE BRASIL LTDA', '60409075000132', '60.409.075/0001-32',
    10, 'corridos', 3000.00, 1, 10, '', 90, 2, 7, 1, U.admin, agora, U.admin, agora,
  ).lastInsertRowid;
  const id1088 = inserirFornecedor.run(
    1088, 'DANONE NUTRICAO ESPECIALIZADA LTDA', '02414711000138', '02.414.711/0001-38',
    5, 'uteis', 2000.00, 1, 5, '', 60, 0, 0, 0, U.admin, agora, U.admin, agora,
  ).lastInsertRowid;

  /* ── filiais atendidas ── */
  const inserirFilial = db.prepare(`INSERT INTO SGC_FORNECEDOR_FILIAL (FORNECEDOR_ID, CODFILIAL, FILIAL) VALUES (?, ?, ?)`);
  inserirFilial.run(id1015, '1', 'Benenutri Matriz');
  inserirFilial.run(id1015, '2', 'Benenutri Filial Norte');
  inserirFilial.run(id1042, '1', 'Benenutri Matriz');
  inserirFilial.run(id1042, '2', 'Benenutri Filial Norte');
  inserirFilial.run(id1042, '3', 'Benenutri Filial Sul');
  inserirFilial.run(id1088, '1', 'Benenutri Matriz');

  /* ── linhas, contatos e faixas — 1015: 2 linhas, 4 contatos, 6 faixas (C-005, RN-010) ── */
  const inserirLinha = db.prepare(`INSERT INTO SGC_FORNECEDOR_LINHA (FORNECEDOR_ID, NOME, ORDEM) VALUES (?, ?, ?)`);
  const inserirContato = db.prepare(`INSERT INTO SGC_FORNECEDOR_LINHA_CONTATO (LINHA_ID, NOME, EMAIL) VALUES (?, ?, ?)`);
  const inserirFaixa = db.prepare(`INSERT INTO SGC_FORNECEDOR_FAIXA_PRAZO (LINHA_ID, VALOR_DE, VALOR_ATE, ROTULO, PARCELAS, ORDEM) VALUES (?, ?, ?, ?, ?, ?)`);

  const linhaEnteral1015 = inserirLinha.run(id1015, 'Nutrição Enteral', 1).lastInsertRowid;
  inserirContato.run(linhaEnteral1015, 'Mônica', 'captacao.pedidos@fresenius-kabi.com');
  inserirContato.run(linhaEnteral1015, 'Elaine', 'elaine.santos@fresenius-kabi.com');
  inserirFaixa.run(linhaEnteral1015, 0, 0, 'Opção única', '30/60/90', 1);

  const linhaParenteral1015 = inserirLinha.run(id1015, 'Nutrição Parenteral', 2).lastInsertRowid;
  inserirContato.run(linhaParenteral1015, 'Lauanda', 'lauanda.oliveira@fresenius-kabi.com');
  inserirFaixa.run(linhaParenteral1015, 0, 20000, 'Opção única', '30', 1);
  inserirFaixa.run(linhaParenteral1015, 20000, 45000, 'Opção única', '30/45', 2);
  inserirFaixa.run(linhaParenteral1015, 45000, 0, 'Opção A', '30/45/60', 3);
  inserirFaixa.run(linhaParenteral1015, 45000, 0, 'Opção B', '30/60', 4);

  const linha1042 = inserirLinha.run(id1042, 'Nutrição Infantil', 1).lastInsertRowid;
  inserirContato.run(linha1042, 'Paulo', 'paulo.compras@nestle.com');
  inserirFaixa.run(linha1042, 0, 0, 'Opção única', '30/60', 1);

  /* ── documento — vence em 2027-03-31 (C-007, RN-014) ── */
  db.prepare(`INSERT INTO SGC_FORNECEDOR_DOCUMENTO (FORNECEDOR_ID, TIPO, NOME, ENDERECO, VENCIMENTO, CRIADO_POR, CRIADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id1015, 'Documento', 'Contrato comercial 2026', 'https://arquivos.mitra.local/sgc/fornecedor-1015-contrato-2026.pdf', '2027-03-31', U.admin, agora,
  );

  // SGC_FORNECEDOR_LOG fica vazio: quem preenche é o salvamento (C-006).

  // Personas (SGC_USUARIO_PERSONA) NÃO nascem aqui: seed/002-quadro.mjs já
  // as semeia (R-017 do 000 README — "personas só no seed da 002"), rodando
  // depois deste no seed.mjs. Semear aqui também violaria a UNIQUE(USUARIO_ID).
}
