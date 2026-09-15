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
// Colunas: as que os plans 001 (§Simulador) e 003 (§"Tabelas PC*") citam.

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

  `CREATE TABLE IF NOT EXISTS PCFILIAL (
    CODIGO VARCHAR(10) PRIMARY KEY,
    RAZAOSOCIAL VARCHAR(200),
    CGC VARCHAR(18),
    UF VARCHAR(2)
  )`,

  // sgcWintAnaliseMontagem / sgcWintBuscarProduto (003). OBS2 marca inativo;
  // PRAZOVAL e a validade minima do produto (dias).
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
    PRAZOVAL INT
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
    CUSTOULTENT DECIMAL(15,4),
    DTULTENT VARCHAR(10),
    DTULTSAIDA VARCHAR(10)
  )`,

  `CREATE TABLE IF NOT EXISTS PCESTTRANSITO (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    QTTRANSITO DECIMAL(15,3),
    DTPREVISTA VARCHAR(10)
  )`,

  // Movimento de venda (sgcWintAnaliseMontagem soma por CODOPER = 'S').
  `CREATE TABLE IF NOT EXISTS PCMOV (
    NUMTRANSITEM INT,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    CODCLI INT,
    CODOPER VARCHAR(1),
    DTMOV VARCHAR(10),
    QT DECIMAL(15,3),
    PUNIT DECIMAL(15,4),
    NUMPED INT
  )`,

  // CODATV1 marca cliente publico (licitação — RN-011, D-002 do plan da 003).
  `CREATE TABLE IF NOT EXISTS PCCLIENT (
    CODCLI INT PRIMARY KEY,
    CLIENTE VARCHAR(200),
    TIPOFJ VARCHAR(1),
    CODATV1 INT
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
  `CREATE TABLE IF NOT EXISTS PCLOTE (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODPROD INT,
    CODFILIAL VARCHAR(10),
    NUMLOTE VARCHAR(30),
    DTVALIDADE VARCHAR(10)
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
  `CREATE TABLE IF NOT EXISTS PCPEDIDO (
    NUMPED INT PRIMARY KEY,
    CODFORNEC INT,
    CODFILIAL VARCHAR(10),
    DTEMISSAO VARCHAR(10),
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
];
