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

/** @returns {string|null} mensagem de erro pronta para o usuário, ou null */
function validar(campo, valor) {
  const regra = CAMPOS[campo];
  if (!regra) return null;

  const texto = String(valor ?? '').trim();

  if (!texto) {
    return regra.obrigatorio ? `Informe ${regra.rotulo}.` : null;
  }
  if (texto.length < regra.min) {
    return `Escreva ${regra.rotulo} com pelo menos ${regra.min} caracteres.`;
  }
  if (texto.length > regra.max) {
    // modelo sem concordância de número: serve para "o endereço" e "as observações"
    return `Limite de ${regra.max} caracteres para ${regra.rotulo} — você enviou ${texto.length}.`;
  }
  return null;
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

module.exports = { CAMPOS, validar, validarTodos, paraCliente };
