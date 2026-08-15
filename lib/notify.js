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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord respondeu ${res.status}`);
  return true;
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
 */
async function notificarNovoChamado(chamado, servico, qtdFotos, baseUrl) {
  const resumo = montarResumo(chamado, servico, qtdFotos, baseUrl);
  const canais = [];

  try {
    if (await enviarDiscord(resumo, chamado)) canais.push('discord');
  } catch (err) {
    console.error('[notify] Discord falhou:', err.message);
  }

  // console sempre entra quando nenhum canal externo respondeu
  if (!canais.length) {
    enviarConsole(resumo);
    canais.push('console');
  }

  return canais;
}

module.exports = { notificarNovoChamado, montarResumo };
