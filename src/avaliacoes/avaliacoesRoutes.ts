/* eslint-disable @typescript-eslint/explicit-function-return-type */

/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import { listaAvaliacoes, criaAvaliacao } from './avaliacoesController.js'
import { verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'
import { Role } from '../auth/roles.js'

export const avaliacoesRouter = Router()

avaliacoesRouter.get('/', listaAvaliacoes)
avaliacoesRouter.post('/', verificaTokenJWT(Role.paciente), criaAvaliacao)

export default (app) => {
  app.use('/avaliacoes', avaliacoesRouter)
}
