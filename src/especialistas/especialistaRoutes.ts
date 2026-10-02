import { Router, Response } from 'express'
import {
  especialistas,
  criarEspecialista,
  especialistaById,
  atualizarEspecialista,
  apagarEspecialista,
  atualizaContato,
  buscarEspecialistas
} from './especialistaController.js'
import { Role } from '../auth/roles.js'
import { verificaProprioUsuario, verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'

export const especialistaRouter = Router()

especialistaRouter.get('/', especialistas)
especialistaRouter.post('/', verificaTokenJWT(Role.clinica), criarEspecialista)
especialistaRouter.get('/busca', buscarEspecialistas)
especialistaRouter.get('/:id', especialistaById)
especialistaRouter.put(
  '/:id',
  verificaTokenJWT(Role.especialista),
  verificaProprioUsuario,
  atualizarEspecialista
)
especialistaRouter.delete(
  '/:id',
  verificaTokenJWT(Role.clinica, Role.especialista),
  apagarEspecialista
)
especialistaRouter.patch('/:id', verificaTokenJWT(Role.especialista), verificaProprioUsuario, atualizaContato)

export default (app) => {
  app.use('/especialista', especialistaRouter)
}
