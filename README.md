# Finanças Pessoais

App full-stack para controlar receitas e despesas: lançamentos por categoria, resumo do mês e gráficos de evolução.

**Stack:** React 18 · Vite · Node.js · Express · SQLite (`node:sqlite`) · testes com `node:test`

<!-- Coloque aqui um print do app: ![Tela do app](docs/tela.png) -->

## Funcionalidades

- Cadastro, edição e exclusão de receitas e despesas
- Navegação por mês, com resumo de receitas, despesas e saldo
- Gráfico de receitas x despesas dos últimos 6 meses (com tooltip e visão em tabela)
- Despesas por categoria com percentual do total
- Validação no front-end e na API, com mensagens por campo
- Tema claro e escuro automático, layout responsivo e navegação por teclado

## Como rodar

Requer **Node.js 22.13+** (usa o SQLite nativo do Node, sem instalar banco).

```bash
npm install
npm run seed   # opcional: cria 6 meses de dados de exemplo
npm run dev    # API em :3001 e front-end em http://localhost:5174
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Roda os testes da API |
| `npm run build` | Gera o front-end de produção em `dist/` |
| `npm start` | Sobe a API servindo também o front-end (após o build) |

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/categorias` | Categorias de receita e despesa |
| GET | `/api/transacoes?mes=AAAA-MM&tipo=` | Lista as transações do mês (`tipo` opcional) |
| POST | `/api/transacoes` | Cria uma transação |
| PUT | `/api/transacoes/:id` | Atualiza uma transação |
| DELETE | `/api/transacoes/:id` | Remove uma transação |
| GET | `/api/resumo?mes=AAAA-MM` | Totais do mês e despesas por categoria |
| GET | `/api/evolucao?ate=AAAA-MM&meses=6` | Receitas e despesas mês a mês |

Exemplo de corpo para criar uma transação:

```json
{ "tipo": "despesa", "descricao": "Mercado", "valor": 150.75, "categoria": "Alimentação", "data": "2026-10-05" }
```

## Decisões técnicas

- **Valores em centavos (inteiros) no banco**, para evitar erros de ponto flutuante (`0.1 + 0.2 !== 0.3`).
- **Agregações em SQL** (`SUM`, `CASE`, `GROUP BY`) em vez de calcular no JavaScript.
- **Consultas parametrizadas** (`prepare`) contra SQL injection.
- **Validação no servidor**, não só no formulário: tipo, categoria compatível, valor positivo com até 2 casas e data real (rejeita 31/02).
- **API testável**: o app recebe o repositório por parâmetro, e os testes usam um banco em memória.
- **Gráficos em SVG feitos à mão**, com paleta validada para daltonismo e tabela alternativa para acessibilidade.

## Estrutura

```
server/
  db.js          # schema e consultas SQL
  validacao.js   # regras de validação
  app.js         # rotas Express
  index.js       # sobe o servidor
  seed.js        # dados de exemplo
  app.test.js    # testes da API
src/
  App.jsx        # estado e layout
  api.js         # chamadas HTTP
  components/    # KPIs, formulário, tabela e gráficos
```

---

Feito por [Raíssa Almeida](https://www.linkedin.com/in/raissakalmeida/)
