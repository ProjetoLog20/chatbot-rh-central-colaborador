require('../src/config/env');

const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');
const db = require('../src/db');

const filePath = process.argv[2];
const sheetName = process.argv[3] || 'IMPORTAR_COLABORADORES';

function trim(value) {
  return String(value ?? '').trim();
}

async function main() {
  if (!filePath) {
    throw new Error('Informe o caminho do arquivo .xlsx');
  }

  const workbook = xlsx.readFile(path.resolve(filePath));
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Aba ${sheetName} nao encontrada`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  const errors = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    const matricula = trim(row.matricula);
    const nomeCompleto = trim(row.nome_completo);
    const perfil = trim(row.perfil) || 'colaborador';

    if (!matricula || !nomeCompleto) {
      errors.push({ linha: index + 2, error: 'matricula e nome_completo sao obrigatorios' });
      continue;
    }

    const senhaHash = await bcrypt.hash(trim(row.senha) || 'log20', 10);

    try {
      await db.run(
        `INSERT INTO colaboradores (
          matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade,
          tipo_colaborador, status, data_admissao, senha_hash, perfil, nome_preferido,
          primeiro_acesso, senha_temporaria, data_ultima_troca_senha
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, true, true, null)
        ON CONFLICT(matricula) DO UPDATE SET
          nome_completo = excluded.nome_completo,
          cpf = excluded.cpf,
          telefone_whatsapp = excluded.telefone_whatsapp,
          email = excluded.email,
          cargo = excluded.cargo,
          setor = excluded.setor,
          unidade = excluded.unidade,
          tipo_colaborador = excluded.tipo_colaborador,
          status = excluded.status,
          data_admissao = excluded.data_admissao,
          perfil = excluded.perfil,
          senha_hash = excluded.senha_hash,
          nome_preferido = null,
          primeiro_acesso = true,
          senha_temporaria = true,
          data_ultima_troca_senha = null`,
        [
          matricula,
          nomeCompleto,
          trim(row.cpf),
          trim(row.telefone_whatsapp),
          trim(row.email),
          trim(row.cargo),
          trim(row.setor),
          trim(row.unidade),
          trim(row.tipo_colaborador),
          trim(row.status) || 'ativo',
          trim(row.data_admissao),
          senhaHash,
          perfil
        ]
      );
      imported += 1;
    } catch (error) {
      errors.push({ linha: index + 2, matricula, error: error.message });
    }
  }

  const total = await db.get('SELECT COUNT(*) AS total FROM colaboradores');
  const matriculas = rows.map((row) => trim(row.matricula)).filter(Boolean);
  const placeholders = matriculas.map(() => '?').join(',');
  const importedTotal = placeholders
    ? await db.get(`SELECT COUNT(*) AS total FROM colaboradores WHERE matricula IN (${placeholders})`, matriculas)
    : { total: 0 };

  console.log(JSON.stringify({
    arquivo: path.resolve(filePath),
    aba: sheetName,
    linhas: rows.length,
    importados: imported,
    erros: errors,
    total_colaboradores_banco: Number(total.total),
    total_matriculas_planilha_no_banco: Number(importedTotal.total)
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
