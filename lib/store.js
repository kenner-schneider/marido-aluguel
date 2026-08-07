/**
 * Camada de dados.
 *
 * Uma API só, dois backends:
 *   - JSON local  (padrão) — para desenvolver sem depender de conta nenhuma
 *   - Supabase    — assume sozinho assim que SUPABASE_URL e SUPABASE_SERVICE_KEY existirem
 *
 * O resto do sistema chama só as funções daqui e não sabe qual está ativo.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'chamados.json');
const SEED_PATH = path.join(DATA_DIR, 'seed-chamados.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const usandoSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

// ---------------------------------------------------------------- utilidades

function novoCodigo() {
  // SQG-4823 — curto, fácil de ditar por telefone, sem sequência previsível
  return 'SQG-' + crypto.randomInt(1000, 9999);
}

function novoId() {
  return crypto.randomUUID();
}

// ------------------------------------------------------------- backend JSON

function carregar() {
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(SEED_PATH, DB_PATH);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function salvar(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ---------------------------------------------------------- backend Supabase

async function sb(caminho, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

// ------------------------------------------------------------------- API

async function listarServicos() {
  if (usandoSupabase) {
    return sb('servicos?ativo=eq.true&order=ordem.asc&select=*');
  }
  return carregar().servicos.filter(s => s.ativo !== false).sort((a, b) => a.ordem - b.ordem);
}

async function listarProfissionais({ apenasAtivos = true } = {}) {
  if (usandoSupabase) {
    const filtro = apenasAtivos ? 'ativo=eq.true&' : '';
    return sb(`profissionais?${filtro}order=nome.asc&select=*`);
  }
  const pros = carregar().profissionais;
  return apenasAtivos ? pros.filter(p => p.ativo !== false) : pros;
}

/**
 * Cria o chamado. `fotos` são metadados já processados pelo pipeline seguro
 * (lib/uploads.js) — este módulo nunca vê o arquivo bruto do usuário.
 */
async function criarChamado(dados, fotos = []) {
  const codigo = novoCodigo();

  if (usandoSupabase) {
    const [chamado] = await sb('chamados', { method: 'POST', body: { ...dados, codigo } });
    if (fotos.length) {
      await sb('chamado_fotos', {
        method: 'POST',
        body: fotos.map(f => ({ ...f, chamado_id: chamado.id }))
      });
    }
    return { ...chamado, fotos };
  }

  const db = carregar();
  const chamado = {
    id: novoId(),
    codigo,
    ...dados,
    status: 'novo',
    taxa_percentual: dados.taxa_percentual ?? 20,
    valor_cobrado: null,
    profissional_id: null,
    agendado_para: null,
    repasse_recebido: false,
    observacoes_internas: '',
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };
  db.chamados.push(chamado);
  fotos.forEach(f => db.chamado_fotos.push({ id: novoId(), chamado_id: chamado.id, ...f, criado_em: new Date().toISOString() }));
  salvar(db);
  return { ...chamado, fotos };
}

/**
 * Registra as fotos depois que o chamado já existe (precisamos do código
 * dele para montar o caminho no storage).
 */
async function registrarFotos(chamadoId, metadados) {
  if (!metadados.length) return;

  if (usandoSupabase) {
    await sb('chamado_fotos', {
      method: 'POST',
      body: metadados.map(m => ({ ...m, chamado_id: chamadoId }))
    });
    return;
  }

  const db = carregar();
  metadados.forEach(m => db.chamado_fotos.push({
    id: novoId(),
    chamado_id: chamadoId,
    ...m,
    criado_em: new Date().toISOString()
  }));
  salvar(db);
}

async function listarChamados({ status } = {}) {
  if (usandoSupabase) {
    const filtro = status ? `status=eq.${encodeURIComponent(status)}&` : '';
    return sb(`chamados?${filtro}order=criado_em.desc&select=*`);
  }
  const db = carregar();
  return db.chamados
    .filter(c => !status || c.status === status)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

async function obterChamado(id) {
  if (usandoSupabase) {
    const [c] = await sb(`chamados?id=eq.${encodeURIComponent(id)}&select=*`);
    return c || null;
  }
  return carregar().chamados.find(c => c.id === id) || null;
}

async function obterChamadoPorCodigo(codigo) {
  const alvo = String(codigo).trim().toUpperCase();
  if (usandoSupabase) {
    const [c] = await sb(`chamados?codigo=eq.${encodeURIComponent(alvo)}&select=*`);
    return c || null;
  }
  return carregar().chamados.find(c => c.codigo === alvo) || null;
}

async function listarFotos(chamadoId) {
  if (usandoSupabase) {
    return sb(`chamado_fotos?chamado_id=eq.${encodeURIComponent(chamadoId)}&select=*`);
  }
  return carregar().chamado_fotos.filter(f => f.chamado_id === chamadoId);
}

/** Só campos internos podem ser atualizados — nunca dados enviados pelo cliente. */
const CAMPOS_EDITAVEIS = new Set([
  'status', 'profissional_id', 'valor_cobrado', 'taxa_percentual',
  'agendado_para', 'observacoes_internas', 'repasse_recebido'
]);

async function atualizarChamado(id, mudancas) {
  const limpo = {};
  for (const [k, v] of Object.entries(mudancas)) {
    if (CAMPOS_EDITAVEIS.has(k)) limpo[k] = v;
  }
  if (!Object.keys(limpo).length) return obterChamado(id);

  if (usandoSupabase) {
    const [c] = await sb(`chamados?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: limpo });
    return c || null;
  }

  const db = carregar();
  const chamado = db.chamados.find(c => c.id === id);
  if (!chamado) return null;
  Object.assign(chamado, limpo, { atualizado_em: new Date().toISOString() });
  // taxa_valor é coluna gerada no Postgres; aqui replicamos o cálculo
  chamado.taxa_valor = Math.round((chamado.valor_cobrado || 0) * (chamado.taxa_percentual || 0)) / 100;
  salvar(db);
  return chamado;
}

module.exports = {
  usandoSupabase,
  listarServicos,
  listarProfissionais,
  criarChamado,
  registrarFotos,
  listarChamados,
  obterChamado,
  obterChamadoPorCodigo,
  listarFotos,
  atualizarChamado
};
