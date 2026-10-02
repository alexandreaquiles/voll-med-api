import type { Indicadores, IndicadoresDaEspecialidade } from './resumoDeGestao.js'

export const MAXIMO_DE_LINHAS = 3

// Transforma os indicadores em um resumo para o gestor. A implementação simulada
// aplica regras fixas; uma implementação com LLM pode substituí-la recebendo os
// mesmos indicadores, que não têm dados de pacientes.
export interface GeradorDeResumo {
  gera: (indicadores: Indicadores) => Promise<string[]>
}

function nomeDoMes (mes: string): string {
  const [ano, numeroDoMes] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, numeroDoMes - 1, 1))
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const percentual = (parte: number, total: number): number => Math.round(parte / total * 100)

const plural = (quantidade: number, singular: string, plural: string): string =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`

const SUGESTOES_POR_MOTIVO: Record<string, (quantidade: string) => string> = {
  médico_cancelou: (quantidade) =>
    `A maioria dos cancelamentos (${quantidade}) partiu dos médicos. Sugerimos revisar a escala e as ausências da equipe.`,
  paciente_desistiu: (quantidade) =>
    `A maioria dos cancelamentos (${quantidade}) foi por desistência dos pacientes. Sugerimos ativar lembretes de confirmação.`
}

export class GeradorDeResumoSimulado implements GeradorDeResumo {
  async gera (indicadores: Indicadores): Promise<string[]> {
    const { atual } = indicadores
    if (atual.agendadas === 0) {
      return [`Não há consultas agendadas em ${nomeDoMes(indicadores.mes)}.`]
    }

    const alertas = [this.maiorAumento(indicadores), this.motivoPredominante(indicadores)]
      .filter((linha): linha is string => linha !== null)
    if (alertas.length === 0 && indicadores.anterior.agendadas > 0) {
      alertas.push(`Nenhuma especialidade teve aumento de cancelamentos em relação a ${nomeDoMes(indicadores.mesAnterior)}.`)
    }

    return [this.panorama(indicadores), ...alertas].slice(0, MAXIMO_DE_LINHAS)
  }

  private panorama ({ mes, mesAnterior, atual, anterior }: Indicadores): string {
    const totais = `Em ${nomeDoMes(mes)} foram ${plural(atual.agendadas, 'consulta agendada', 'consultas agendadas')} ` +
      `e ${plural(atual.canceladas, 'cancelamento', 'cancelamentos')} (${percentual(atual.canceladas, atual.agendadas)}% de cancelamento)`
    if (anterior.agendadas === 0) {
      return `${totais}.`
    }
    return `${totais}, contra ${percentual(anterior.canceladas, anterior.agendadas)}% em ${nomeDoMes(mesAnterior)}.`
  }

  // A especialidade em que os cancelamentos mais cresceram em relação ao mês anterior
  private maiorAumento ({ mes, anterior, especialidades }: Indicadores): string | null {
    if (anterior.agendadas === 0) {
      return null
    }
    const aumento = (e: IndicadoresDaEspecialidade): number => e.atual.canceladas - e.anterior.canceladas
    const [maior] = especialidades
      .filter((e) => aumento(e) > 0)
      .sort((a, b) => aumento(b) - aumento(a))
    if (maior === undefined) {
      return null
    }

    const { especialidade, atual: { canceladas }, anterior: { canceladas: canceladasAntes } } = maior
    const sugestao = 'Sugerimos revisar a escala de médicos.'
    if (canceladasAntes === 0) {
      return `${especialidade} teve ${plural(canceladas, 'cancelamento', 'cancelamentos')} em ${nomeDoMes(mes)}, ` +
        `contra nenhum no mês anterior. ${sugestao}`
    }
    return `Houve um aumento de ${percentual(canceladas - canceladasAntes, canceladasAntes)}% nos cancelamentos ` +
      `em ${especialidade} (de ${canceladasAntes} para ${canceladas}). ${sugestao}`
  }

  // O motivo de mais da metade dos cancelamentos do mês, quando há uma sugestão para ele
  private motivoPredominante ({ atual }: Indicadores): string | null {
    for (const [motivo, quantidade] of Object.entries(atual.motivos)) {
      const sugestao = SUGESTOES_POR_MOTIVO[motivo]
      if (sugestao !== undefined && quantidade > atual.canceladas / 2) {
        return sugestao(`${quantidade} de ${atual.canceladas}`)
      }
    }
    return null
  }
}
