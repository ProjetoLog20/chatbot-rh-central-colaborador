require('./src/config/env');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data/db.sqlite'), (err) => {
  if (err) {
    console.error('Erro ao conectar:', err);
    process.exit(1);
  }
  
  // Listar todos os colaboradores
  db.all("SELECT id, matricula, nome_completo, cargo FROM colaboradores", (err, all) => {
    if (err) console.error('Erro:', err);
    console.log('\n=== TODOS OS COLABORADORES ===');
    console.log(JSON.stringify(all, null, 2));
    
    // Total de registros de produtividade
    db.get("SELECT COUNT(*) as total FROM produtividade_colaboradores", (err, result) => {
      console.log('\n=== TOTAL DE REGISTROS DE PRODUTIVIDADE ===');
      console.log('Total:', result?.total || 'N/A');
      
      // Amostra de produtividade
      db.all("SELECT colaborador_id, COUNT(*) as qtd FROM produtividade_colaboradores GROUP BY colaborador_id", (err, prod) => {
        console.log('\n=== PRODUTIVIDADE POR COLABORADOR ===');
        console.log(JSON.stringify(prod, null, 2));
        db.close();
      });
    });
  });
});
