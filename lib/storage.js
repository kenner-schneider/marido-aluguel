/**
 * Onde as imagens já processadas ficam guardadas.
 *
 *   - Local (padrão): pasta data/uploads, FORA do diretório público. Nunca é
 *     servida por express.static; só sai pela rota do painel, autenticada.
 *   - Supabase Storage: bucket privado, exibido por URL assinada de curta
 *     duração. Assume sozinho quando as chaves existirem.
 *
 * Em nenhum dos dois casos a imagem fica acessível por URL pública.
 */

const fs = require('fs');
const path = require('path');

const DIR_UPLOADS = path.join(__dirname, '..', 'data', 'uploads');
const BUCKET = 'chamados';
const VALIDADE_URL = 60 * 10; // 10 minutos

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const usandoSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

function caminhoLocal(storagePath) {
  // storagePath é sempre gerado por nós (CODIGO/uuid.jpg), mas normalizamos
  // e conferimos o prefixo mesmo assim — defesa contra path traversal.
  const destino = path.resolve(DIR_UPLOADS, storagePath);
  if (!destino.startsWith(path.resolve(DIR_UPLOADS) + path.sep)) {
    throw new Error('Caminho de arquivo inválido');
  }
  return destino;
}

async function salvar(storagePath, buffer, contentType = 'image/jpeg') {
  if (usandoSupabase) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'false'
      },
      body: buffer
    });
    if (!res.ok) throw new Error(`Falha ao enviar imagem: ${res.status} ${await res.text()}`);
    return storagePath;
  }

  const destino = caminhoLocal(storagePath);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
  return storagePath;
}

/**
 * URL para exibir a imagem no painel.
 * No Supabase, assinada e com validade curta. No local, aponta para a rota
 * autenticada do servidor — nunca para um arquivo estático.
 */
async function urlDeExibicao(storagePath) {
  if (usandoSupabase) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn: VALIDADE_URL })
    });
    if (!res.ok) throw new Error(`Falha ao assinar URL: ${res.status}`);
    const { signedURL } = await res.json();
    return `${SUPABASE_URL}/storage/v1${signedURL}`;
  }
  return `/admin/api/imagem/${encodeURIComponent(storagePath)}`;
}

function lerLocal(storagePath) {
  return fs.readFileSync(caminhoLocal(storagePath));
}

async function apagar(storagePath) {
  if (usandoSupabase) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    return;
  }
  try {
    fs.unlinkSync(caminhoLocal(storagePath));
  } catch {
    /* já não existe */
  }
}

module.exports = { salvar, urlDeExibicao, lerLocal, apagar, usandoSupabase };
