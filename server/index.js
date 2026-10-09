import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrirBanco, criarRepositorio } from './db.js'
import { criarApp } from './app.js'

const PORTA = process.env.PORT || 3001
const db = abrirBanco(process.env.DB_PATH || 'data/financas.db')
const app = criarApp(criarRepositorio(db))

// Em produção (depois do `npm run build`), o mesmo servidor entrega o front-end
const dist = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile('index.html', { root: dist }))
}

app.listen(PORTA, () => console.log(`API de finanças rodando em http://localhost:${PORTA}`))
