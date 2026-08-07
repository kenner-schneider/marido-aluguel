# SeuQuebraGalho

Marido de aluguel em Santa Maria/RS. O cliente abre um **chamado** descrevendo o problema (com fotos, se quiser), a equipe recebe a notificação, orça e atribui um profissional.

Plano do produto: [PLANO-V2-CHAMADOS.md](PLANO-V2-CHAMADOS.md)

## Rodar localmente

```
npm install
npm start        # http://localhost:3000
```

Funciona sem configurar nada: usa arquivo local como banco e imprime as notificações no console. O painel fica em `/admin.html` (senha padrão de desenvolvimento: `quebragalho2026`).

## Páginas

| Rota | Para quem |
|---|---|
| `/` | Landing |
| `/chamado.html` | Cliente abre o pedido de orçamento |
| `/acompanhar.html` | Cliente acompanha pelo código (`SQG-0000`) |
| `/equipe.html` | Vitrine dos profissionais |
| `/admin.html` | Painel interno (senha) |

## Configuração

Copie `.env.example` para `.env` e preencha. Cada bloco é opcional e independente:

| Variável | Efeito |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel. **Defina antes de pôr no ar.** |
| `SESSION_SECRET` | Assina o cookie de sessão. Sem ela, todos saem do painel a cada reinício. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Troca o arquivo local pelo Postgres e o disco pelo Storage |
| `DISCORD_WEBHOOK_URL` | Manda a notificação para o Discord em vez do console |
| `TAXA_PERCENTUAL` | Taxa padrão da plataforma (%) |

### Supabase

1. Crie o projeto em [supabase.com](https://supabase.com).
2. SQL Editor → cole e rode [`sql/schema.sql`](sql/schema.sql), depois [`sql/seed.sql`](sql/seed.sql) (ajuste preços e profissionais antes).
3. Project Settings → API → copie a **URL** e a chave **service_role** para o `.env`.

A `service_role` ignora RLS e só pode existir no servidor — nunca no navegador. As tabelas ficam com RLS ligada e sem policy, então a chave pública não lê nada.

### Discord

Servidor privado → canal `#chamados` → Editar canal → Integrações → Webhooks → Novo webhook → copiar URL.

A notificação é **campainha, não envelope**: manda só serviço, bairro, preferência de horário e o código. Nome, telefone, endereço e fotos ficam atrás do login do painel.

## Segurança das imagens

Toda foto enviada passa por [`lib/uploads.js`](lib/uploads.js):

1. Tipo detectado por **magic bytes**, não por extensão nem MIME do navegador
2. **SVG bloqueado** (é XML, aceita `<script>`)
3. **Re-encode com `sharp`** — mata arquivo poliglota e remove todo o EXIF, inclusive GPS
4. Limite de resolução contra *decompression bomb*
5. Nome de arquivo aleatório (UUID)
6. Guardadas **fora de `public/`**; só saem por rota autenticada ou URL assinada

Verificado em teste: um JPEG válido com payload PHP + JS embutido e EXIF/GPS entrou e saiu como imagem limpa.

## Estrutura

```
server.js              rotas e middlewares
lib/store.js           dados (JSON local ou Supabase)
lib/storage.js         arquivos (disco local ou Supabase Storage)
lib/uploads.js         validação e re-encode das imagens
lib/notify.js          notificação (Discord ou console)
lib/auth.js            sessão do painel
sql/                   schema e seed do Supabase
public/                páginas
data/seed-chamados.json  dados iniciais do modo local
```

## Hospedar (Render)

1. Push para o GitHub.
2. Render → **New → Web Service** → selecione o repositório.
3. Build: `npm install` · Start: `node server.js` · Plano: Free.
4. Em **Environment**, adicione as variáveis do `.env`.

Sem Supabase configurado, o Render apaga os chamados a cada deploy (disco efêmero). Para uso real, configure o Supabase primeiro.
