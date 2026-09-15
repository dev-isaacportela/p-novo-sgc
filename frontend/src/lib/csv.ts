// CSV — R-037 do 000: uma implementação só, usada por /notas-fiscais,
// /faturamentos-pendentes, /nfs-em-atraso e /bo. Regra pura, sem SF nova e sem
// segunda consulta: quem chama monta cabeçalho/linhas a partir do que já
// carregou e só pede o texto e o download aqui.

/** Escapa aspas e envolve o campo em aspas quando ele tem separador, aspa ou
 * quebra de linha — o mínimo que o CSV (RFC 4180) exige para abrir certo no
 * Excel. Separador `;` (não `,`): é o que o Excel em pt-BR espera sem
 * configuração extra, com números em vírgula decimal. */
function escaparCampo(valor: string | number): string {
  const texto = String(valor);
  if (/[;"\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Monta o texto CSV a partir do cabeçalho e das linhas já formatadas pela
 * tela (número já em vírgula decimal quando for o caso — esta função só
 * escapa e junta). Quebra de linha `\r\n`, como o Excel espera. */
export function textoCsv(cabecalho: string[], linhas: (string | number)[][]): string {
  const todas = [cabecalho, ...linhas];
  return todas.map((linha) => linha.map(escaparCampo).join(';')).join('\r\n');
}

/** Dispara o download do texto como arquivo, com BOM UTF-8 (acentos corretos
 * no Excel do Windows). Não usa `<a download>`: o link some depois do clique,
 * então o elemento é criado, clicado e removido na hora. */
const BOM_UTF8 = String.fromCharCode(0xfeff);

export function baixarCsv(nome: string, texto: string): void {
  const blob = new Blob([BOM_UTF8 + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
