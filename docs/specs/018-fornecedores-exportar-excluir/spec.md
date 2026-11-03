# Spec: Fornecedores — exportar a parametrização e excluí-la guardando uma cópia

**ID:** 018-fornecedores-exportar-excluir · **Status:** aprovada (2026-11-03): P-01..P-07 aprovadas como implementadas, R-192 · **Data:** 2026-11-03 · **Estende:** [001-fornecedores](../001-fornecedores/spec.md) · **Origem:** p-60523, Parametrização de Fornecedor (`docs/regras-de-negocio/07-parametrizacoes.md`, RN-PAR-07, RN-PAR-08, RN-PAR-12; tela `ParametrizacaoFornecedorPage`)

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

No SGC anterior, a tela de parametrização tinha dois botões que o SGC 2 ainda
não tem. **Exportar planilha** tirava, de uma vez, tudo o que estava
parametrizado (prazos, pedido mínimo, filiais, linhas, contatos, faixas de prazo
de pagamento e documentos) para conferir fora do sistema, mandar para a
diretoria ou guardar como fotografia antes de uma renegociação. **Excluir
parametrização** desfazia o cadastro de um fornecedor que deixou de ser
atendido ou que foi parametrizado por engano, guardando antes uma cópia do que
foi apagado. Hoje, no SGC 2, a conferência é tela a tela e o engano não tem
volta: só dá para inativar, e o fornecedor inativo continua na lista com dados
que ninguém mais quer.

## Resultado esperado

Quem cuida de compras baixa num arquivo a parametrização de todos os
fornecedores (ou só do que está aberto) e, se tiver permissão, exclui a
parametrização de um fornecedor sabendo que uma cópia do que foi apagado ficou
guardada com o nome de quem excluiu e quando.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| gestor de compras | exportar para conferir e renegociar; excluir parametrização feita por engano ou de fornecedor que saiu | mensal / eventual |
| diretoria | exportar para revisar prazos de pagamento e pedido mínimo; excluir, como o gestor | mensal / eventual |
| admin (TI) | excluir e, se preciso, recuperar o que foi apagado pela cópia | eventual |
| analista (compradora) | exportar para consultar; não exclui | eventual |

Quem é do comercial não vê o módulo (RN-012 da 001).

## Cenários

**C-001 — Exportar a parametrização de todos os fornecedores**
- **Dado que** existem 3 fornecedores parametrizados (1015 Fresenius, 1042 Nestlé
  e 1088 Danone, este inativo), o 1015 com 2 filiais, 2 linhas, 3 contatos e 5
  opções de prazo
- **Quando** a analista clica em **Exportar planilha** na lista de fornecedores
- **Então** baixa um arquivo `parametrizacoes-fornecedores-AAAA-MM-DD.csv` que
  abre no Excel com acentos certos e tem um bloco por fornecedor, na ordem do
  nome, cada bloco com as seções Dados gerais, Filiais atendidas, Linhas de
  produto, Contatos, Prazos de pagamento e Documentos; o bloco do 1015 traz as 2
  filiais, as 2 linhas, os 3 contatos e as 5 opções; o 1088 aparece, marcado
  "Inativo"

**C-002 — Exportar só o fornecedor aberto**
- **Dado que** o gestor está na parametrização do 1015 e mudou o pedido mínimo
  na tela sem salvar
- **Quando** ele clica em **Exportar**
- **Então** baixa `parametrizacao-fornecedor-1015-AAAA-MM-DD.csv` com só o bloco
  do 1015 e o pedido mínimo **gravado**, não o digitado *(P-02)*

**C-003 — O que fica vazio na exportação**
- **Dado que** o 1042 não tem documento nem contato e tem os prazos de SLA em
  branco, e uma faixa do 1015 não tem teto
- **Quando** a parametrização é exportada
- **Então** as seções Contatos e Documentos do 1042 dizem "Sem dados"; os prazos
  de análise e de faturamento do 1042 saem "Padrão do sistema (1)" e "Padrão do
  sistema (5)"; o "valor até" da faixa sem teto sai "sem teto"; o pedido mínimo
  sai com vírgula decimal ("5000,00")

**C-004 — Nada para exportar**
- **Dado que** nenhum fornecedor está parametrizado
- **Quando** alguém clica em **Exportar planilha**
- **Então** nenhum arquivo é baixado e a tela diz "Nenhuma parametrização de
  fornecedor cadastrada para exportar."

**C-005 — Excluir a parametrização guardando a cópia**
- **Dado que** o fornecedor 1099 está parametrizado com 1 filial, 1 linha com 1
  contato e 2 opções de prazo, 1 documento e 2 alterações no histórico
- **Quando** o gestor clica em **Excluir parametrização**, lê o aviso e confirma
- **Então** o 1099 sai da lista de fornecedores parametrizados; ao abrir o 1099
  de novo, a tela diz que ele não tem parametrização e começa em branco; o
  cadastro do ERP não muda; e fica guardada uma cópia com a parametrização
  inteira (dados gerais, a filial, a linha, o contato, as 2 opções e o
  documento), o código e o nome do fornecedor, quem excluiu e quando

**C-006 — Quem não parametriza não exclui**
- **Dado que** a analista abre a parametrização do 1015
- **Quando** ela procura o botão de excluir
- **Então** o botão aparece desabilitado com o motivo; e se a exclusão for pedida
  ao servidor por fora da tela, em nome dela, nada é apagado e nenhuma cópia é
  guardada — o mesmo vale para quem tem acesso somente leitura

**C-007 — Nada sai sem a cópia**
- **Dado que** o 1015 está parametrizado e nenhuma cópia dele foi guardada
- **Quando** alguém com permissão pede ao servidor para apagar as filiais, as
  linhas ou o próprio fornecedor sem antes guardar a cópia
- **Então** nada é apagado

**C-008 — Exclusão interrompida termina na segunda tentativa**
- **Dado que** a exclusão do 1099 parou no meio (a cópia foi guardada e só as
  filiais foram apagadas)
- **Quando** o gestor clica de novo em **Excluir parametrização** e confirma
- **Então** o resto é apagado e continua existindo **uma** cópia só, a primeira,
  com a parametrização inteira (inclusive as filiais)

**C-009 — Parametrizar de novo depois de excluir**
- **Dado que** a parametrização do 1099 foi excluída
- **Quando** o gestor parametriza o 1099 de novo e salva
- **Então** o 1099 volta à lista só com o que foi salvo agora; nada da
  parametrização excluída reaparece; se ele for excluído outra vez, fica uma
  segunda cópia, e a primeira continua guardada

**C-010 — Pedidos e agendamentos do fornecedor não somem**
- **Dado que** o 1099 tem um pedido aberto no quadro e um agendamento de análise
- **Quando** a parametrização do 1099 é excluída
- **Então** o pedido e o agendamento continuam; o aviso de confirmação disse,
  antes, que eles ficam e que, até o fornecedor ser parametrizado de novo, o
  envio desse pedido não terá contato cadastrado e o prazo de pagamento não terá
  faixa para comparar *(P-03)*

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | A lista de fornecedores DEVE ter **Exportar planilha**, que baixa num arquivo só a parametrização de todos os fornecedores parametrizados, ativos e inativos, independente do filtro da tela *(P-02)* | C-001: 3 parametrizados → 3 blocos, o inativo incluído, mesmo com o filtro "ativos" ligado | must |
| RF-002 | A parametrização de um fornecedor DEVE ter **Exportar**, que baixa só aquele fornecedor, com o que está gravado | C-002 | must |
| RF-003 | O arquivo DEVE abrir no Excel em português sem configurar nada (acentos, separador, vírgula decimal) e ter, por fornecedor, as seções e colunas da RN-002 | C-001, C-003 | must |
| RF-004 | Sem fornecedor parametrizado, exportar DEVE avisar e não baixar nada | C-004 | must |
| RF-005 | A parametrização de um fornecedor que já tem parametrização gravada DEVE ter **Excluir parametrização**, com confirmação que diz o que é apagado, o que fica e que uma cópia é guardada | o botão não aparece para fornecedor ainda não parametrizado; a confirmação cita "cópia", "ERP", "pedidos" e "agendamentos" | must |
| RF-006 | Excluir DEVE apagar a parametrização inteira do fornecedor (parâmetros, filiais, linhas, contatos, faixas e documentos) e guardar antes uma cópia dela com quem excluiu e quando | C-005 | must |
| RF-007 | Só admin, gestor e diretoria DEVEM conseguir excluir; a recusa vale também no servidor; acesso somente leitura não exclui | C-006 | must |
| RF-008 | Nada DEVE ser apagado sem a cópia já guardada | C-007 | must |
| RF-009 | Uma exclusão interrompida DEVE poder ser repetida até o fim, sem segunda cópia | C-008 | must |
| RF-010 | Depois de excluir, a tela DEVE confirmar que a parametrização sumiu (relendo o fornecedor) e voltar ao estado "sem parametrização"; se ela não sumiu, DEVE dizer que a exclusão não foi feita | C-005, C-006 | must |
| RF-011 | O histórico de alterações do fornecedor DEVE continuar guardado depois da exclusão *(P-04)* | C-005: as 2 alterações continuam guardadas | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Exportar 300 fornecedores custa no máximo 3 idas ao servidor | contador de chamadas (blocos de 100 fornecedores) |
| RNF-002 | Excluir custa no máximo 10 idas ao servidor | contador de chamadas: reler, guardar a cópia, 6 exclusões, reler |
| RNF-003 | Os botões e a confirmação funcionam nos temas claro e escuro e a partir de 400 px | verificação manual |

## Entidades do domínio

- **Parametrização do fornecedor** — a da spec 001 (parâmetros, filiais, linhas,
  contatos, faixas de prazo, documentos e histórico).
- **Cópia da exclusão** — fotografia de uma parametrização no instante em que foi
  excluída: o fornecedor (código, nome, CNPJ), o conteúdo inteiro, quem excluiu e
  quando. Uma por parametrização excluída; sobrevive à parametrização e não é
  apagada por nada desta feature.
- **Planilha da parametrização** — arquivo com um bloco por fornecedor; o bloco
  tem seções fixas, cada uma com o seu cabeçalho.

## Regras de negócio

- **RN-001** — A exportação é um arquivo de texto separado por ponto e vírgula
  que o Excel em português abre direto, como todas as exportações do SGC 2
  (R-094) *(P-01)*.
- **RN-002** — Cada fornecedor vira um bloco, na ordem do nome do fornecedor:
  uma linha com o código e o nome, e depois, separadas por uma linha em branco,
  as seções, cada uma com título, cabeçalho e linhas, ou "Sem dados":
  - **Dados gerais** (Campo, Valor): Código do fornecedor, Fornecedor, CNPJ (com
    pontuação), Situação (Ativo/Inativo), Prazo de entrega em dias, Tipo de
    prazo (úteis/corridos), Prazo de análise em dias úteis (meta SLA), Prazo de
    faturamento em dias úteis (meta SLA), Pedido mínimo, Fechamento — dia
    inicial, Fechamento — dia final, Link da plataforma, Validade mínima na NF em
    dias, Atualizado em (dd/mm/aaaa hh:mm);
  - **Filiais atendidas** (Código da filial, Nome da filial);
  - **Linhas de produto** (Nome da linha);
  - **Contatos** (Linha, Nome do contato, E-mail);
  - **Prazos de pagamento** (Linha, Valor de, Valor até, Opção, Parcelas em
    dias) — uma linha por opção, com as parcelas como o SGC 2 as escreve
    (`30/60/90`);
  - **Documentos** (Tipo, Arquivo, Vencimento em dd/mm/aaaa, Link).
- **RN-003** — Prazo de SLA não preenchido sai "Padrão do sistema (1)" (análise)
  e "Padrão do sistema (5)" (faturamento); faixa sem teto sai "sem teto";
  valores em R$ com duas casas e vírgula decimal; vazio fica vazio.
- **RN-004** — Excluir e exportar não tocam no cadastro do ERP: o fornecedor
  continua disponível para ser parametrizado de novo do zero.
- **RN-005** — Excluem as mesmas personas que parametrizam — admin, gestor e
  diretoria —, nunca acesso somente leitura; a decisão é conferida no servidor
  *(P-05)*.
- **RN-006** — A cópia é guardada antes de qualquer exclusão; sem cópia guardada,
  nenhuma parte da parametrização é apagada. Uma parametrização tem no máximo uma
  cópia, a primeira.
- **RN-007** — A exclusão não é bloqueada por pedido ou agendamento do
  fornecedor, como no SGC anterior; o aviso diz o que eles perdem *(P-03)*.
- **RN-008** — O histórico de alterações não é apagado *(P-04)*; os arquivos dos
  documentos continuam no endereço onde foram enviados, e a cópia guarda o
  endereço *(P-07)*.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 · RNF-001 | A leitura da exportação devolve tantos fornecedores quanto o total da lista sem filtro, o inativo incluído, na ordem do nome; o 1015 vem com as filiais, linhas, contatos e faixas que a abertura da parametrização devolve; em blocos de 2, as duas páginas somam o total sem repetir | regra de negócio |
| C-002 | A exportação de um código devolve só aquele fornecedor; o arquivo de um fornecedor só tem um bloco e o nome `parametrizacao-fornecedor-1015-AAAA-MM-DD.csv` | regra de negócio · regra de tela |
| C-003 · RN-002 · RN-003 | Montar o arquivo de 2 fornecedores: 1015 com faixa sem teto e pedido mínimo 5000 → "sem teto" e "5000,00"; 1042 sem contato, sem documento e SLA 0 → "Sem dados" nas duas seções e "Padrão do sistema (1)"/"(5)"; as seções aparecem na ordem da RN-002 com os cabeçalhos exatos; os blocos vêm separados por linha em branco | regra de tela |
| C-004 | Montar o arquivo de 0 fornecedores devolve vazio (a tela avisa e não baixa) | regra de tela |
| C-005 · RN-004 · RN-008 | O gestor guarda a cópia e apaga as 6 partes do 1099: a abertura do 1099 devolve "sem parametrização"; não sobra filial, linha, contato, faixa nem documento dele; a cópia tem o código 1099, o nome, o CNPJ, o id do gestor, a data e, no conteúdo, 1 filial, 1 linha, 1 contato, 2 faixas e 1 documento; as 2 alterações do histórico continuam; o 1015 continua com as mesmas contagens | regra de negócio |
| C-006 · RN-005 | A analista (e um usuário somente leitura) pede a cópia e as 6 exclusões do 1015: nenhuma cópia, e o 1015 continua com filiais, linhas e documentos; na tela, `editarFornecedor` é falso para analista e para somente leitura, verdadeiro para admin, gestor e diretoria | regra de negócio · regra de tela |
| C-007 · RN-006 | O gestor pede as 6 exclusões do 1015 sem guardar a cópia: nada é apagado | regra de negócio |
| C-008 | Guardar a cópia, apagar só as filiais e repetir a sequência inteira: uma cópia só, com a filial no conteúdo; a parametrização some | regra de negócio |
| C-009 | Salvar o 1099 de novo depois da exclusão devolve sucesso e a abertura mostra só o novo; excluir de novo deixa 2 cópias do 1099 | regra de negócio |
| C-010 · RN-007 | Com um pedido e um agendamento do 1099, a exclusão acontece e os dois continuam; o texto da confirmação cita "pedidos", "agendamentos", "contato" e "faixa" | regra de negócio · regra de tela |
| RF-010 | A cópia montada pela tela leva tudo o que a abertura devolve, menos o histórico; a sequência de exclusão é: guardar a cópia, contatos, faixas, linhas, filiais, documentos e o fornecedor por último | regra de tela |

- O que só olho humano verifica:
  - [ ] C-001/C-002 — os botões de exportar na lista e na parametrização, nos temas claro e escuro, a 400 px
  - [ ] C-005 — a confirmação de exclusão (texto, botão destrutivo) nos dois temas; depois de excluir, o aviso de sucesso e a tela em branco
  - [ ] C-006 — a analista vê o botão de excluir desabilitado, com o motivo
  - [ ] RF-003 — o arquivo abre no Excel/LibreOffice com acentos e colunas certas

## Fora de escopo

- [ ] **Planilha `.xlsx` com uma aba por fornecedor** — o SGC 2 exporta CSV (R-094); um arquivo, um bloco por fornecedor *(P-01)*.
- [ ] **Tela para consultar ou restaurar a cópia** — a cópia fica guardada; consultá-la ou restaurá-la é do TI, fora da tela *(P-06)*.
- [ ] **Apagar o arquivo dos documentos** — o arquivo enviado continua no endereço público *(P-07)*.
- [ ] **Excluir o fornecedor do ERP** — o SGC só lê o cadastro do ERP (001).
- [ ] **Exportar respeitando o filtro da lista** — exporta todos, como o SGC anterior *(P-02)*.
- [ ] **Importar a planilha** — a exportação é só de saída.
- [ ] **Exportar ou excluir regra de cobertura por curva** — a exclusão com cópia de cobertura do SGC anterior (RN-PAR-25) é da 012.

## Perguntas ao usuário (divergências do legado e decisões em aberto)

Cada proposta é o que está implementado; trocar uma é mexer num ponto só.

| # | O legado | Proposta (implementada) | Alternativa | Por quê |
|---|---|---|---|---|
| P-01 | Planilha `.xlsx`, uma aba por fornecedor (RN-PAR-12) | **CSV (`;`, acentos para o Excel), um arquivo com um bloco por fornecedor**, as mesmas seções e colunas da aba do legado | voltar o `.xlsx` (dependência nova, contra a R-094) | A R-094 tirou o `.xlsx`; a regra do legado pede o conteúdo, não o formato; o bloco por fornecedor reproduz a aba |
| P-02 | Um botão só, na tela única, que exporta todos os parametrizados | **Dois**: na lista, todos os parametrizados (sem olhar o filtro, como o legado); na parametrização aberta, só aquele fornecedor, com o que está gravado | só o da lista; ou o da lista respeitando o filtro | O SGC 2 separa lista e parametrização; exportar o que está aberto é o pedido mais comum, e "o gravado" evita exportar edição não salva como se fosse oficial |
| P-03 | Não bloqueia a exclusão por pedido ou agendamento do fornecedor | **Não bloqueia**; a confirmação avisa que pedidos e agendamentos ficam e que o envio e o prazo de pagamento deles ficam sem contato e sem faixa até parametrizar de novo | bloquear com pedido aberto no quadro | O legado não bloqueia; o fornecedor que saiu costuma ter pedido antigo, e bloquear prenderia a exclusão a pedidos encerrados há meses |
| P-04 | Apaga o histórico de alterações junto, e a cópia não o guarda | **O histórico fica**; a cópia guarda o resto | apagar o histórico (o legado) | O histórico é a auditoria de quem mudou o quê; apagá-lo na exclusão perde exatamente o que a cópia quer preservar |
| P-05 | Excluem admin, diretoria e gestor (ou ADMIN da plataforma), as mesmas de editar (RN-PAR-07) | **As mesmas de parametrizar** (admin, gestor, diretoria; nunca somente leitura) | só admin | Excluir não pode ser mais solto que editar, nem mais restrito sem motivo; o legado já era assim |
| P-06 | Sem tela para as cópias; uma consulta existia no servidor sem uso | **Sem tela e sem restaurar** nesta feature; a cópia guarda o conteúdo inteiro, legível pelo TI | uma aba "Exclusões" com restaurar | Ninguém usou a consulta do legado; restaurar é parametrizar de novo, e a cópia tem tudo o que é preciso |
| P-07 | Os arquivos dos documentos continuam no armazenamento | **Continuam**; a cópia guarda o endereço | apagar o arquivo | Apagar arquivo não tem volta e a cópia perderia o anexo |

## Pendências

Nenhuma que bloqueie: as perguntas acima têm proposta implementada e esperam o
usuário.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminho de erro (C-004, C-006, C-007, C-008)
- [x] Seção "Testes" preenchida: todo C-0NN e toda RN-0NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto (as perguntas têm proposta)
