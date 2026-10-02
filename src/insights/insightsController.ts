import { type Request, type Response } from 'express'
import { AppDataSource } from '../data-source.js'
import { Consulta } from '../consultas/consultaEntity.js'
import { filtroDeConsultasVisiveis } from '../consultas/consultaAcesso.js'
import { AppError, Status } from '../error/ErrorHandler.js'
import { GeradorDeResumoSimulado, type GeradorDeResumo } from './geradorDeResumo.js'
import { geraResumoDeGestao, mesDe, type ConsultaParaAnalise } from './resumoDeGestao.js'

// Simulação da LLM. Para usar uma LLM de verdade, troque por outra implementação de GeradorDeResumo.
const geradorDeResumo: GeradorDeResumo = new GeradorDeResumoSimulado()

const FORMATO_DO_MES = /^\d{4}-(0[1-9]|1[0-2])$/

// GET /admin/insights?mes=AAAA-MM (padrão: mês atual): resumo das consultas dos especialistas da clínica
export const resumoDeGestao = async (req: Request, res: Response): Promise<Response> => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : mesDe(new Date())
  if (!FORMATO_DO_MES.test(mes)) {
    throw new AppError('Informe o mês no formato AAAA-MM', Status.BAD_REQUEST)
  }

  const filtro = filtroDeConsultasVisiveis(req.userId, req.userRole)
  if (filtro === null) {
    throw new AppError('Não autorizado', Status.FORBIDDEN)
  }
  const consultas = await AppDataSource.manager.find(Consulta, { where: filtro })

  const paraAnalise: ConsultaParaAnalise[] = consultas.map((consulta) => ({
    data: consulta.data,
    especialidade: consulta.especialista.especialidade,
    cancelada: consulta.canceladaEm != null,
    motivoCancelamento: consulta.motivoCancelamento
  }))

  const { resumo, indicadores } = await geraResumoDeGestao(paraAnalise, mes, geradorDeResumo)
  return res.json({ mes, resumo, indicadores })
}
