import * as dotenv from 'dotenv'
import 'reflect-metadata'
import app from './app.js'
import { AppDataSource } from './data-source.js'
import faltamVariaveisDeAmbiente from './utils/serverUtils.js'

await faltamVariaveisDeAmbiente()

dotenv.config({ path: '.env' })

AppDataSource.initialize()
  .then(() => {
    console.log('App Data Source inicializado')
  })
  .catch((error) => {
    console.error(error)
  })

const porta = process.env.SERVER_PORT ?? '3000'

app.listen(porta, () => { console.log(`server running on port ${porta}`) }
)

export default app
