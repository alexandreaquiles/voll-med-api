import { describe, expect, test } from '@jest/globals'
import { MAXIMO_DE_LINHAS, type GeradorDeResumo } from '../insights/geradorDeResumo.js'
import {
  calculaIndicadores,
  geraResumoDeGestao,
  mesAnteriorA,
  type ConsultaParaAnalise,
  type Indicadores
} from '../insights/resumoDeGestao.js'

// Gera n consultas de uma especialidade no mês, das quais as primeiras são canceladas com os motivos dados
function consultas (
  mes: string, especialidade: string, quantidade: number, motivosDosCancelamentos: string[] = []
): ConsultaParaAnalise[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    data: new Date(`${mes}-10T14:00:00.000Z`),
    especialidade,
    cancelada: i < motivosDosCancelamentos.length,
    motivoCancelamento: motivosDosCancelamentos[i] ?? null
  }))
}

const vezes = (quantidade: number, motivo: string): string[] => Array(quantidade).fill(motivo)

describe('mesAnteriorA', () => {
  test('volta um mês, inclusive na virada do ano', () => {
    expect(mesAnteriorA('2026-10')).toBe('2026-09')
    expect(mesAnteriorA('2026-01')).toBe('2025-12')
  })
})

describe('calculaIndicadores', () => {
  test('agrupa agendamentos e cancelamentos por mês e especialidade, ignorando outros meses', () => {
    const indicadores = calculaIndicadores([
      ...consultas('2026-10', 'Cardiologia', 3, ['médico_cancelou']),
      ...consultas('2026-09', 'Cardiologia', 2),
      ...consultas('2026-10', 'Pediatria', 1, ['paciente_desistiu']),
      ...consultas('2026-08', 'Pediatria', 5, vezes(5, 'outros'))
    ], '2026-10')

    expect(indicadores.mesAnterior).toBe('2026-09')
    expect(indicadores.atual).toEqual({ agendadas: 4, canceladas: 2, motivos: { médico_cancelou: 1, paciente_desistiu: 1 } })
    expect(indicadores.anterior).toEqual({ agendadas: 2, canceladas: 0, motivos: {} })
    expect(indicadores.especialidades).toEqual([
      {
        especialidade: 'Cardiologia',
        atual: { agendadas: 3, canceladas: 1, motivos: { médico_cancelou: 1 } },
        anterior: { agendadas: 2, canceladas: 0, motivos: {} }
      },
      {
        especialidade: 'Pediatria',
        atual: { agendadas: 1, canceladas: 1, motivos: { paciente_desistiu: 1 } },
        anterior: { agendadas: 0, canceladas: 0, motivos: {} }
      }
    ])
  })

  test('conta cancelamentos sem motivo como não informado', () => {
    const indicadores = calculaIndicadores(consultas('2026-10', 'Cardiologia', 1, [null as unknown as string]), '2026-10')

    expect(indicadores.atual.motivos).toEqual({ nao_informado: 1 })
  })
})

describe('geraResumoDeGestao com o gerador simulado', () => {
  test('aponta o aumento de cancelamentos por especialidade e o motivo predominante', async () => {
    const { resumo } = await geraResumoDeGestao([
      ...consultas('2026-09', 'Cardiologia', 10, vezes(4, 'médico_cancelou')),
      ...consultas('2026-09', 'Pediatria', 10, vezes(2, 'paciente_desistiu')),
      ...consultas('2026-10', 'Cardiologia', 10, [...vezes(5, 'médico_cancelou'), 'paciente_desistiu']),
      ...consultas('2026-10', 'Pediatria', 10, ['paciente_desistiu'])
    ], '2026-10')

    expect(resumo).toEqual([
      'Em outubro de 2026 foram 20 consultas agendadas e 7 cancelamentos (35% de cancelamento), contra 30% em setembro de 2026.',
      'Houve um aumento de 50% nos cancelamentos em Cardiologia (de 4 para 6). Sugerimos revisar a escala de médicos.',
      'A maioria dos cancelamentos (5 de 7) partiu dos médicos. Sugerimos revisar a escala e as ausências da equipe.'
    ])
  })

  test('sugere lembretes quando a maioria dos cancelamentos é desistência dos pacientes', async () => {
    const { resumo } = await geraResumoDeGestao([
      ...consultas('2026-09', 'Cardiologia', 4, ['paciente_desistiu']),
      ...consultas('2026-10', 'Cardiologia', 4, vezes(3, 'paciente_desistiu'))
    ], '2026-10')

    expect(resumo[2]).toBe(
      'A maioria dos cancelamentos (3 de 3) foi por desistência dos pacientes. Sugerimos ativar lembretes de confirmação.'
    )
  })

  test('aponta a especialidade que passou a ter cancelamentos', async () => {
    const { resumo } = await geraResumoDeGestao([
      ...consultas('2026-09', 'Cardiologia', 2),
      ...consultas('2026-10', 'Cardiologia', 2),
      ...consultas('2026-10', 'Pediatria', 4, vezes(2, 'outros'))
    ], '2026-10')

    expect(resumo).toEqual([
      'Em outubro de 2026 foram 6 consultas agendadas e 2 cancelamentos (33% de cancelamento), contra 0% em setembro de 2026.',
      'Pediatria teve 2 cancelamentos em outubro de 2026, contra nenhum no mês anterior. Sugerimos revisar a escala de médicos.'
    ])
  })

  test('informa quando nenhuma especialidade teve aumento de cancelamentos', async () => {
    const { resumo } = await geraResumoDeGestao([
      ...consultas('2026-09', 'Cardiologia', 5, vezes(3, 'outros')),
      ...consultas('2026-10', 'Cardiologia', 5, ['outros'])
    ], '2026-10')

    expect(resumo).toEqual([
      'Em outubro de 2026 foram 5 consultas agendadas e 1 cancelamento (20% de cancelamento), contra 60% em setembro de 2026.',
      'Nenhuma especialidade teve aumento de cancelamentos em relação a setembro de 2026.'
    ])
  })

  test('não compara com o mês anterior quando não há consultas nele', async () => {
    const { resumo } = await geraResumoDeGestao(consultas('2026-10', 'Cardiologia', 1, ['outros']), '2026-10')

    expect(resumo).toEqual([
      'Em outubro de 2026 foram 1 consulta agendada e 1 cancelamento (100% de cancelamento).'
    ])
  })

  test('informa quando não há consultas no mês', async () => {
    const { resumo } = await geraResumoDeGestao(consultas('2026-09', 'Cardiologia', 3), '2026-10')

    expect(resumo).toEqual(['Não há consultas agendadas em outubro de 2026.'])
  })

  test(`nunca passa de ${MAXIMO_DE_LINHAS} linhas`, async () => {
    const { resumo } = await geraResumoDeGestao([
      ...consultas('2026-09', 'Cardiologia', 10, ['médico_cancelou']),
      ...consultas('2026-10', 'Cardiologia', 10, vezes(8, 'médico_cancelou')),
      ...consultas('2026-10', 'Pediatria', 10, vezes(5, 'médico_cancelou'))
    ], '2026-10')

    expect(resumo.length).toBeLessThanOrEqual(MAXIMO_DE_LINHAS)
  })
})

describe('geraResumoDeGestao com outro gerador (ex.: uma LLM)', () => {
  test('entrega ao gerador só os indicadores agregados', async () => {
    let recebidos: Indicadores | undefined
    const gerador: GeradorDeResumo = {
      gera: async (indicadores) => {
        recebidos = indicadores
        return ['resumo da LLM']
      }
    }

    const { resumo } = await geraResumoDeGestao(consultas('2026-10', 'Cardiologia', 2, ['outros']), '2026-10', gerador)

    expect(resumo).toEqual(['resumo da LLM'])
    expect(recebidos?.atual).toEqual({ agendadas: 2, canceladas: 1, motivos: { outros: 1 } })
  })
})
