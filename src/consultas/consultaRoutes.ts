/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import { buscaConsultaPorId, criaConsulta, deletaConsulta, listaConsultas } from './consultaController.js'
import { verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'
import { Role } from '../auth/roles.js'

export const consultaRouter = Router()
// Pacientes marcam para si mesmos; clínicas, para seus pacientes (o controller confere)
consultaRouter.post('/', verificaTokenJWT(Role.paciente, Role.clinica), criaConsulta)
consultaRouter.get('/', verificaTokenJWT(), listaConsultas)
// Os controllers só mostram as consultas de que o usuário participa
consultaRouter.get('/:id', verificaTokenJWT(), buscaConsultaPorId)
consultaRouter.delete('/:id', verificaTokenJWT(), deletaConsulta)

export default (app) => {
  app.use('/consulta', consultaRouter)
}
