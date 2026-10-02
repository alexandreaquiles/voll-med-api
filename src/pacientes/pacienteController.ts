// import { type Request, type Response } from 'express'
import { Request, Response } from 'express';
import { Paciente } from './pacienteEntity.js'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../data-source.js'
import { Endereco } from '../enderecos/enderecoEntity.js'
import { CPFValido } from './validacaoCPF.js'
import { mapeiaPlano } from '../utils/planoSaudeUtils.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { AppError, Status } from '../error/ErrorHandler.js'
import { geraHashDeSenha } from '../utils/senhaUtils.js'
import { pacienteSchema } from './pacienteYupSchema.js';
import { sanitizacaoPaciente } from './pacienteSanitizations.js'
import { filtroDeConsultasVisiveis, resumoDoPaciente } from '../consultas/consultaAcesso.js'

// Pacientes atendidos pelo especialista ou pela clínica autenticados, sem dados sensíveis
async function pacientesAtendidos (req: Request): Promise<Array<ReturnType<typeof resumoDoPaciente>>> {
  const filtro = filtroDeConsultasVisiveis(req.userId, req.userRole)
  if (filtro === null) {
    return []
  }
  const consultas = await AppDataSource.manager.find(Consulta, { where: filtro, relations: { paciente: true } })

  const pacientes = new Map<string, Paciente>()
  for (const { paciente } of consultas) {
    if (paciente != null) {
      pacientes.set(paciente.id, paciente)
    }
  }
  return [...pacientes.values()].map(resumoDoPaciente)
}

export const consultaPorPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userInput } = req.query;
  try {
    const listaPacientes = (await pacientesAtendidos(req)).filter((paciente) => paciente.nome === userInput);
    if (listaPacientes.length === 0) {
      res.status(404).json('Paciente não encontrado!');
    } else {
      res.status(200).json(listaPacientes);
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
}


export const criarPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pacienteData = req.body

    const pacienteSanitizado: Paciente = sanitizacaoPaciente(pacienteData)
    await pacienteSchema.validate(pacienteSanitizado);

    // Só os campos que o paciente pode definir. Papel, situação, histórico médico e imagem
    // não vêm do corpo da requisição.
    let {
      cpf,
      nome,
      email,
      senha,
      possuiPlanoSaude,
      endereco,
      telefone,
      planosSaude,
      imagemUrl
    } = pacienteSanitizado

    if (!CPFValido(cpf)) {
      throw new AppError('CPF Inválido!')
    }

    const existePacienteComCPF = await AppDataSource.getRepository(Paciente).findOne({
      where: { cpf }
    })
    if (existePacienteComCPF != null) {
      res.status(409).json({ message: 'Já existe um paciente com esse CPF!' })
    }

    if (possuiPlanoSaude === true && planosSaude !== undefined) {
      // transforma array de numbers em array de strings com os nomes dos planos definidos no enum correspondente
      planosSaude = mapeiaPlano(planosSaude)
    }

    const hashDaSenha = geraHashDeSenha(senha)
    const paciente = new Paciente(
      cpf,
      nome,
      email,
      hashDaSenha,
      telefone,
      planosSaude,
      true,
      imagemUrl,
      undefined,
      undefined
    )
    paciente.possuiPlanoSaude = possuiPlanoSaude
    const enderecoPaciente = new Endereco()

    if (endereco !== undefined) {
      enderecoPaciente.cep = endereco.cep
      enderecoPaciente.rua = endereco.rua
      enderecoPaciente.estado = endereco.estado
      enderecoPaciente.numero = endereco.numero
      enderecoPaciente.complemento = endereco.complemento

      paciente.endereco = enderecoPaciente

      await AppDataSource.manager.save(Endereco, enderecoPaciente)
    }

    await AppDataSource.manager.save(Paciente, paciente)

    const {senha: _senha, cpf: _cpf, ...pacienteSemDadosSensiveis} = paciente

    res.status(202).json(pacienteSemDadosSensiveis)
  } catch (error) {
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message })
    } else {
      res.status(502).json({ 'Paciente não foi criado': error })
      console.log(error)
    }
  }
}

export const exibeTodosPacientes = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(200).json(await pacientesAtendidos(req))
}

export const lerPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id },
    relations: {
      endereco: true,
      imagem: true
    }
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    res.status(200).json(paciente)
  }
}

export const listaConsultasPaciente = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id }
  })
  if (paciente == null) {
    throw new AppError('Paciente não encontrado!', Status.NOT_FOUND)
  }
  const consultas = await AppDataSource.manager.find(Consulta, {
    where: { paciente: { id: paciente.id }, canceladaEm: IsNull() }
  })

  const consultadasTratadas = consultas.map((consulta) => {
    return {
      id: consulta.id,
      data: consulta.data,
      desejaLembrete: consulta.desejaLembrete,
      lembretes: consulta.lembretes,
      especialista: consulta.especialista
    }
  })

  return res.json(consultadasTratadas)
}

// update
export const atualizarPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  // Só os dados de contato e de plano de saúde. CPF, situação, histórico médico,
  // imagem e papel não podem ser alterados pelo próprio paciente.
  let {
    nome,
    email,
    telefone,
    possuiPlanoSaude,
    planosSaude,
    imagemUrl
  } = req.body

  const { id } = req.params

  if (possuiPlanoSaude === true && planosSaude !== undefined) {
    // transforma array de numbers em array de strings com os nomes dos planos definidos no enum correspondente
    planosSaude = mapeiaPlano(planosSaude)
  }

  try {
    const paciente = await AppDataSource.manager.findOne(Paciente, {
      where: { id },
      relations: ['endereco']
    })

    if (paciente === null) {
      res.status(404).json('Paciente não encontrado!')
    } else {
      paciente.nome = nome
      paciente.email = email
      paciente.possuiPlanoSaude = possuiPlanoSaude
      paciente.telefone = telefone
      paciente.planosSaude = planosSaude
      paciente.imagemUrl = imagemUrl

      await AppDataSource.manager.save(Paciente, paciente)
      res.status(200).json(paciente)
    }
  } catch (error) {
    res.status(502).json('Paciente não foi atualizado!')
  }
}

export const atualizarEnderecoPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const { cep, rua, numero, estado, complemento } = req.body
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id },
    relations: ['endereco']
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    if (paciente.endereco === null) {
      const endereco = new Endereco()
      endereco.cep = cep
      endereco.rua = rua
      endereco.estado = estado
      endereco.numero = numero
      endereco.complemento = complemento

      paciente.endereco = endereco

      await AppDataSource.manager.save(Endereco, endereco)
    } else {
      paciente.endereco.cep = cep
      paciente.endereco.rua = rua
      paciente.endereco.estado = estado
      paciente.endereco.numero = numero
      paciente.endereco.complemento = complemento
    }

    await AppDataSource.manager.save(Paciente, paciente)

    res.status(200).json(paciente)
  }
}

// Não deleta o paciente, fica inativo
export const desativaPaciente = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params
  const paciente = await AppDataSource.manager.findOne(Paciente, {
    where: { id }
  })

  if (paciente === null) {
    res.status(404).json('Paciente não encontrado!')
  } else {
    paciente.estaAtivo = false
    // await AppDataSource.manager.save(Paciente, paciente)

    //! Caso deseje deletar o paciente, basta descomentar a linha abaixo
    await AppDataSource.manager.delete(Paciente, { id: paciente.id })
    res.json({
      message: 'Paciente desativado!'
    })
  }
}
