import { request, type Request, type Response } from 'express'
import crypto from 'crypto'
import { Autenticaveis } from './authEntity.js'
import { access, refresh } from './tokens.js'
import { registraTentativaErrada, verificaTentativasDeLogin, zeraTentativas } from './tentativasDeLogin.js'

import { AppDataSource } from '../data-source.js'
import { AppError } from '../error/ErrorHandler.js'
import { confereSenha, ehHashDeSenha, geraHashDeSenha } from '../utils/senhaUtils.js'
import { Role } from './roles.js'
import { Paciente } from '../pacientes/pacienteEntity.js'
import { Especialista } from '../especialistas/EspecialistaEntity.js'
import { Clinica } from '../clinicas/clinicaEntity.js'

// Autenticaveis é uma view: a senha é atualizada na tabela de cada tipo de usuário
const TABELA_POR_PAPEL = {
  [Role.paciente]: Paciente,
  [Role.especialista]: Especialista,
  [Role.clinica]: Clinica
}

// Hash de uma senha aleatória, conferido quando o email não existe
const HASH_DE_REFERENCIA = geraHashDeSenha(crypto.randomBytes(16).toString('hex'))

const estaAtivo = (autenticavel: Autenticaveis): boolean => Boolean(Number(autenticavel.estaAtivo))

// Troca uma senha ainda no formato antigo (criptografia reversível) pelo hash
async function migraParaHash (id: string, role: Role, senha: string): Promise<void> {
  const tabela = TABELA_POR_PAPEL[role]
  if (tabela !== undefined) {
    await AppDataSource.manager.update(tabela, { id }, { senha: geraHashDeSenha(senha) })
  }
}

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { email, senha } = req.body

  if (req.userId) {
    const autenticavel = await AppDataSource.manager.findOne(Autenticaveis, {
      select: ['id', 'role', 'rota', 'estaAtivo'],
      where: { id: req.userId }
    })

    if (autenticavel == null || !estaAtivo(autenticavel)) {
      throw new AppError('Sessão inválida. Faça login novamente', 401)
    }

    const newAccessToken = access.cria(req.userId, autenticavel.role)
    const newRefreshToken = await refresh.cria(req.userId)
    return res.status(200).json({
      auth: true,
      newAccessToken,
      newRefreshToken,
      rota: autenticavel.rota
    })
  }

  await verificaTentativasDeLogin(email)

  const autenticavel = await AppDataSource.manager.findOne(Autenticaveis, {
    select: ['id', 'rota', 'role', 'senha', 'estaAtivo'],
    where: { email }
  })

  // Email inexistente e senha errada têm a mesma resposta, e nos dois casos a senha é conferida
  // contra um hash: diferenças na resposta ou no tempo revelariam quais emails têm cadastro
  const senhaConfere = typeof senha === 'string' && confereSenha(senha, autenticavel?.senha ?? HASH_DE_REFERENCIA)
  // Usuários desativados recebem a mesma resposta, para não revelar a situação da conta
  if (autenticavel == null || !senhaConfere || !estaAtivo(autenticavel)) {
    await registraTentativaErrada(email)
    throw new AppError('Email ou senha inválidos', 401)
  } else {
    await zeraTentativas(email)
    const { id, rota, role, senha: senhaAuth } = autenticavel

    if (!ehHashDeSenha(senhaAuth)) {
      await migraParaHash(id, role, senha)
    }

    // aqui passo o role pq vai pro payload
    const accessToken = access.cria(id, role)
    const refreshToken = await refresh.cria(id)

    return res.status(200).json({
      auth: true,
      accessToken,
      refreshToken,
      rota
    })
  }
}

export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token != null) {
    await access.invalida(token)
  }
  res.status(204).json({ auth: false, token: null, message: 'Logout realizado com sucesso!' })
}
