/**
 * Google Analytics 4.
 *
 * Só liga quando /js/ga.js trouxe um ID — ou seja, quando GA4_ID existe no
 * ambiente do servidor. Sem isso este arquivo carrega e não faz nada, que é o
 * estado da máquina de desenvolvimento e de qualquer cópia local do site.
 *
 * O QUE ELE NÃO MANDA PARA O GOOGLE
 *
 * A página de acompanhamento carrega o código do chamado na URL
 * (?codigo=SQG-0000). Esse código é o que abre o chamado de um cliente —
 * mandar ele no page_location seria despejar identificador de cliente dentro
 * do relatório de um terceiro, e ele ficaria lá pelos próximos 14 meses.
 * Então a query string passa por uma lista de permissão: sobrevivem os
 * parâmetros de campanha e mais nada. O referrer recebe o mesmo tratamento,
 * porque numa navegação interna ele carrega a URL inteira da página anterior
 * — inclusive o código que acabamos de tirar do page_location.
 *
 * O painel interno (/admin.html) não carrega este arquivo. A trava de caminho
 * lá embaixo é para o dia em que alguém colar o <script> lá sem pensar.
 *
 * SE UM BLOQUEADOR DERRUBAR ESTE ARQUIVO, nada quebra: as páginas chamam
 * sqgEvento/sqgEventoNaSaida com `?.`, então some a medição e o site segue.
 * É o comportamento certo — quem bloqueia analytics está pedindo isso.
 */
(function () {
  var ID = window.SQG_GA4_ID;
  if (!ID) return;

  // painel interno nunca entra no relatório: são as buscas da equipe, e as
  // URLs de lá carregam código de chamado
  if (location.pathname.indexOf('/admin') === 0) return;

  // Lista de permissão da query string. Só parâmetro de campanha atravessa —
  // qualquer coisa nova que apareça na URL fica de fora por padrão, que é a
  // direção segura de errar.
  var PERMITIDOS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'fbclid'
  ];

  function limpar(url) {
    if (!url) return '';
    var u;
    try {
      u = new URL(url, location.origin);
    } catch (e) {
      return '';   // referrer esquisito não vira URL meia-boca
    }
    var mantidos = new URLSearchParams();
    PERMITIDOS.forEach(function (p) {
      var v = u.searchParams.get(p);
      if (v) mantidos.set(p, v);
    });
    u.search = mantidos.toString();
    u.hash = '';   // âncora não diz nada útil e já vazou dado em outros sites
    return u.toString();
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', ID, {
    // sobrescreve o que o gtag pegaria sozinho da barra de endereços
    page_location: limpar(location.href),
    page_referrer: limpar(document.referrer)
  });

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
  document.head.appendChild(tag);

  // ------------------------------------------------------------------ eventos

  /** Evento comum: a página continua aberta depois dele. */
  window.sqgEvento = function (nome, params) {
    gtag('event', nome, params || {});
  };

  /**
   * Evento disparado imediatamente antes de trocar de página.
   *
   * O gtag.js usa sendBeacon, que sobrevive à navegação — mas só depois de
   * ter carregado. Se o formulário for enviado antes disso (conexão ruim,
   * cache frio), o evento morre na fila em memória junto com a página. Então
   * ele é anotado aqui e disparado pela página seguinte, que sempre carrega
   * este mesmo arquivo.
   */
  var FILA = 'sqg_ga_fila';

  window.sqgEventoNaSaida = function (nome, params) {
    try {
      var pend = JSON.parse(sessionStorage.getItem(FILA) || '[]');
      pend.push({ nome: nome, params: params || {} });
      // teto baixo de propósito: isto é uma ponte entre duas páginas, não um
      // buffer. Se encheu, alguma coisa não está disparando.
      sessionStorage.setItem(FILA, JSON.stringify(pend.slice(-5)));
    } catch (e) {
      // navegação privada ou storage cheio: perder a métrica é aceitável,
      // travar o envio do chamado não é
    }
  };

  // esvazia o que a página anterior deixou
  try {
    var pendentes = JSON.parse(sessionStorage.getItem(FILA) || '[]');
    sessionStorage.removeItem(FILA);
    pendentes.forEach(function (e) {
      if (e && e.nome) gtag('event', e.nome, e.params || {});
    });
  } catch (e) { /* mesma história do bloco acima */ }

  /**
   * Cliques que levam ao formulário de orçamento.
   *
   * Delegado no documento em vez de espalhado pelos HTMLs: os CTAs estão em
   * quatro páginas e mudam de lugar toda vez que a landing é mexida. `origem`
   * é só o pathname — nunca a URL completa, que na página de acompanhamento
   * traria o código do chamado de volta.
   */
  document.addEventListener('click', function (ev) {
    var alvo = ev.target;
    if (!alvo || !alvo.closest) return;
    if (!alvo.closest('a[href*="chamado.html"]')) return;
    window.sqgEventoNaSaida('cta_orcamento', { origem: location.pathname });
  });
})();
