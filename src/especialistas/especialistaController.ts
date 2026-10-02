import { type Request, type Response } from 'express'
import { AppDataSource } from '../data-source.js'
import { Especialista } from './EspecialistaEntity.js'
import { mapeiaPlano } from '../utils/planoSaudeUtils.js'
import { Endereco } from '../enderecos/enderecoEntity.js'
import { AppError, Status } from '../error/ErrorHandler.js'
import { Role } from '../auth/roles.js'
import { Clinica } from '../clinicas/clinicaEntity.js'
import { encryptPassword } from '../utils/senhaUtils.js'

// Get All: só os especialistas da clínica autenticada
export const especialistas = async (
  req: Request,
  res: Response
): Promise<void> => {
  const allEspecialistas = await AppDataSource.manager.find(Especialista, {
    where: { clinica: { id: req.userId } }
  })
  res.status(200).json(allEspecialistas)
}
// Post
// Se o especialista for criado apenas com os atributos opcionais, enviar mensagem avisando quais campos faltam
export const criarEspecialista = async (
  req: Request,
  res: Response
): Promise<void> => {
  let { nome, crm, imagem, especialidade, endereco, email, telefone, estaAtivo, possuiPlanoSaude, planosSaude, senha } = req.body

  if (possuiPlanoSaude === true && planosSaude !== undefined) {
    // transforma array de numbers em array de strings com os nomes dos planos definidos no enum correspondente
    planosSaude = mapeiaPlano(planosSaude)
  }
  const senhaCriptografada = encryptPassword(senha)
  const especialista = new Especialista(
    nome,
    crm,
    imagem,
    estaAtivo,
    especialidade,
    email,
    telefone, possuiPlanoSaude, planosSaude, senhaCriptografada
  )

  const enderecoPaciente = new Endereco()

  if (endereco !== undefined) {
    enderecoPaciente.cep = endereco.cep
    enderecoPaciente.rua = endereco.rua
    enderecoPaciente.estado = endereco.estado
    enderecoPaciente.numero = endereco.numero
    enderecoPaciente.complemento = endereco.complemento

    especialista.endereco = enderecoPaciente

    await AppDataSource.manager.save(Endereco, enderecoPaciente).catch((err) => {
      console.log(err)
    })
  }

  // O especialista pertence à clínica que o cadastrou, nunca a uma clínica enviada no corpo
  const clinica = await AppDataSource.manager.findOneBy(Clinica, { id: req.userId })
  if (clinica !== null) {
    especialista.clinica = clinica
  }

  try {
    await AppDataSource.manager.save(Especialista, especialista)

    const { senha: _senha, clinica: _clinica, ...especialistaSemSenha } = especialista
    res.status(200).json(especialistaSemSenha)
  } catch (error) {
    if ((await AppDataSource.manager.findOne(Especialista, { where: { crm } })) != null) {
      res.status(422).json({ message: 'Crm já cadastrado' })
    } else {
      throw new AppError('Especialista não foi criado')
    }
  }
}
// Get By Id
export const especialistaById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const especialista = await AppDataSource.manager.findOneBy(Especialista, {
    id
  })

  if (especialista !== null) {
    res.status(200).json(especialista)
  } else {
    throw new AppError('Id não encontrado ')
  }
}

// Put especialista/:id
export const atualizarEspecialista = async (req: Request, res: Response): Promise<void> => {
  let { nome, crm, imagem, especialidade, email, telefone, estaAtivo, possuiPlanoSaude, planosSaude } = req.body
  const { id } = req.params

  if (possuiPlanoSaude === true && planosSaude !== undefined) {
    // transforma array de numbers em array de strings com os nomes dos planos definidos no enum correspondente
    planosSaude = mapeiaPlano(planosSaude)
  }

  const especialistaUpdate = await AppDataSource.manager.findOne(Especialista, {
    where: { id },
    relations: { clinica: true }
  })
  if (especialistaUpdate !== null) {
    const ehOProprio = req.userRole === Role.especialista && especialistaUpdate.id === req.userId
    const ehASuaClinica = req.userRole === Role.clinica && especialistaUpdate.clinica?.id === req.userId
    if (!ehOProprio && !ehASuaClinica) {
      throw new AppError('Não autorizado', Status.FORBIDDEN)
    }

    especialistaUpdate.nome = nome
    especialistaUpdate.imagem = imagem
    especialistaUpdate.email = email
    especialistaUpdate.telefone = telefone
    especialistaUpdate.possuiPlanoSaude = possuiPlanoSaude
    especialistaUpdate.planosSaude = planosSaude

    // CRM, especialidade e situação só podem ser alterados pela clínica
    if (ehASuaClinica) {
      especialistaUpdate.crm = crm
      especialistaUpdate.especialidade = especialidade
      especialistaUpdate.estaAtivo = estaAtivo
    }

    await AppDataSource.manager.save(Especialista, especialistaUpdate)
    res.json(especialistaUpdate)
  } else {
    throw new AppError('Id não encontrado ')
  }
}

// Delete por id especialista/:id
export const apagarEspecialista = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const especialistaDel = await AppDataSource.manager.findOne(Especialista, {
    where: { id },
    relations: { clinica: true }
  })
  if (especialistaDel !== null) {
    // Só o próprio especialista ou a clínica dele podem apagá-lo
    const ehOProprio = req.userRole === Role.especialista && especialistaDel.id === req.userId
    const ehASuaClinica = req.userRole === Role.clinica && especialistaDel.clinica?.id === req.userId
    if (!ehOProprio && !ehASuaClinica) {
      throw new AppError('Não autorizado', Status.FORBIDDEN)
    }

    await AppDataSource.manager.remove(Especialista, especialistaDel)
    res.json({ message: 'Especialista apagado!' })
  } else {
    throw new AppError('Id não encontrado')
  }
}

// patch
export const atualizaContato = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const buscaEspecialista = await AppDataSource.manager.findOneBy(
    Especialista,
    { id }
  )
  const telefone = req.body.telefone

  if (buscaEspecialista !== null) {
    buscaEspecialista.telefone = telefone
    await AppDataSource.createQueryBuilder()
      .update(Especialista, buscaEspecialista)
      .where(buscaEspecialista.telefone)
      .set({ telefone })
      .execute()
    res.status(200).json(buscaEspecialista)
  } else {
    throw new AppError('Telefone não atualizado')
  }
}

export const buscarEspecialistas = async (req: Request, res: Response): Promise<Response> => {
  const { especialidade, estado } = req.query

  if (especialidade === null || estado === null) { throw new AppError('Especialidade ou estados inválidos') }

  const especialistas = await AppDataSource.manager.find(Especialista, {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    where: especialidade ? { especialidade: especialidade as string } : undefined, relations: ['endereco']
  })

  const resultado = especialistas.filter(especialista => especialista.endereco.estado === estado)

  return res.json(resultado)
}
