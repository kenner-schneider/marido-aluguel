// Helpers compartilhados entre as páginas
const API = {
  async get(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },
  async send(url, method, body) {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }
};

const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = iso => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const fmtDataHora = iso => {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt)) return fmtDate(iso);
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const TURNOS = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };

const STATUS_LABEL = {
  novo: 'Novo',
  em_analise: 'Em análise',
  orcado: 'Orçado',
  agendado: 'Agendado',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
};

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
