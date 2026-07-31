# SeuQuebraGalho — MVP

Marketplace de marido de aluguel (inspirado na estratégia da DonaMaid). Detalhes do produto em [PLANO-MVP.md](PLANO-MVP.md).

## Rodar localmente

```
npm install
npm start        # http://localhost:3000
```

## Hospedar online (Render, grátis)

1. Suba este repositório para o GitHub.
2. Em [render.com](https://render.com), crie a conta (login com GitHub) e clique em **New → Blueprint**.
3. Selecione o repositório — o arquivo `render.yaml` configura tudo sozinho.
4. Pronto: o Render gera uma URL pública `https://seuquebragalho.onrender.com` (ou similar) para compartilhar.

**Observações do plano grátis:**
- O serviço "dorme" após ~15 min sem uso; a primeira visita depois disso demora ~50 s para acordar. Abra o link antes de demonstrar.
- O "banco" é um arquivo JSON em disco efêmero: agendamentos feitos na demo são zerados a cada deploy/reinício — ideal para demonstração, não para produção.

## Estrutura

```
server.js            # API Express (agendamentos, agenda, ganhos)
data/seed.json       # dados de demonstração (profissionais, serviços, preços)
public/              # frontend: landing, busca, agendamento, reservas, painel do pro
render.yaml          # blueprint de deploy no Render
```
