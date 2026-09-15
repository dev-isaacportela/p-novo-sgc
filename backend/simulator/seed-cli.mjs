// Regera o banco simulado do zero. Uso: cd backend && npm run sim:seed
import { DB_PATH } from './config.mjs';
import { seedDatabase } from './seed.mjs';

try {
  const counts = seedDatabase(DB_PATH, { reset: true });
  console.log(`Banco regerado em ${DB_PATH}`);
  for (const [tabela, total] of Object.entries(counts)) {
    console.log(`  ${tabela.padEnd(26)} ${total}`);
  }
} catch (error) {
  if (error?.code === 'EBUSY' || error?.code === 'EPERM') {
    console.error('Nao foi possivel apagar o banco: o simulador esta rodando. Pare o processo e tente de novo.');
    process.exitCode = 1;
  } else {
    throw error;
  }
}
