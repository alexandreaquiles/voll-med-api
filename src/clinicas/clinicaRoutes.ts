/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import {
  listarClinicas,
  criarClinica,
  buscarClinica,
  atualizarClinica,
  deletarClinica,
  listaEspecialistasPorClinica,
  atualizaEspecialistaPeloIdDaClinica
} from './clinicaController.js'
import { Role } from '../auth/roles.js'
import { verificaProprioUsuario, verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'

export const clinicaRouter = Router()
clinicaRouter.get('/', listarClinicas)
clinicaRouter.post('/', criarClinica)
clinicaRouter.get('/:id', buscarClinica)
// Alterações em /clinica/:id só podem ser feitas pela própria clínica
const apenasAPropriaClinica = [verificaTokenJWT(Role.clinica), verificaProprioUsuario]

clinicaRouter.put('/:id', apenasAPropriaClinica, atualizarClinica)
clinicaRouter.delete('/:id', apenasAPropriaClinica, deletarClinica)

clinicaRouter.post('/:id/especialista', apenasAPropriaClinica, atualizaEspecialistaPeloIdDaClinica)

// listar todos os especialistas de uma clinica especificada pelo id
clinicaRouter.get('/:id/especialista', listaEspecialistasPorClinica)

export default (app) => {
  app.use('/clinica', clinicaRouter)
}
