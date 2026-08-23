/**
 * Limites de tamanho dos campos — fonte única de verdade.
 *
 * O servidor valida com isto E o formulário aplica os mesmos números
 * (recebidos via /api/config). Assim os dois lados não podem divergir:
 * mudar aqui muda nos dois.
 *
 * Regra importante: NÃO cortar silenciosamente. Um endereço truncado vira
 * endereço errado e o profissional bate na porta errada. Melhor recusar com
 * mensagem clara do que gravar dado pela metade.
 */

const CAMPOS = {
  descricao: { min: 10, max: 2000, rotulo: 'a descrição do problema', obrigatorio: true },
  cliente_nome: { min: 2, max: 120, rotulo: 'seu nome', obrigatorio: true },
  cliente_telefone: { min: 8, max: 30, rotulo: 'o telefone', obrigatorio: true },
  cliente_email: { min: 0, max: 160, rotulo: 'o e-mail', obrigatorio: false },
  endereco: { min: 5, max: 240, rotulo: 'o endereço', obrigatorio: true },
  bairro: { min: 2, max: 80, rotulo: 'o bairro', obrigatorio: true },
  // campos internos do painel
  observacoes_internas: { min: 0, max: 5000, rotulo: 'as observações internas', obrigatorio: false },
  // consulta pública
  codigo: { min: 3, max: 20, rotulo: 'o código', obrigatorio: true }
};

// ------------------------------------------------------------------ formato

/**
 * Formato, não só tamanho.
 *
 * Limite de caractere impede campo gigante; não impede campo sem sentido.
 * "meu zap" cabia nos 30 caracteres do telefone e passava — e o painel
 * montava o link do WhatsApp com número vazio, deixando o chamado sem contato.
 *
 * Cada normalizador devolve o valor canônico ou null quando o conteúdo não
 * serve. Guardar já normalizado evita o mesmo telefone gravado de cinco jeitos.
 *
 * Isto NÃO é defesa contra injeção de SQL, e não deve ser confundido com uma.
 * O store fala com o PostgREST por HTTP, com todo valor em encodeURIComponent
 * ou em corpo JSON, e não monta SQL em lugar nenhum. A motivação aqui é dado
 * utilizável — poder ligar para o cliente e achar o endereço.
 */

/** Telefone brasileiro. Aceita como o cliente digitar, guarda (DD) NNNNN-NNNN. */
function normalizarTelefone(texto) {
  let d = texto.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);  // veio com o país
  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;                    // não existe DDD abaixo de 11

  // celular tem 9 dígitos e começa com 9; fixo tem 8 e começa entre 2 e 5
  if (d.length === 11 && d[2] !== '9') return null;
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null;

  const corte = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** Só recusa o que claramente não é e-mail; validar de verdade é enviar. */
function normalizarEmail(texto) {
  const e = texto.toLowerCase();
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e) && !/\.\./.test(e) ? e : null;
}

/** Nome e bairro precisam ter letra: "123" e "...." não são nem um nem outro. */
function comLetra(texto) {
  return /\p{L}/u.test(texto) ? texto.replace(/\s+/g, ' ') : null;
}

/** O gerador em store.js produz SQG- e quatro dígitos, sempre. */
function normalizarCodigo(texto) {
  const c = texto.toUpperCase().replace(/\s/g, '');
  return /^SQG-\d{4}$/.test(c) ? c : null;
}

const FORMATOS = {
  cliente_telefone: { normalizar: normalizarTelefone, erro: 'Telefone inválido. Informe com DDD — ex.: (55) 99999-9999.' },
  cliente_email:    { normalizar: normalizarEmail,    erro: 'E-mail inválido. Confira ou deixe o campo em branco.' },
  cliente_nome:     { normalizar: comLetra,           erro: 'Informe seu nome.' },
  bairro:           { normalizar: comLetra,           erro: 'Informe o bairro.' },
  codigo:           { normalizar: normalizarCodigo,   erro: 'Código inválido. Ele tem o formato SQG-1234.' }
};

/** @returns {string|null} mensagem de erro pronta para o usuário, ou null */
function validar(campo, valor) {
  const regra = CAMPOS[campo];
  if (!regra) return null;

  const texto = String(valor ?? '').trim();

  if (!texto) {
    return regra.obrigatorio ? `Informe ${regra.rotulo}.` : null;
  }
  // Formato antes de tamanho. Para um telefone, "pelo menos 8 caracteres"
  // descreve o sintoma errado: o problema de "meu zap" não é ser curto.
  // Campos sem formato (descrição, endereço) caem direto na regra de tamanho.
  const formato = FORMATOS[campo];
  if (formato && formato.normalizar(texto) === null) return formato.erro;

  if (texto.length < regra.min) {
    return `Escreva ${regra.rotulo} com pelo menos ${regra.min} caracteres.`;
  }
  if (texto.length > regra.max) {
    // modelo sem concordância de número: serve para "o endereço" e "as observações"
    return `Limite de ${regra.max} caracteres para ${regra.rotulo} — você enviou ${texto.length}.`;
  }

  return null;
}

/**
 * Valor canônico para gravar. Chame sempre depois de validar: se o conteúdo
 * não serve, devolve o texto original em vez de inventar dado.
 */
function normalizar(campo, valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return texto;
  const formato = FORMATOS[campo];
  return formato ? (formato.normalizar(texto) ?? texto) : texto;
}

/** Valida vários campos de uma vez e devolve o primeiro erro encontrado. */
function validarTodos(dados, campos) {
  for (const campo of campos) {
    const erro = validar(campo, dados[campo]);
    if (erro) return erro;
  }
  return null;
}

/** Versão enxuta para o navegador: só o que o formulário precisa. */
function paraCliente() {
  const saida = {};
  for (const [campo, r] of Object.entries(CAMPOS)) {
    saida[campo] = { min: r.min, max: r.max };
  }
  return saida;
}

module.exports = { CAMPOS, validar, validarTodos, normalizar, paraCliente };
