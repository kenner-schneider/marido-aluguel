/**
 * Pipeline seguro de imagens.
 *
 * Modelo de ameaça: uma imagem maliciosa só causa dano se (a) for executada
 * no servidor, (b) for servida e executada no navegador de quem abre o
 * painel, ou (c) infectar a máquina de quem baixa. As camadas abaixo cobrem
 * os três casos.
 *
 *   1. Magic bytes  — o tipo real do arquivo, não a extensão nem o MIME que
 *                     o navegador informou (ambos são forjáveis).
 *   2. SVG bloqueado — SVG é XML e aceita <script>; é o vetor clássico de XSS
 *                     em "upload de imagem".
 *   3. Re-encode     — a defesa principal. Um arquivo poliglota (JPEG válido
 *                     com payload embutido) não sobrevive: o que sai é uma
 *                     imagem nova, gerada por nós. Também remove todo o EXIF,
 *                     inclusive as coordenadas de GPS da foto da casa.
 *   4. Limite de pixels — contra "decompression bomb" (2 MB que viram 40 GB
 *                     em memória e derrubam o servidor).
 *   5. Nome aleatório — nunca reaproveitar o nome enviado (path traversal).
 *
 * Este módulo nunca devolve o arquivo original: só o buffer re-encodado.
 */

const crypto = require('crypto');
const sharp = require('sharp');

const MAX_ARQUIVOS = 5;
const MAX_BYTES = 8 * 1024 * 1024;      // 8 MB por arquivo, antes do processamento
const MAX_LADO = 2000;                  // px — redimensiona o que passar disso
const MAX_PIXELS_ENTRADA = 50e6;        // 50 MP: acima disso, recusa sem decodificar

// Assinaturas dos únicos formatos aceitos. HEIC/HEIF entram pelo box 'ftyp'.
const ASSINATURAS = [
  { tipo: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { tipo: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: buf => buf.slice(8, 12).toString('ascii') === 'WEBP' },
  { tipo: 'heic', bytes: [], extra: buf => buf.slice(4, 8).toString('ascii') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|avif)/.test(buf.slice(8, 12).toString('ascii')) }
];

/** Descobre o tipo real lendo o início do arquivo. Retorna null se não for permitido. */
function tipoReal(buffer) {
  if (!buffer || buffer.length < 16) return null;
  for (const a of ASSINATURAS) {
    const casaPrefixo = a.bytes.every((b, i) => buffer[i] === b);
    if (!casaPrefixo) continue;
    if (a.extra && !a.extra(buffer)) continue;
    return a.tipo;
  }
  return null;
}

/** SVG e outros XML disfarçados de imagem: recusa explícita e antecipada. */
function pareceMarkup(buffer) {
  const inicio = buffer.slice(0, 512).toString('utf8').trim().toLowerCase();
  return inicio.startsWith('<?xml') || inicio.startsWith('<svg') || inicio.includes('<script');
}

/**
 * Valida e re-encoda um arquivo enviado.
 * @returns {Promise<{buffer: Buffer, storage_path: string, largura: number, altura: number, bytes: number, contentType: string}>}
 * @throws  {Error} com mensagem já pronta para mostrar ao cliente
 */
async function processarImagem(arquivo, chamadoCodigo) {
  const buffer = arquivo.buffer;

  if (!buffer || !buffer.length) {
    throw new Error('Arquivo vazio.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Cada imagem deve ter no máximo 8 MB.');
  }
  if (pareceMarkup(buffer)) {
    throw new Error('Arquivo não permitido. Envie uma foto (JPG, PNG, WebP ou HEIC).');
  }
  if (!tipoReal(buffer)) {
    // pega tanto o arquivo errado quanto o renomeado (.exe virado .jpg)
    throw new Error('Formato não suportado. Envie uma foto (JPG, PNG, WebP ou HEIC).');
  }

  let processada;
  try {
    processada = await sharp(buffer, {
      limitInputPixels: MAX_PIXELS_ENTRADA,  // barra decompression bomb
      failOn: 'error',                        // recusa arquivo corrompido/malformado
      animated: false                         // ignora quadros extras (GIF/WebP animado)
    })
      .rotate()                               // aplica a orientação do EXIF antes de descartá-lo
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })   // re-encode: mata poliglota e limpa metadados
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw new Error('Não foi possível processar esta imagem. Tente outra foto.');
  }

  // nome imprevisível; nunca deriva do nome enviado pelo usuário
  const nome = `${crypto.randomUUID()}.jpg`;

  return {
    buffer: processada.data,
    storage_path: `${chamadoCodigo}/${nome}`,
    largura: processada.info.width,
    altura: processada.info.height,
    bytes: processada.data.length,
    contentType: 'image/jpeg'
  };
}

/** Processa a lista inteira, respeitando o limite de quantidade. */
async function processarImagens(arquivos, chamadoCodigo) {
  const lista = (arquivos || []).slice(0, MAX_ARQUIVOS);
  const resultado = [];
  for (const arquivo of lista) {
    resultado.push(await processarImagem(arquivo, chamadoCodigo));
  }
  return resultado;
}

module.exports = { processarImagem, processarImagens, tipoReal, MAX_ARQUIVOS, MAX_BYTES };
