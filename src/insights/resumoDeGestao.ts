import { GeradorDeResumoSimulado, type GeradorDeResumo } from './geradorDeResumo.js'

// Só o que a análise precisa de cada consulta: nenhum dado de paciente,
// para que os indicadores possam ser enviados a uma LLM sem expor dados pessoais.
export interface ConsultaParaAnalise {
  data: Date
  especialidade: string
  cancelada: boolean
  motivoCancelamento?: string | null
}

export interface IndicadoresDoMes {
  agendadas: number
  canceladas: number
  motivos: Record<string, number>
}

export interface IndicadoresDaEspecialidade {
  especialidade: string
  atual: IndicadoresDoMes
  anterior: IndicadoresDoMes
}

export interface Indicadores {
  mes: string
  mesAnterior: string
  atual: IndicadoresDoMes
  anterior: IndicadoresDoMes
  especialidades: IndicadoresDaEspecialidade[]
}

export const MOTIVO_NAO_INFORMADO = 'nao_informado'

// Meses no formato AAAA-MM, em UTC (o mesmo fuso usado na validação de horário da clínica)
export function mesDe (data: Date): string {
  return data.toISOString().slice(0, 7)
}

export function mesAnteriorA (mes: string): string {
  const [ano, numeroDoMes] = mes.split('-').map(Number)
  return mesDe(new Date(Date.UTC(ano, numeroDoMes - 2, 1)))
}

const semConsultas = (): IndicadoresDoMes => ({ agendadas: 0, canceladas: 0, motivos: {} })

function contabiliza (indicadores: IndicadoresDoMes, consulta: ConsultaParaAnalise): void {
  indicadores.agendadas++
  if (consulta.cancelada) {
    indicadores.canceladas++
    const motivo = consulta.motivoCancelamento ?? MOTIVO_NAO_INFORMADO
    indicadores.motivos[motivo] = (indicadores.motivos[motivo] ?? 0) + 1
  }
}

// Agrupa as consultas do mês e do mês anterior pela data da consulta.
// Toda consulta do mês conta como agendada; as canceladas contam também como cancelamento.
export function calculaIndicadores (consultas: ConsultaParaAnalise[], mes: string): Indicadores {
  const mesAnterior = mesAnteriorA(mes)
  const indicadores: Indicadores = { mes, mesAnterior, atual: semConsultas(), anterior: semConsultas(), especialidades: [] }
  const porEspecialidade = new Map<string, IndicadoresDaEspecialidade>()

  for (const consulta of consultas) {
    const mesDaConsulta = mesDe(new Date(consulta.data))
    const periodo = mesDaConsulta === mes ? 'atual' : mesDaConsulta === mesAnterior ? 'anterior' : null
    if (periodo === null) {
      continue
    }

    let especialidade = porEspecialidade.get(consulta.especialidade)
    if (especialidade === undefined) {
      especialidade = { especialidade: consulta.especialidade, atual: semConsultas(), anterior: semConsultas() }
      porEspecialidade.set(consulta.especialidade, especialidade)
    }

    contabiliza(indicadores[periodo], consulta)
    contabiliza(especialidade[periodo], consulta)
  }

  indicadores.especialidades = [...porEspecialidade.values()]
    .sort((a, b) => a.especialidade.localeCompare(b.especialidade, 'pt-BR'))
  return indicadores
}

// Analisa agendamentos e cancelamentos e devolve um resumo de até 3 linhas para o gestor da clínica
export async function geraResumoDeGestao (
  consultas: ConsultaParaAnalise[],
  mes: string,
  gerador: GeradorDeResumo = new GeradorDeResumoSimulado()
): Promise<{ resumo: string[], indicadores: Indicadores }> {
  const indicadores = calculaIndicadores(consultas, mes)
  const resumo = await gerador.gera(indicadores)
  return { resumo, indicadores }
}
