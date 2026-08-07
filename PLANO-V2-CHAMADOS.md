# Plano V2 — De marketplace para operação gerenciada

> Mudança de modelo do SeuQuebraGalho: o cliente abre um **chamado**, e nós (Kenner + sócio) fazemos triagem, orçamento e atribuição do profissional. Substitui o fluxo de marketplace do [PLANO-MVP.md](PLANO-MVP.md).

## 1. O que muda no modelo

| MVP atual (marketplace) | V2 (operação gerenciada) |
|---|---|
| Cliente escolhe o profissional e vê a agenda dele | Cliente abre um **chamado**; nós decidimos quem atende |
| Profissional aceita/recusa no painel | Nós atribuímos; o profissional recebe pelo WhatsApp |
| Página de profissionais é o fluxo principal | Vira **vitrine de confiança** (equipe), sem agendamento direto |
| Painel do profissional | Vira **painel interno** (só nós dois, com senha) |

Motivo: marketplace só funciona com escala dos dois lados. Operação gerenciada dá controle de qualidade, é mais simples de operar e resulta em **menos software**.

## 2. Fluxo do cliente — o chamado

Página inicial → CTA único **"Pedir um orçamento"** → formulário curto:

1. **O que precisa** — categoria (chuveiro/elétrica, vazamento, montagem, instalação, outro) + descrição livre
2. **Quando** — data + turno de preferência, e uma **segunda opção** (evita ida e volta no WhatsApp)
3. **Onde** — endereço + bairro
4. **Contato** — nome e WhatsApp (e-mail opcional)
5. **Fotos** — opcional, até 5 imagens

Resposta: tela de acompanhamento com **código do chamado** (`SQG-4823`) e link para consultar. Sem cadastro e sem senha — fricção zero.

**Ciclo de vida:**
`Novo` → `Em análise` → `Orçado` → `Agendado` → `Concluído` / `Cancelado`

A foto é a maior alavanca do modelo: vendo o chuveiro, dá para orçar sem visita técnica.

## 3. Painel interno (Kenner + sócio)

Protegido por senha. Lista de chamados por status, com dados do cliente, fotos e ações de um clique: **orçar**, **atribuir profissional**, **mudar status**, **registrar valor e taxa**.

## 4. Como o profissional recebe

Profissional de reparo não entra em painel web. Ao atribuir, o sistema gera uma **mensagem pronta de WhatsApp** (link `wa.me` com serviço, endereço, horário e valor dele). Ele responde "ok" e nós marcamos como agendado. Zero treinamento, zero app novo.

## 5. Notificação de chamado novo

**Decisão: Discord privado agora; Web Push próprio (PWA) na fase 2.**

Princípio que vale para qualquer canal:

> **A notificação é a campainha, não o envelope.**

O alerta carrega só o mínimo não-identificável; o dado sensível fica atrás do login do painel:

```
🔔 Novo chamado SQG-4823
Troca de chuveiro · bairro Camobi
Preferência: qua 12/08, tarde · 2 fotos anexadas
→ abrir no painel
```

Sem nome, telefone, endereço exato ou foto na mensagem. Assim, um vazamento do canal não vira incidente de dados pessoais.

**Por que Discord:** servidor privado (só quem é convidado lê), grátis para sempre, ~3 min de setup, push no celular dos dois.

**Por que não ntfy.sh público:** todos os tópicos são públicos — quem descobre o nome do tópico **lê e também publica**. Sem controle de acesso, salvo self-hosted ou plano pago. Inadequado para dado de cliente.

**Por que PWA só na fase 2:** é o mais privado (nada sai do nosso sistema), mas no iPhone exige iOS 16.4+ **e** adicionar o painel à tela inicial; se alguém pular isso ou limpar os dados do navegador, o canal **falha em silêncio**. Quando entrar, o Discord fica como redundância.

**Implementação:** módulo isolado `notificar(chamado)`, canais ligados por variável de ambiente. Trocar ou somar canal = mudança de configuração, não retrabalho.

## 6. Segurança do upload de imagens

Modelo de ameaça: uma imagem maliciosa só causa dano se for **executada no servidor**, **servida e executada no navegador**, ou **infectar a máquina de quem baixa**. As camadas abaixo cobrem os três casos.

1. **Validar por *magic bytes***, nunca por extensão ou pelo MIME informado pelo cliente (ambos são forjáveis). Aceitar só JPEG, PNG, WebP e HEIC.
2. **Bloquear SVG explicitamente** — é XML e aceita `<script>` dentro; vetor clássico de XSS em "upload de imagem".
3. **Re-encodar toda imagem no servidor (`sharp`)** — medida principal. Arquivo poliglota (JPEG válido com payload embutido) não sobrevive ao re-encode. De brinde, remove o EXIF, inclusive **coordenadas de GPS** da foto da casa do cliente.
4. **Limites duros:** máx. 5 imagens, 8 MB cada, e limite de resolução (`limitInputPixels`) contra *decompression bomb* (arquivo de 2 MB que vira 40 GB em memória).
5. **Nome de arquivo aleatório (UUID)** — nunca reaproveitar o nome enviado (*path traversal*).
6. **Servir de outra origem** (Supabase Storage) com **URL assinada e com validade**, `X-Content-Type-Options: nosniff` e CSP restritiva. Nunca do domínio da aplicação.
7. **Rate limit** por IP e por telefone, senão o formulário vira depósito de arquivo gratuito.
8. **LGPD:** foto da casa + endereço + telefone é dado pessoal. Retenção definida (ex.: apagar fotos 90 dias após a conclusão), informada no formulário.

Antivírus (ClamAV) fica fora por ora: o re-encode cobre o risco realista de imagem, e o ClamAV consome memória que não cabe no plano grátis.

## 7. Infraestrutura

**Decisão: migrar para Supabase (plano grátis).**

Bloqueios do MVP atual assim que houver cliente real:
- Banco em arquivo JSON no disco **efêmero** do Render: cada deploy/reinício **apaga todos os chamados**.
- Upload no mesmo disco: idem, e não é lugar de servir arquivo.

Supabase resolve os dois: Postgres gerenciado + storage com URL assinada, sem cartão de crédito.

## 8. Pagamento e taxa

Modelo atual (definido): o profissional recebe do cliente e repassa a taxa para nós — sem processamento de pagamento no software.

O sistema só **registra**: `valor cobrado do cliente` e `taxa da plataforma (%)` por chamado, e o painel soma **"quanto cada profissional deve repassar este mês"**. Pouco código, e a receita já fica medida. Se um dia virar pagamento centralizado, o histórico já existe.

## 9. Fases

| Fase | Entrega |
|---|---|
| **1** | Chamado (formulário + upload seguro) → Supabase → **notificação no Discord**. Painel interno com lista e mudança de status. Landing com CTA novo. |
| **2** | Atribuição do profissional com mensagem pronta de WhatsApp; página de acompanhamento do cliente; controle de valor e taxa; **Web Push (PWA)**. |
| **3** | WhatsApp oficial (Cloud API) avisando o cliente; relatório mensal de repasses; avaliação pós-serviço. |

## 10. Impacto nos arquivos atuais

| Arquivo hoje | Destino |
|---|---|
| `public/index.html` | CTA passa a ser "Pedir um orçamento" |
| `public/agendar.html` | Vira `chamado.html` (abertura de chamado com fotos) |
| `public/minhas-reservas.html` | Vira acompanhamento por código do chamado |
| `public/pro.html` | Vira `admin.html` (painel interno com senha) |
| `public/profissionais.html` | Vira vitrine da equipe, sem agendamento direto |
| `server.js` | Ganha upload seguro, notificação e acesso ao Supabase; sai o JSON |

## 11. O que preciso de você para começar a fase 1

1. Conta no **Supabase** → URL do projeto e chave de serviço.
2. Servidor **Discord** privado com você e seu sócio → URL do webhook do canal `#chamados`.
3. Definir a **taxa da plataforma** (%) e a lista real de serviços e preços de Santa Maria.
