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

const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const STATUS_LABEL = {
  pendente: 'Aguardando confirmação',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  recusado: 'Recusado'
};

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function starIcons(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
