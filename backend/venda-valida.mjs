// O recorte de venda válida (R-131), num lugar só: as SFs que contam venda na
// 011 (add-013) e a análise de montagem da 003 (add-006, R-133) usam os MESMOS
// fragmentos, para a venda de um produto bater nas duas telas. Os fragmentos
// exigem PCMOV como `M` e `LEFT JOIN PCCLIENT C`.

/**
 * Cliente de órgão público (ramos 11 a 15 do PCATIVI, "ORGAO PUBLICO …"). R-131:
 * fica FORA da demanda por padrão — a tela traz o seletor marcado e quem o
 * desmarca vê com o público; por isso a consulta segue devolvendo a parte
 * pública segregada. O ramo 20 é "FILIAL" (venda para a própria rede): saiu
 * daqui e entrou em ENTRE_FILIAIS, que fica fora sempre.
 */
export const PUBLICO = 'NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15)';

/**
 * R-131: venda para a própria rede — o ramo 20 (FILIAL) ou o cliente que é uma
 * filial do grupo (PCFILIAL.CODCLI). No WinThor real os dois recortes são o
 * mesmo (64 linhas, 4.827 un. em 153 dias na filial 1); os dois ficam por
 * robustez. `NVL(M.CODCLI, 0)`: venda sem cliente não pode virar NULL no NOT.
 */
// `NVL(FX.CODCLI, 0) > 0` e não `IS NOT NULL`: o gerador CONNECT BY do dialeto do simulador casa
// até o próximo `IS NOT NULL` da consulta (o calendário da principal viraria número).
const ENTRE_FILIAIS = `(NVL(C.CODATV1, 0) = 20 OR NVL(M.CODCLI, 0) IN (SELECT FX.CODCLI FROM PCFILIAL FX WHERE NVL(FX.CODCLI, 0) > 0))`;

/** R-131 (RN-CI-07 e RN-EST-11 do legado): remessa de entrega futura — a venda já contou na nota de venda (CONDVENDA 7). */
const REMESSA_FUTURA = `EXISTS (SELECT 1 FROM PCNFSAID NF WHERE NF.NUMTRANSVENDA = M.NUMTRANSVENDA AND NF.CONDVENDA = 8)`;

/**
 * RN-001 (R-131): a venda que conta na 011 — UM recorte só, para lista,
 * curvas, gráfico, previsão, aba Vendas, custo especial e o resumo do seletor
 * baterem. Exige PCMOV como `M` e `LEFT JOIN PCCLIENT C`. O público fica de
 * fora à parte (PUBLICO), porque a tela decide.
 */
export const VENDA_VALIDA = `(M.CODOPER = 'S' AND M.QT > 0 AND NOT ${ENTRE_FILIAIS} AND NOT ${REMESSA_FUTURA})`;
