# Plano do MVP — "SeuQuebraGalho" (SaaS de Marido de Aluguel)

> Marketplace de agendamento de serviços de reparos residenciais, inspirado na estratégia da [DonaMaid](https://www.donamaid.com) (diaristas), adaptado para "marido de aluguel".

## 1. Estratégia de referência (DonaMaid)

O que a DonaMaid faz e que vamos replicar:

| Elemento DonaMaid | Adaptação SeuQuebraGalho |
|---|---|
| Landing "A maneira mais fácil de contratar uma diarista" | Hero "A maneira mais fácil de contratar um marido de aluguel" |
| Seletor de cidade na home | Seletor de cidade → lista de profissionais da região |
| "É muito fácil contratar" em 3 passos | 1) Informe local e serviço → 2) Escolha o profissional (avaliações + agenda) → 3) Agende e pronto |
| Preço por hora, pagamento online | Tabela de preços por categoria de serviço (R$/hora, mínimo 1h) |
| Prova social (nº de horas, clientes, avaliações, depoimentos) | Seção de números + depoimentos de clientes e profissionais |
| FAQ na landing | FAQ adaptado (o que está incluso, reagendamento, formas de pagamento…) |
| Funil separado "Quero ser diarista" | Funil "Quero ser profissional" + painel do profissional |
| Profissional escolhe dias/horários e bairros | Painel do profissional com grade de disponibilidade semanal |

## 2. Os dois lados do marketplace

### Lado do cliente
- **Landing page** — como funciona, tabela de preços, prova social, FAQ.
- **Busca de profissionais** — filtro por cidade e tipo de serviço; cards com foto, nota, nº de avaliações, especialidades.
- **Agendamento** — escolhe serviço, data, horário (só aparecem horários realmente livres do profissional), duração e endereço; o preço é calculado na hora.
- **Minhas reservas** — acompanha status (pendente → confirmado → concluído / recusado). Identificação simplificada por e-mail (MVP, sem senha).

### Lado do profissional
- **Notificações** — novos pedidos chegam como "pendentes"; o profissional aceita ou recusa em 1 clique.
- **Quanto recebe** — cada pedido mostra o valor bruto e o repasse (80% — taxa da plataforma de 20%); painel soma ganhos confirmados.
- **Disponibilidade** — grade semanal (dia da semana + hora início/fim); o que ele marca aqui é o que o cliente vê como horário livre.

## 3. Tabela de preços (MVP)

| Serviço | Preço cliente | Repasse (80%) |
|---|---|---|
| Reparos gerais | R$ 90/h | R$ 72/h |
| Elétrica | R$ 110/h | R$ 88/h |
| Hidráulica | R$ 110/h | R$ 88/h |
| Montagem de móveis | R$ 85/h | R$ 68/h |
| Instalações (TV, cortinas, prateleiras) | R$ 95/h | R$ 76/h |

Mínimo de 1 hora; duração escolhida pelo cliente (1–8h).

## 4. Stack técnica

- **Backend:** Node.js + Express, armazenamento em JSON (`data/db.json`) — zero fricção para rodar o MVP; trocar por Postgres/Prisma na v2.
- **Frontend:** HTML/CSS/JS puro, multi-página, design system próprio (azul confiança + laranja CTA, padrão marketplace).
- **Auth (MVP):** cliente identificado por e-mail; profissional entra por seletor de demonstração. v2: auth real (magic link / senha).
- **Pagamento (MVP):** simulado no fluxo ("pagamento na conclusão"). v2: Stripe/Pagar.me.

## 5. API

| Rota | Descrição |
|---|---|
| `GET /api/config` | Cidades, serviços e tabela de preços |
| `GET /api/pros?city=&service=` | Lista profissionais filtrados |
| `GET /api/pros/:id` | Perfil do profissional |
| `GET /api/pros/:id/slots?date=` | Horários livres (disponibilidade − reservas) |
| `POST /api/bookings` | Cria reserva (status `pendente`), preço calculado no servidor |
| `GET /api/bookings?email=` | Reservas do cliente |
| `GET /api/pro/:id/bookings` | Pedidos do profissional (pendentes = notificações) |
| `POST /api/bookings/:id/accept` / `.../decline` | Aceitar / recusar |
| `GET /api/pro/:id/earnings` | Ganhos (repasse de 80%) |
| `PUT /api/pro/:id/availability` | Atualiza grade semanal |

## 6. Fora do escopo do MVP (v2)

Pagamento online real, assinaturas recorrentes (estratégia DonaMaid de retenção), app mobile do profissional, chat cliente↔profissional, avaliações pós-serviço, verificação de antecedentes, área administrativa.

## 7. Como rodar

```
npm install
npm start        # http://localhost:3000
```

Páginas: `/` (landing) · `/profissionais.html` (busca) · `/agendar.html?pro=ID` (agendamento) · `/minhas-reservas.html` (cliente) · `/pro.html` (painel do profissional)
