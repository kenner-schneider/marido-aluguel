/**
 * Autenticação do painel interno (só Kenner e sócio).
 *
 * Sessão em cookie assinado com HMAC — sem banco de sessão, sem dependência
 * extra. O cookie é httpOnly (JavaScript da página não lê), sameSite=strict
 * (não vaza em requisição de outro site) e secure em produção.
 */

const crypto = require('crypto');

const COOKIE = 'sqg_admin';
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 h

const SENHA = process.env.ADMIN_PASSWORD || 'quebragalho2026';
const SEGREDO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const producao = process.env.NODE_ENV === 'production';

function assinar(valor) {
  return crypto.createHmac('sha256', SEGREDO).update(valor).digest('hex');
}

function criarToken() {
  const expira = Date.now() + DURACAO_MS;
  return `${expira}.${assinar(String(expira))}`;
}

function tokenValido(token) {
  if (!token || !token.includes('.')) return false;
  const [expira, assinatura] = token.split('.');
  const esperada = assinar(expira);
  // comparação em tempo constante evita timing attack
  if (assinatura.length !== esperada.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return false;
  return Number(expira) > Date.now();
}

/** Confere a senha sem vazar informação pelo tempo de resposta. */
function senhaConfere(tentativa) {
  const a = Buffer.from(String(tentativa || ''));
  const b = Buffer.from(SENHA);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function definirCookie(res) {
  res.cookie(COOKIE, criarToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: producao,
    maxAge: DURACAO_MS
  });
}

function limparCookie(res) {
  res.clearCookie(COOKIE);
}

/** Middleware: barra qualquer rota do painel sem sessão válida. */
function exigirAdmin(req, res, next) {
  if (tokenValido(req.cookies?.[COOKIE])) return next();
  res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
}

function estaLogado(req) {
  return tokenValido(req.cookies?.[COOKIE]);
}

module.exports = { senhaConfere, definirCookie, limparCookie, exigirAdmin, estaLogado, SENHA_PADRAO: !process.env.ADMIN_PASSWORD };
