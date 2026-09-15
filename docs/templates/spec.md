# Spec: [NOME DA FEATURE]

**ID:** NNN-slug · **Status:** rascunho | em revisão | aprovada · **Data:** AAAA-MM-DD

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

[Que dor existe hoje, para quem, e o que custa deixar como está. 3-5 linhas.]

## Resultado esperado

[Como fica depois. Uma frase que o usuário final assinaria embaixo.]

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| [ex: gestor financeiro] | [ex: acompanhar saldo por centro de custo] | [diária] |

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — [título]**
- **Dado que** [estado inicial]
- **Quando** [ação do usuário]
- **Então** [resultado observável]

**C-002 — [caso de erro / borda]**
- **Dado que** …
- **Quando** …
- **Então** …

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE … | [verificável, com número quando couber] | must |
| RF-002 | O sistema DEVE … | … | should |

> `must` = sem isso a feature não entrega valor. `should` = entra se couber.
> `could` = registrado, não prometido.

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | [ex: listagem responde em até 2s com 10k registros] | [cronômetro, volume de teste] |

## Entidades do domínio

Conceitos do negócio e como se relacionam — **sem** schema, tipo ou tabela.

- **[Entidade]** — [o que representa]. Relaciona-se com [outra] por [regra].

## Regras de negócio

- **RN-001** — [ex: lançamento com data futura entra como "pendente"]

## Testes

**Obrigatório.** Todo sistema e toda feature nascem com testes automatizados:
cenário sem teste é cenário não entregue, e uma spec sem esta seção
preenchida não é aprovada. Aqui se decide **o quê** precisa de evidência
automática e com que números; **como** (arquivo, ferramenta) é do `plan.md`.

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | [ex: com 3 itens abertos, a listagem devolve 3 e o total é 3] | regra de negócio |
| C-002 | [ex: título vazio é recusado e a mensagem cita "título"] | regra de negócio |
| RN-001 | [ex: nascimento 10/03/1958 em 27/08/2026 mostra 68 anos] | regra de tela |

- Cada cenário C-00N e cada regra RN-00N tem pelo menos uma linha.
- Toda linha tem entrada e resultado concretos; "executa sem erro" não é evidência.
- **Camada** diz onde a regra mora: *regra de negócio* (o que o sistema grava
  e devolve) ou *regra de tela* (cálculo, formatação, máscara que a pessoa vê).
- O que só olho humano verifica (layout, tema, navegação) fica em
  **Verificação manual**, listado aqui:
  - [ ] [ex: C-003 — tela em tema claro sem cor quebrada]

## Fora de escopo

Obrigatório. O que não estiver listado como incluído está excluído.

- [ ] [o que explicitamente NÃO será feito, e por quê]

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- [ ] `[NEEDS CLARIFICATION: pergunta objetiva para o usuário]`

## Checklist de revisão

- [ ] Nenhuma menção a tecnologia, tabela ou componente
- [ ] Todo RF tem critério de aceite verificável
- [ ] Seção "Fora de escopo" preenchida
- [ ] Cenários cobrem pelo menos um caminho de erro
- [ ] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [ ] Zero `[NEEDS CLARIFICATION]` em aberto
