import { Router } from 'express'
import { verificaProprioUsuario, verificaTokenJWT } from '../auth/middlewares/authMiddlewares.js'

import multer from 'multer'
import { Role } from '../auth/roles.js'
import multerConfig from '../config/multer.js'
import { criaImagem, destroiImagem, listaImagemPaciente } from './PacienteImagemController.js'
import {
  atualizarEnderecoPaciente,
  consultaPorPaciente,
  atualizarPaciente,
  criarPaciente,
  desativaPaciente,
  exibeTodosPacientes,
  lerPaciente,
  listaConsultasPaciente,
} from './pacienteController.js'

const upload = multer(multerConfig)

export const pacienteRouter = Router()

pacienteRouter.get('/', exibeTodosPacientes)
pacienteRouter.get('/consulta-por-paciente', consultaPorPaciente)
pacienteRouter.post('/', criarPaciente)
// Rotas com :id só podem ser usadas pelo próprio paciente
const apenasOProprioPaciente = [verificaTokenJWT(Role.paciente), verificaProprioUsuario]

pacienteRouter.get('/:id', apenasOProprioPaciente, lerPaciente)
pacienteRouter.get('/:id/consultas', apenasOProprioPaciente, listaConsultasPaciente)
pacienteRouter.put('/:id', apenasOProprioPaciente, atualizarPaciente)
pacienteRouter.delete(
  '/:id',
  apenasOProprioPaciente,
  desativaPaciente
)
pacienteRouter.patch(
  '/:id',
  apenasOProprioPaciente,
  atualizarEnderecoPaciente
)

pacienteRouter.post(
  '/:id/images',
  apenasOProprioPaciente,
  upload.single('file'),
  criaImagem
)

pacienteRouter.get(
  '/:id/images',
  apenasOProprioPaciente,
  upload.single('file'),
  listaImagemPaciente
)

pacienteRouter.delete(
  '/:id/images',
  apenasOProprioPaciente,
  destroiImagem
)

export default (app) => {
  app.use('/paciente', pacienteRouter)
}
