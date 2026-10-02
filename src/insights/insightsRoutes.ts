/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import { verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'
import { Role } from '../auth/roles.js'
import { resumoDeGestao } from './insightsController.js'

export const insightsRouter = Router()

// Módulo do gestor da clínica
insightsRouter.get('/insights', verificaTokenJWT(Role.clinica), resumoDeGestao)

export default (app): void => {
  app.use('/admin', insightsRouter)
}
