// npm run seed: popula o banco configurado no .env com um cenário de exemplo (não precisa de Redis)
import 'reflect-metadata'
import { AppDataSource } from './data-source.js'
import { populaBanco, SENHA_DE_EXEMPLO } from './seed/dadosDeExemplo.js'
import faltamVariaveisDeAmbiente from './utils/serverUtils.js'

await faltamVariaveisDeAmbiente()
await AppDataSource.initialize()

try {
  const resultado = await populaBanco(AppDataSource)

  if (resultado === null) {
    console.log('O banco já tem os dados de exemplo. Para recriá-los, apague o banco e rode o seed de novo.')
  } else {
    const lista = (titulo: string, itens: Array<{ nome: string, email: string }>): void => {
      console.log(`\n${titulo}:`)
      itens.forEach(({ nome, email }) => { console.log(`  ${nome.padEnd(16)} ${email}`) })
    }
    console.log(`Dados de exemplo criados: ${resultado.consultas} consultas no mês anterior e no atual.`)
    lista('Clínicas (entram no dashboard)', resultado.clinicas)
    lista('Especialistas', resultado.especialistas)
    lista('Pacientes', resultado.pacientes)
    console.log(`\nSenha de todos os usuários: ${SENHA_DE_EXEMPLO}`)
  }
} finally {
  await AppDataSource.destroy()
}
