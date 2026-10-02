/* eslint-disable @typescript-eslint/no-misused-promises */
import cors from 'cors'
import express from 'express'
import 'express-async-errors'
import 'reflect-metadata'
import rotaAuth from './auth/authRoutes.js'
import rotaAvaliacoes from './avaliacoes/avaliacoesRoutes.js'
import rotaClinica from './clinicas/clinicaRoutes.js'
import rotaConsulta from './consultas/consultaRoutes.js'
import errorMiddleware from './error/errorMiddleware.js'
import rotaEspecialista from './especialistas/especialistaRoutes.js'
import rotaPaciente from './pacientes/pacienteRoutes.js'
import rotaPlanoDeSaude from './planosDeSaude/planosDeSaudeRoutes.js'

const app = express()

const corsOpts = {
  origin: false,

  methods: [
    'GET',
    'POST'
  ],

  allowedHeaders: [
    'Content-Type'
  ]
}

app.use(cors(corsOpts))

app.use(express.json())
app.use(express.urlencoded({ extended: true })) // envio de arquivo
// app.use("/images", express.static(resolve(__dirname, '..', 'tmp', 'uploads')))
app.use(express.static("tmp"))

rotaPaciente(app)
rotaAuth(app)
rotaEspecialista(app)
rotaAvaliacoes(app)
rotaClinica(app)
rotaConsulta(app)
rotaPlanoDeSaude(app)
app.use(errorMiddleware)

export default app
