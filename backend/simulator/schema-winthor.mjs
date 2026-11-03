// Tabelas PC* do WinThor (Oracle), imitadas em SQLite só para o simulador.
//
// NUNCA entram no setup-backend.mjs: aquele arquivo roda na plataforma e
// criaria tabelas de ERP vazias no banco do Mitra (D-006 do plan da 001). Na
// plataforma real as sgcWint* consultam o Oracle pelo jdbcId de
// add-003-jdbc-winthor.mjs; aqui consultam este schema, com os mesmos nomes e
// colunas, pelo dialeto Oracle->SQLite (backend/simulator/mysql-dialect.mjs).
//
// Só DDL — as linhas ficam para os seeds de cada feature (seed/001-*.mjs,
// seed/003-*.mjs). Mesmo formato de backend/simulator/schema.mjs: um template
// literal por tabela, começando pela frase de criação idempotente, para o
// leitor de DDL por texto (readSetupDdl) reconhecer o bloco.
//
// Colunas: as que os plans 001 (§Simulador), 003 (§"Tabelas PC*") e, na onda 2,
// 005 (§"Tabelas PC*", R-027: PCNFENT, PCLANC novas; PCMOV e PCPRODUT ganham
// colunas) citam. Onda 3 (R-069): PCCLIENT ganha CGCENT e PCMOV ganha DTCANCEL,
// as duas do rastreio da 008. As linhas continuam por conta dos seeds de cada
// feature.

export const DDL = [
  // Compartilhadas com a 001 (sgcWintFornecedores/sgcWintFiliais) e com a 003.
  `CREATE TABLE IF NOT EXISTS PCFORNEC (
    CODFORNEC INT PRIMARY KEY,
    FORNECEDOR VARCHAR(200),
    FANTASIA VARCHAR(200),
    CGC VARCHAR(18),
    EMAIL VARCHAR(255),
    UF VARCHAR(2)
  )`,

  // R-131: CODCLI é o cliente que representa a filial — venda para ele é venda entre filiais.
  `CREATE TABLE IF NOT EXISTS PCFILIAL (
    CODIGO VARCHAR(10) PRIMARY KEY,
    RAZAOSOCIAL VARCHAR(200),
    CGC VARCHAR(18),
    UF VARCHAR(2),
    CODCLI INT
  )`,

  // R-131: a nota de saída da venda — CONDVENDA 8 é a remessa de entrega futura.
  `CREATE TABLE IF NOT EXISTS PCNFSAID (
    NUMTRANSVENDA INT PRIMARY KEY,
    CONDVENDA INT
  )`,

  // sgcWintAnaliseMontagem / sgcWintBuscarProduto (003). OBS2 marca inativo;
  // PRAZOVAL e a validade minima do produto (dias). CODFAB/CODAUXILIAR (EAN)
  // sao da 005 (R-027): casamento de item da NF quando o CODPROD nao bate.
  `CREATE TABLE IF NOT EXISTS PCPRODUT (
    CODPROD INT PRIMARY KEY,
    DESCRICAO VARCHAR(200),
    EMBALAGEM VARCHAR(60),
    UNIDADE VARCHAR(10),
    CODFORNEC INT,
    CODEPTO INT,
    CODSEC INT,
    QTUNITCX DECIMAL(15,3),
    OBS2 VARCHAR(200),
    PRAZOVAL INT,
    CODFAB VARCHAR(60),
    CODAUXILIAR VARCHAR(20)
  )`,

  // Estoque e venda por produto/filial (003).
  `CREATE TABLE IF NOT EXISTS PCEST (
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    QTEST DECIMAL(15,3),
    QTVENDMES DECIMAL(15,3),
    QTVENDMES1 DECIMAL(15,3),
    QTVENDMES2 DECIMAL(15,3),
    QTPEDIDA DECIMAL(15,3),
    QTBLOQUEADA DECIMAL(15,3),
    QTINDENIZ DECIMAL(15,3),
    QTRESERV DECIMAL(15,3),
    CUSTOULTENT DECIMAL(15,4),
    CUSTOFIN DECIMAL(15,4),
    DTULTENT VARCHAR(10),
    DTULTSAIDA VARCHAR(10),
    CODDEVOL INT,
    MOTIVOBLOQESTOQUE VARCHAR(200)
  )`,

  `CREATE TABLE IF NOT EXISTS PCESTTRANSITO (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    QTTRANSITO DECIMAL(15,3),
    DTPREVISTA VARCHAR(10)
  )`,

  // Movimento de venda (sgcWintAnaliseMontagem soma por CODOPER = 'S') e de
  // entrada (CODOPER = 'E', 005/R-027): NUMTRANSENT/NUMNOTA/SERIE ligam à NF
  // de PCNFENT; NUMLOTE/DATAVALIDADE casam o lote da 005 com o da 003 (PCLOTE).
  // 013 (R-133): CUSTOREAL (custo da entrada do lote) e CODFORNEC, para o rastro da perda.
  `CREATE TABLE IF NOT EXISTS PCMOV (
    NUMTRANSITEM INT,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    CODCLI INT,
    CODOPER VARCHAR(1),
    DTMOV VARCHAR(10),
    QT DECIMAL(15,3),
    PUNIT DECIMAL(15,4),
    CUSTOFIN DECIMAL(15,4),
    CODUSUR INT,
    NUMPED INT,
    NUMTRANSENT INT,
    NUMNOTA INT,
    SERIE VARCHAR(10),
    NUMLOTE VARCHAR(30),
    DATAVALIDADE VARCHAR(10),
    DTCANCEL VARCHAR(10),
    CODDEVOL INT,
    QTBLOQUEADA DECIMAL(15,3),
    ROTINALANC VARCHAR(20),
    NUMTRANSVENDA INT,
    CUSTOREAL DECIMAL(15,4),
    CODFORNEC INT
  )`,

  // Vendedor (RCA) da venda: PCMOV.CODUSUR -> PCUSUARI.NOME, para a aba Vendas
  // da Análise do Produto (011, R-123).
  `CREATE TABLE IF NOT EXISTS PCUSUARI (
    CODUSUR INT PRIMARY KEY,
    NOME VARCHAR(80)
  )`,

  // Entrada de NF no WinThor (005, R-027): é dela que sgcWintNfEntradas/
  // sgcWintNfBuscar leem; DTCANCEL preenchida = nota cancelada, nunca conta.
  `CREATE TABLE IF NOT EXISTS PCNFENT (
    NUMTRANSENT INT PRIMARY KEY,
    NUMNOTA INT,
    SERIE VARCHAR(10),
    CODFORNEC INT,
    CODFILIAL VARCHAR(10),
    DTEMISSAO VARCHAR(10),
    DTENT VARCHAR(10),
    DTCANCEL VARCHAR(10),
    VLTOTAL DECIMAL(15,2),
    CHAVENFE VARCHAR(50),
    PRAZO INT,
    ESPECIE VARCHAR(20)
  )`,

  // Duplicatas da NF (005, R-027): sgcWintNfParcelas lê os dias de vencimento
  // (resultadoDePrazo, RN-007 do plan da 005) por NUMTRANSENT/NUMNOTA.
  `CREATE TABLE IF NOT EXISTS PCLANC (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    NUMTRANSENT INT,
    NUMNOTA INT,
    CODFORNEC INT,
    DTEMISSAO VARCHAR(10),
    DTVENC VARCHAR(10),
    VALOR DECIMAL(15,2),
    DUPLIC VARCHAR(20),
    NUMPARCELAMENTO INT
  )`,

  // CODATV1 marca cliente publico (licitação — RN-011, D-002 do plan da 003).
  // CGCENT é o CNPJ que sgcWintClienteBuscar procura e grava (008, R-069).
  `CREATE TABLE IF NOT EXISTS PCCLIENT (
    CODCLI INT PRIMARY KEY,
    CLIENTE VARCHAR(200),
    TIPOFJ VARCHAR(1),
    CODATV1 INT,
    CGCENT VARCHAR(20)
  )`,

  // Alimentam o seletor da tela de coberturas (nível departamento/seção).
  `CREATE TABLE IF NOT EXISTS PCDEPTO (
    CODEPTO INT PRIMARY KEY,
    DESCRICAO VARCHAR(200)
  )`,

  `CREATE TABLE IF NOT EXISTS PCSECAO (
    CODSEC INT PRIMARY KEY,
    DESCRICAO VARCHAR(200)
  )`,

  // sgcWintLotesAVencer (003): lote, endereço do lote e saldo por endereço.
  // R-130 (sgcWintBloqueiosProduto, 011): saldo, bloqueio e observações do lote.
  // 013 (R-133): DTEXCLUSAO — lote excluído não é saldo (a vencer e perdas).
  `CREATE TABLE IF NOT EXISTS PCLOTE (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    NUMLOTE VARCHAR(30),
    DTVALIDADE VARCHAR(10),
    QT DECIMAL(15,3),
    QTBLOQUEADA DECIMAL(15,3),
    QTRESERV DECIMAL(15,3),
    QTINDENIZ DECIMAL(15,3),
    MOTIVOBLOQESTOQUE VARCHAR(200),
    OBS1 VARCHAR(200),
    OBS2 VARCHAR(200),
    OBSANALISE VARCHAR(200),
    OBSBLOQUEIO VARCHAR(200),
    OBSBLOQUEIOMANUAL VARCHAR(200),
    DTBLOQUEIO1 VARCHAR(10),
    DTBLOQUEIO2 VARCHAR(10),
    CODFUNCRM INT,
    DTULTMOVENT VARCHAR(10),
    DTULTMOVSAI VARCHAR(10),
    DTEXCLUSAO VARCHAR(10)
  )`,

  // R-130: motivo de devolução/bloqueio, funcionário e os três históricos de
  // bloqueio que o legado consulta (o log do lote só diz quem e quando).
  `CREATE TABLE IF NOT EXISTS PCTABDEV (
    CODDEVOL INT PRIMARY KEY,
    MOTIVO VARCHAR(200),
    TIPO VARCHAR(10)
  )`,

  `CREATE TABLE IF NOT EXISTS PCEMPR (
    MATRICULA INT PRIMARY KEY,
    NOME VARCHAR(200)
  )`,

  `CREATE TABLE IF NOT EXISTS PCMOVBLOQUEIO (
    CODFILIAL VARCHAR(10),
    CODPROD INT,
    NUMLOTE VARCHAR(30),
    MOTIVO INT,
    CODOPER VARCHAR(10),
    CODFUNCLANC INT,
    ROTINALANC VARCHAR(20),
    DTMOV VARCHAR(19)
  )`,

  `CREATE TABLE IF NOT EXISTS PCBLOQUEIOEST (
    CODFILIAL VARCHAR(10),
    CODPROD INT,
    NUMLOTE VARCHAR(30),
    CODMOTIVO INT,
    CODROTINA INT,
    CODOPER VARCHAR(10),
    CODFUNCLANC INT,
    DATA VARCHAR(19),
    DTLANC VARCHAR(19),
    TIPOBLOQ VARCHAR(10),
    OBS VARCHAR(200)
  )`,

  `CREATE TABLE IF NOT EXISTS PCLOTELOG (
    CODFILIAL VARCHAR(10),
    CODPROD INT,
    NUMLOTE VARCHAR(30),
    DATA VARCHAR(19),
    PROGRAMA VARCHAR(40),
    USUARIO VARCHAR(40),
    OBSAPLICACAO VARCHAR(200),
    QTBLOQUEADA_ANT DECIMAL(15,3),
    QTBLOQUEADA DECIMAL(15,3)
  )`,

  `CREATE TABLE IF NOT EXISTS PCESTENDLOTE (
    CODPROD INT,
    NUMLOTE VARCHAR(30),
    MODULO VARCHAR(10),
    RUA VARCHAR(10),
    NUMERO VARCHAR(10),
    APTO VARCHAR(10),
    TIPOENDER VARCHAR(10),
    QT DECIMAL(15,3)
  )`,

  `CREATE TABLE IF NOT EXISTS PCLOTEEND (
    CODFILIAL VARCHAR(10),
    CODPROD INT,
    NUMLOTE VARCHAR(30),
    MODULO VARCHAR(10),
    RUA VARCHAR(10),
    NUMERO VARCHAR(10),
    APTO VARCHAR(10),
    TIPOENDER VARCHAR(10)
  )`,

  // sgcWintPrazoPagamento (003): condição praticada nos últimos pedidos.
  // R-132: o item do pedido de compra — o saldo pendente (pedida − entregue) dá a previsão de chegada.
  `CREATE TABLE IF NOT EXISTS PCITEM (
    NUMPED INT,
    CODPROD INT,
    QTPEDIDA DECIMAL(15,3),
    QTENTREGUE DECIMAL(15,3),
    PCOMPRA DECIMAL(15,4)
  )`,

  `CREATE TABLE IF NOT EXISTS PCPEDIDO (
    NUMPED INT PRIMARY KEY,
    CODFORNEC INT,
    CODFILIAL VARCHAR(10),
    DTEMISSAO VARCHAR(10),
    DTPREVENT VARCHAR(10),
    VLTOTAL DECIMAL(15,2),
    PRAZO1 INT,
    PRAZO2 INT,
    PRAZO3 INT
  )`,

  // Imita a tabela PRODUTOS da conexão gestao-de-custos (sgcCustoUnidadesPorCaixa, INTEGRATION).
  `CREATE TABLE IF NOT EXISTS CUSTO_PRODUTOS (
    CODPROD INT PRIMARY KEY,
    UNIDADES_POR_CAIXA DECIMAL(15,3)
  )`,

  // As políticas de preço especial da conexão gestao-de-custos (projeto 60574):
  // sgcCustoEspeciaisProdutos (INTEGRATION, R-125) lê as três.
  `CREATE TABLE IF NOT EXISTS COST_POLICIES (
    ID INT PRIMARY KEY,
    NAME VARCHAR(200),
    STATUS VARCHAR(20),
    DT_START VARCHAR(10),
    DT_END VARCHAR(10),
    CLIENTE_ID INT,
    FILIAL_ID INT
  )`,
  `CREATE TABLE IF NOT EXISTS POLICY_ITEMS (
    ID INT PRIMARY KEY,
    POLICY_ID INT,
    PRODUCT_ID INT,
    SPECIAL_COST DECIMAL(15,4),
    VARIATION_PERCENT DECIMAL(9,2)
  )`,
  // O custo padrão por produto e data de referência (R-128): sgcCustoPadraoAtual lê o mais recente.
  `CREATE TABLE IF NOT EXISTS CUSTOPRODUTO (
    ID INT PRIMARY KEY,
    CODPROD INT,
    CUSTO DECIMAL(15,4),
    DATA_REF VARCHAR(10)
  )`,
  `CREATE TABLE IF NOT EXISTS COST_POLICY_CLIENTS (
    ID INT PRIMARY KEY,
    POLICY_ID INT,
    CLIENTE_ID INT
  )`,
];
