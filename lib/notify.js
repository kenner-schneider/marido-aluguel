/**
 * Notificação de chamado novo.
 *
 * PRINCÍPIO: a notificação é a campainha, não o envelope.
 * O alerta carrega só o mínimo não-identificável — categoria, bairro,
 * preferência de horário e o código. Nome, telefone, endereço exato e fotos
 * ficam atrás do login do painel. Assim, um vazamento do canal (conta do
 * Discord comprometida, por exemplo) não vira incidente de dado pessoal.
 *
 * Canais ligados por variável de ambiente. Sem nenhuma configurada, cai no
 * console — o sistema nunca quebra por falta de canal.
 */

const TURNOS = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };

function formatarData(iso) {
  if (!iso) return 'sem preferência';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Monta o texto do alerta. Não recebe (nem pode receber) dado pessoal. */
function montarResumo(chamado, servico, qtdFotos, baseUrl) {
  const quando = chamado.data_preferida
    ? `${formatarData(chamado.data_preferida)}, ${TURNOS[chamado.turno_preferido] || ''}`.trim()
    : 'sem preferência de data';

  return {
    titulo: `${chamado.urgente ? '🚨 URGENTE · ' : '🔔 '}Novo chamado ${chamado.codigo}`,
    linhas: [
      `**${servico?.nome || 'Serviço'}** · bairro ${chamado.bairro}`,
      `Preferência: ${quando}`,
      qtdFotos ? `${qtdFotos} foto${qtdFotos > 1 ? 's' : ''} anexada${qtdFotos > 1 ? 's' : ''}` : 'Sem fotos'
    ],
    link: `${baseUrl}/admin.html?chamado=${chamado.codigo}`
  };
}

const TENTATIVAS = 3;
const ESPERA_MAX_MS = 10000;

const dormir = ms => new Promise(r => setTimeout(r, ms));

/**
 * Interpreta um 429 do Discord.
 *
 * São dois 429 diferentes, e a diferença muda o que fazer:
 *  - Limite de rota da API: corpo é JSON com `retry_after` em segundos.
 *    É transitório e nosso — esperar e repetir resolve.
 *  - Bloqueio de borda da Cloudflare: corpo é HTML e vem com `cf-ray`.
 *    O limite é por IP de saída, não pela nossa conta. Em host compartilhado
 *    (Render free) o estouro pode ser de outro inquilino no mesmo IP.
 *    Repetir não adianta e só queima tentativa.
 */
function lerRateLimit(res, corpo) {
  let esperaMs = null;
  try {
    const j = JSON.parse(corpo);
    if (typeof j.retry_after === 'number') esperaMs = j.retry_after * 1000;
  } catch { /* corpo não-JSON = Cloudflare */ }

  return {
    esperaMs,
    escopo: res.headers.get('x-ratelimit-scope')
      || (esperaMs === null ? 'cloudflare/ip' : 'desconhecido'),
    cfRay: res.headers.get('cf-ray')
  };
}

async function enviarDiscord(resumo, chamado) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  const payload = {
    embeds: [{
      title: resumo.titulo,
      description: resumo.linhas.join('\n'),
      url: resumo.link,
      color: chamado.urgente ? 0xdc2626 : 0x1e40af,
      footer: { text: 'Abra o painel para ver contato, endereço e fotos' },
      timestamp: new Date().toISOString()
    }]
  };

  let detalhe = 'sem resposta';

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      if (tentativa > 1) console.log(`[notify] Discord entregue na tentativa ${tentativa}`);
      return true;
    }

    // o corpo é a única fonte que distingue os casos — nunca descartar
    const corpo = (await res.text().catch(() => '')).slice(0, 300);

    if (res.status !== 429) {
      // 401/404 = webhook revogado ou apagado. Repetir não ressuscita.
      throw new Error(`${res.status} · ${corpo || 'corpo vazio'}`);
    }

    const { esperaMs, escopo, cfRay } = lerRateLimit(res, corpo);
    detalhe = `429 · escopo=${escopo}${cfRay ? ` · cf-ray=${cfRay}` : ''} · ${corpo || 'corpo vazio'}`;

    if (esperaMs === null) break;                 // bloqueio por IP: insistir é inútil
    if (tentativa === TENTATIVAS) break;

    const espera = Math.min(esperaMs, ESPERA_MAX_MS) + 250;
    console.warn(`[notify] 429 (escopo=${escopo}); repetindo em ${Math.round(espera / 1000)}s`);
    await dormir(espera);
  }

  throw new Error(detalhe);
}

/**
 * Escapa o texto para o parse_mode HTML do Telegram.
 *
 * Obrigatório: `bairro` vem do formulário público. Sem escapar, um `<`
 * digitado pelo cliente quebra a mensagem inteira (Telegram recusa com 400)
 * e abriria espaço para injetar marcação no alerta.
 */
function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Telegram é o canal principal porque api.telegram.org não fica atrás da
 * Cloudflare — o bloqueio por IP de saída que derrubou o Discord no plano
 * free da Render não se aplica aqui.
 */
async function enviarTelegram(resumo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  // escapa primeiro, converte os marcadores depois: os `**` são nossos e
  // sobrevivem ao escape, então a ordem não deixa marcação do usuário passar
  const corpoTexto = resumo.linhas
    .map(l => escaparHtml(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'))
    .join('\n');

  const texto = `<b>${escaparHtml(resumo.titulo)}</b>\n\n${corpoTexto}\n\n`
    + `<a href="${resumo.link}">Abrir no painel</a>`;

  let detalhe = 'sem resposta';

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    if (res.ok) {
      if (tentativa > 1) console.log(`[notify] Telegram entregue na tentativa ${tentativa}`);
      return true;
    }

    const corpo = (await res.text().catch(() => '')).slice(0, 300);

    // o Telegram devolve o prazo em parameters.retry_after
    let esperaMs = null;
    try {
      const j = JSON.parse(corpo);
      if (typeof j?.parameters?.retry_after === 'number') esperaMs = j.parameters.retry_after * 1000;
    } catch { /* corpo não-JSON */ }

    detalhe = `${res.status} · ${corpo || 'corpo vazio'}`;

    // 401 = token errado, 400 = chat_id errado ou markup inválido.
    // Nenhum dos dois melhora repetindo.
    if (res.status !== 429 || esperaMs === null || tentativa === TENTATIVAS) break;

    const espera = Math.min(esperaMs, ESPERA_MAX_MS) + 250;
    console.warn(`[notify] Telegram 429; repetindo em ${Math.round(espera / 1000)}s`);
    await dormir(espera);
  }

  throw new Error(detalhe);
}

function enviarConsole(resumo) {
  console.log('\n─────────────────────────────────────────');
  console.log(resumo.titulo);
  resumo.linhas.forEach(l => console.log('  ' + l.replace(/\*\*/g, '')));
  console.log('  → ' + resumo.link);
  console.log('─────────────────────────────────────────\n');
  return true;
}

/**
 * Dispara o alerta em todos os canais configurados.
 * Nunca lança: falha de notificação não pode derrubar a abertura do chamado.

/**
 * Dispara o alerta em todos os canais configurados.
 *
 * Os canais são independentes e tentados em sequência: um barrado não pode
 * impedir o outro. O console só entra quando nenhum canal externo entregou,
 * para que a informação nunca se perca — foi ele que salvou o SQG-9032
 * quando a Cloudflare barrou o Discord.
 *
 * Nunca lança: falha de notificação não pode derrubar a abertura do chamado.
 */
async function notificarNovoChamado(chamado, servico, qtdFotos, baseUrl) {
  const resumo = montarResumo(chamado, servico, qtdFotos, baseUrl);
  const canais = [];

  try {
    if (await enviarTelegram(resumo)) canais.push('telegram');
  } catch (err) {
    console.error('[notify] Telegram falhou:', err.message);
  }

  try {
    if (await enviarDiscord(resumo, chamado)) canais.push('discord');
  } catch (err) {
    console.error('[notify] Discord falhou:', err.message);
  }

  if (!canais.length) {
    enviarConsole(resumo);
    canais.push('console');
  }

  return canais;
}

module.exports = { notificarNovoChamado, montarResumo };
