require('../src/config/env');
const db = require('../src/db');

async function checkIds() {
  try {
    const result = await db.query('SELECT id, matricula, nome_completo FROM colaboradores ORDER BY id', []);
    console.log('Colaboradores:');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}, Matrícula: ${row.matricula}, Nome: ${row.nome_completo}`);
    });
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await db.close();
    process.exit(0);
  }
}

checkIds();
