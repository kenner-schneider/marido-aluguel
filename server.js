// Carrega o .env em desenvolvimento. No Render as variáveis vêm do painel e
// este require simplesmente não encontra arquivo — sem efeito colateral.
require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const store = require('./lib/store');
const storage = require('./lib/storage');
const { processarImagens, MAX_ARQUIVOS, MAX_BYTES } = require('./lib/uploads');
const { notificarNovoChamado } = require('./lib/notify');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const TAXA_PADRAO = Number(process.env.TAXA_PERCENTUAL || 20);

app.set('trust proxy', 1); // Render/Cloudflare: IP real para o rate limit
app.use(express.json());
app.use(cookieParser());

// Cabeçalhos de segurança. O CSP é restritivo: nada de script externo, e
// as imagens (conteúdo enviado por terceiros) só podem vir de origem própria
// ou do Supabase Storage.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    // blob: é necessário para a prévia local das fotos antes do envio —
    // são URLs criadas pela própria página, não vêm de fora.
    "img-src 'self' data: blob: https://*.supabase.co; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline'; " +
    "form-action 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  );
  next();
});

// IMPORTANTE: data/uploads NÃO fica dentro de public — imagem enviada por
// usuário nunca é servida como arquivo estático.
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- limites

const limiteChamado = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,                                   // 5 chamados por hora por IP
  message: { error: 'Muitos chamados enviados. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                                  // trava força bruta na senha do painel
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const limiteConsulta = rateLimit({ windowMs: 60 * 1000, max: 30 });

// Arquivos ficam em memória: nada é gravado em disco antes de ser validado
// e re-encodado. O limite aqui é a primeira barreira; a segunda está no
// pipeline (lib/uploads.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_ARQUIVOS, fields: 20, parts: 30 }
});

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// =====================================================================
// API pública (cliente)
// =====================================================================

app.get('/api/config', limiteConsulta, async (req, res, next) => {
  try {
    const servicos = await store.listarServicos();
    res.json({ servicos, cidade: 'Santa Maria', maxFotos: MAX_ARQUIVOS });
  } catch (err) { next(err); }
});

/** Vitrine da equipe: só nome e especialidades, nunca o telefone. */
app.get('/api/equipe', limiteConsulta, async (req, res, next) => {
  try {
    const pros = await store.listarProfissionais();
    res.json(pros.map(p => ({ id: p.id, nome: p.nome, especialidades: p.especialidades })));
  } catch (err) { next(err); }
});

app.post('/api/chamados', limiteChamado, upload.array('fotos', MAX_ARQUIVOS), async (req, res, next) => {
  try {
    const b = req.body || {};
    const servicos = await store.listarServicos();
    const servico = servicos.find(s => s.id === b.servico_id);

    // ---- validação (o servidor nunca confia no que veio do formulário) ----
    if (!servico) return res.status(400).json({ error: 'Escolha um serviço.' });
    if (!b.descricao || b.descricao.trim().length < 10) {
      return res.status(400).json({ error: 'Descreva o que precisa ser feito (mínimo 10 caracteres).' });
    }
    if (!b.cliente_nome?.trim() || !b.cliente_telefone?.trim()) {
      return res.status(400).json({ error: 'Informe seu nome e telefone.' });
    }
    if (!b.endereco?.trim() || !b.bairro?.trim()) {
      return res.status(400).json({ error: 'Informe o endereço e o bairro.' });
    }
    const turnos = ['manha', 'tarde', 'noite'];
    if (b.turno_preferido && !turnos.includes(b.turno_preferido)) {
      return res.status(400).json({ error: 'Turno inválido.' });
    }

    const dados = {
      servico_id: servico.id,
      descricao: b.descricao.trim().slice(0, 2000),
      urgente: b.urgente === 'true' || b.urgente === 'on',
      data_preferida: b.data_preferida || null,
      turno_preferido: turnos.includes(b.turno_preferido) ? b.turno_preferido : null,
      data_alternativa: b.data_alternativa || null,
      turno_alternativo: turnos.includes(b.turno_alternativo) ? b.turno_alternativo : null,
      cliente_nome: b.cliente_nome.trim().slice(0, 120),
      cliente_telefone: b.cliente_telefone.trim().slice(0, 30),
      cliente_email: b.cliente_email?.trim().toLowerCase().slice(0, 160) || null,
      endereco: b.endereco.trim().slice(0, 240),
      bairro: b.bairro.trim().slice(0, 80),
      taxa_percentual: TAXA_PADRAO
    };

    // ---- imagens: valida, re-encoda e só então guarda ----
    let fotos = [];
    try {
      fotos = await processarImagens(req.files, 'tmp');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const chamado = await store.criarChamado(dados, []);

    // agora que existe código, grava os arquivos sob a pasta dele
    const metadados = [];
    for (const foto of fotos) {
      const caminho = `${chamado.codigo}/${foto.storage_path.split('/').pop()}`;
      await storage.salvar(caminho, foto.buffer, foto.contentType);
      metadados.push({
        storage_path: caminho,
        largura: foto.largura,
        altura: foto.altura,
        bytes: foto.bytes
      });
    }
    await store.registrarFotos(chamado.id, metadados);

    // notificação nunca derruba a abertura do chamado
    notificarNovoChamado(chamado, servico, metadados.length, baseUrl(req))
      .catch(err => console.error('[notify]', err.message));

    res.status(201).json({ codigo: chamado.codigo });
  } catch (err) { next(err); }
});

/** Acompanhamento pelo código — devolve só o status, nunca o dado pessoal. */
app.get('/api/chamados/:codigo', limiteConsulta, async (req, res, next) => {
  try {
    const c = await store.obterChamadoPorCodigo(req.params.codigo);
    if (!c) return res.status(404).json({ error: 'Chamado não encontrado. Confira o código.' });
    const servicos = await store.listarServicos();
    res.json({
      codigo: c.codigo,
      status: c.status,
      servico: servicos.find(s => s.id === c.servico_id)?.nome || 'Serviço',
      criado_em: c.criado_em,
      agendado_para: c.agendado_para,
      valor_cobrado: c.valor_cobrado
    });
  } catch (err) { next(err); }
});

// =====================================================================
// Painel interno
// =====================================================================

app.post('/admin/api/login', limiteLogin, (req, res) => {
  if (!auth.senhaConfere(req.body?.senha)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  auth.definirCookie(res);
  res.json({ ok: true });
});

app.post('/admin/api/logout', (req, res) => {
  auth.limparCookie(res);
  res.json({ ok: true });
});

app.get('/admin/api/sessao', (req, res) => {
  res.json({ logado: auth.estaLogado(req), usandoSupabase: store.usandoSupabase });
});

app.get('/admin/api/chamados', auth.exigirAdmin, async (req, res, next) => {
  try {
    const [chamados, servicos, profissionais] = await Promise.all([
      store.listarChamados({ status: req.query.status || undefined }),
      store.listarServicos(),
      store.listarProfissionais({ apenasAtivos: false })
    ]);
    res.json({ chamados, servicos, profissionais });
  } catch (err) { next(err); }
});

app.get('/admin/api/chamados/:id', auth.exigirAdmin, async (req, res, next) => {
  try {
    const chamado = await store.obterChamado(req.params.id);
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });
    const fotos = await store.listarFotos(chamado.id);
    const comUrl = await Promise.all(
      fotos.map(async f => ({ ...f, url: await storage.urlDeExibicao(f.storage_path) }))
    );
    res.json({ ...chamado, fotos: comUrl });
  } catch (err) { next(err); }
});

app.patch('/admin/api/chamados/:id', auth.exigirAdmin, async (req, res, next) => {
  try {
    const atual = await store.obterChamado(req.params.id);
    if (!atual) return res.status(404).json({ error: 'Chamado não encontrado' });

    const permitidos = ['novo', 'em_analise', 'orcado', 'agendado', 'concluido', 'cancelado'];
    if (req.body.status && !permitidos.includes(req.body.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const valor = req.body.valor_cobrado;
    if (valor !== undefined && valor !== null && (isNaN(Number(valor)) || Number(valor) < 0)) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const atualizado = await store.atualizarChamado(req.params.id, req.body);
    res.json(atualizado);
  } catch (err) { next(err); }
});

/**
 * Exclui o chamado de vez, junto com as fotos no Storage.
 * Para chamado real, o certo é "cancelado" — isso preserva o histórico.
 * Esta rota existe para limpar teste e engano.
 */
app.delete('/admin/api/chamados/:id', auth.exigirAdmin, async (req, res, next) => {
  try {
    const chamado = await store.obterChamado(req.params.id);
    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });

    // apaga os arquivos primeiro: se sobrar registro sem foto tudo bem,
    // mas foto sem registro vira lixo invisível no bucket
    const fotos = await store.listarFotos(chamado.id);
    for (const f of fotos) {
      try {
        await storage.apagar(f.storage_path);
      } catch (err) {
        console.error('[excluir] falha ao apagar imagem', f.storage_path, err.message);
      }
    }

    await store.excluirChamado(chamado.id);
    res.json({ ok: true, codigo: chamado.codigo, fotosApagadas: fotos.length });
  } catch (err) { next(err); }
});

/** Serve a imagem local só para quem está logado. Nunca via arquivo estático. */
app.get('/admin/api/imagem/:caminho(*)', auth.exigirAdmin, (req, res) => {
  try {
    const buffer = storage.lerLocal(req.params.caminho);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch {
    res.status(404).end();
  }
});

// =====================================================================

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Cada imagem deve ter no máximo 8 MB.'
      : err.code === 'LIMIT_FILE_COUNT'
        ? `Envie no máximo ${MAX_ARQUIVOS} fotos.`
        : 'Falha no envio dos arquivos.';
    return res.status(400).json({ error: msg });
  }
  console.error('[erro]', err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

app.listen(PORT, () => {
  console.log(`\nSeuQuebraGalho rodando em http://localhost:${PORT}`);
  console.log(`  Banco:        ${store.usandoSupabase ? 'Supabase' : 'JSON local (data/chamados.json)'}`);
  console.log(`  Imagens:      ${storage.usandoSupabase ? 'Supabase Storage' : 'data/uploads (fora do público)'}`);
  console.log(`  Notificação:  ${process.env.DISCORD_WEBHOOK_URL ? 'Discord' : 'console (webhook não configurado)'}`);
  if (auth.SENHA_PADRAO) console.log('  ⚠ ADMIN_PASSWORD não definida — usando senha padrão de desenvolvimento\n');
});
