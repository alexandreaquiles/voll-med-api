import { AppError } from '../error/ErrorHandler.js'

enum PlanosSaude {
  'Sulamerica',
  'Unimed',
  'Bradesco',
  'Amil',
  'Biosaude',
  'Biovida',
  'Outro',
}

function mapeiaPlano (planosSaude: any[]): string[] {
  if (planosSaude.length === 0) {
    throw new AppError('A lista de planos de saúde não pode ser vazia!')
  }

  // Aceita o plano pelo número ou pelo nome do enum e devolve sempre o nome. Como o enum é
  // numérico, PlanosSaude['Unimed'] seria 1: sem essa conversão, nomes virariam números.
  return planosSaude.map((plano) => {
    const nome = typeof plano === 'number' ? PlanosSaude[plano] : plano
    if (typeof nome !== 'string' || !(nome in PlanosSaude) || !isNaN(Number(nome))) {
      throw new AppError(`O plano ${String(plano)} não existe!`)
    }
    return nome
  })
}

export { PlanosSaude, mapeiaPlano }
