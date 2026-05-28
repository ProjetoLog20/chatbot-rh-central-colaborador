const express = require('express');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');

const allowedExtensions = new Set(['csv', 'xlsx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return callback(new Error('Apenas arquivos .xlsx ou .csv sao permitidos'));
    }
    return callback(null, true);
  }
});
const router = express.Router();

function parseBuffer(file) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error('Extensao de arquivo invalida');
  }

  if (ext === 'csv') {
    return csvParse(file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true });
  }

  const workbook = xlsx.read(file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

function normalizeValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
  }
  return '';
}

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo excede o limite de 5 MB' });
  }
  return res.status(400).json({ error: err.message || 'Erro no upload do arquivo' });
}

const uploadSingleFile = [
  upload.single('file'),
  handleUploadError
];

function sendWorkbook(res, fileName, sheets) {
  const workbook = xlsx.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheet = xlsx.utils.json_to_sheet(sheet.rows);
    worksheet['!cols'] = sheet.columns.map((width) => ({ wch: width }));
    xlsx.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
}

router.get('/modelos/:tipo', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const tipo = req.params.tipo;

  if (tipo === 'colaboradores') {
    return sendWorkbook(res, 'modelo_colaboradores.xlsx', [
      {
        name: 'Colaboradores',
        columns: [14, 28, 16, 18, 28, 20, 18, 18, 18, 14, 16, 14, 16],
        rows: [{
          matricula: '4000',
          nome_completo: 'Nome do Colaborador',
          cpf: '00000000000',
          telefone_whatsapp: '45999990000',
          email: 'colaborador@empresa.com',
          cargo: 'Analista',
          setor: 'RH',
          unidade: 'Cascavel',
          tipo_colaborador: 'Interno',
          status: 'Ativo',
          data_admissao: '2026-05-22',
          senha: '',
          perfil: 'colaborador'
        }]
      },
      {
        name: 'Instrucoes',
        columns: [28, 80],
        rows: [
          { campo: 'matricula', orientacao: 'Obrigatorio. Usado para criar ou atualizar o colaborador.' },
          { campo: 'nome_completo', orientacao: 'Obrigatorio.' },
          { campo: 'perfil', orientacao: 'Use colaborador, motorista ou admin.' },
          { campo: 'senha', orientacao: 'Opcional. Se ficar vazio, o sistema usa a senha temporária log20 para novos registros.' }
        ]
      }
    ]);
  }

  if (tipo === 'prontuario_motoristas') {
    const workbook = xlsx.utils.book_new();
    const rows = [
      ['Legenda', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['De 0,000 ate 10,009 pontos', '', 'De 10,010 ate 20,009 pontos', 'De 20,010 ate 30,009 pontos', '', 'De 30,010 ate 40,009 pontos', '', 'Acima de 40,010 pontos', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Colaborador', '', '', '', '', '', '', '', 'Situacao', '', '', '', '', 'CNH', '', 'Documentos', '', '', '', 'Ocorrencias', ''],
      ['Situacao Empregado', 'Empregado', '', '', 'CPF', '', 'Cargo', '', 'Status', 'Motivo', '', '', 'Data Bloqueio', 'Pontuacao', 'Vencimento', 'RS', 'EC', 'IT', 'ET', 'Pontuacao Ponderada', 'Faixa'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['ATIVO', 'NOME DO CONDUTOR', '', '', '000.000.000-00', '', 'Motorista Caminhao Distribuicao', '', 'LIBERADO', '', '', '', '', 0, '2033-03-16', 'N / A', 'N / A', 'OK', 'OK', 5, 'Verde']
    ];
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [18, 34, 18, 18, 16, 12, 34, 12, 16, 22, 12, 12, 16, 12, 16, 12, 12, 12, 12, 18, 14].map((wch) => ({ wch }));
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="modelo_prontuario_motoristas.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  }

  if (tipo === 'respostas_chatbot') {
    return sendWorkbook(res, 'modelo_respostas_chatbot.xlsx', [
      {
        name: 'Respostas',
        columns: [18, 42, 80, 10],
        rows: [{
          categoria: 'RH',
          pergunta: 'Como funciona a ouvidoria?',
          resposta: 'A ouvidoria esta disponivel em https://www.log20.com.br/ouvidorias',
          ativo: 1
        }]
      },
      {
        name: 'Instrucoes',
        columns: [28, 80],
        rows: [
          { campo: 'categoria', orientacao: 'Opcional. Ajuda a organizar as respostas.' },
          { campo: 'pergunta', orientacao: 'Obrigatorio. Escreva uma pergunta ou palavra-chave.' },
          { campo: 'resposta', orientacao: 'Obrigatorio. Texto que o chatbot pode responder.' },
          { campo: 'ativo', orientacao: 'Use 1 para ativo e 0 para inativo.' }
        ]
      }
    ]);
  }

  return res.status(404).json({ error: 'Modelo nao encontrado' });
});

router.post('/colaboradores', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  let rows;
  try {
    rows = parseBuffer(req.file);
  } catch (err) {
    return res.status(400).json({ error: 'Formato de arquivo invalido' });
  }

  const errors = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    const matricula = normalizeValue(row, ['matricula', 'MATRICULA', 'Matricula']);
    const nomeCompleto = normalizeValue(row, ['nome_completo', 'NOME', 'Nome']);
    const senhaFormatted = normalizeValue(row, ['senha', 'Senha']);
    const senha = senhaFormatted ? senhaFormatted : 'log20';
    const perfil = normalizeValue(row, ['perfil', 'Perfil']) || 'colaborador';

    if (!matricula || !nomeCompleto) {
      errors.push({ row: index + 1, error: 'Matricula e nome_completo sao obrigatorios' });
      continue;
    }

    try {
      await runDb(
        `INSERT INTO colaboradores (matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade, tipo_colaborador, status, data_admissao, senha_hash, perfil, primeiro_acesso, senha_temporaria, data_ultima_troca_senha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, true, null)
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
           senha_hash = colaboradores.senha_hash`,
        [
          matricula,
          nomeCompleto,
          normalizeValue(row, ['cpf', 'CPF']),
          normalizeValue(row, ['telefone_whatsapp', 'Telefone']),
          normalizeValue(row, ['email', 'Email']),
          normalizeValue(row, ['cargo', 'Cargo']),
          normalizeValue(row, ['setor', 'Setor']),
          normalizeValue(row, ['unidade', 'Unidade']),
          normalizeValue(row, ['tipo_colaborador', 'Tipo']),
          normalizeValue(row, ['status', 'Status']) || 'Ativo',
          normalizeValue(row, ['data_admissao', 'DataAdmissao']),
          bcrypt.hashSync(senha, 10),
          perfil
        ]
      );
      imported += 1;
    } catch (err) {
      errors.push({ row: index + 1, error: err.message });
    }
  }

  res.json({ imported, errors });
});

router.post('/prontuario_motoristas', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  let rows;
  try {
    rows = parseBuffer(req.file);
  } catch (err) {
    return res.status(400).json({ error: 'Formato de arquivo invalido' });
  }

  const errors = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    const matricula = normalizeValue(row, ['matricula', 'MATRICULA', 'Matricula']);
    if (!matricula) {
      errors.push({ row: index + 1, error: 'Matricula e obrigatoria' });
      continue;
    }

    let colaborador;
    try {
      colaborador = await getDb('SELECT id FROM colaboradores WHERE matricula = ?', [matricula]);
    } catch (err) {
      errors.push({ row: index + 1, error: err.message });
      continue;
    }

    if (!colaborador) {
      errors.push({ row: index + 1, error: `Colaborador ${matricula} nao encontrado` });
      continue;
    }

    try {
      const prontuarioAnterior = await getDb(
        'SELECT * FROM prontuario_motoristas WHERE colaborador_id = ?',
        [colaborador.id]
      );
      const novaPontuacao = Number(normalizeValue(row, ['pontuacao_atual', 'Pontuacao']) || 0);
      const novaFaixa = normalizeValue(row, ['faixa_atual', 'Faixa']);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await runDb(
        `INSERT INTO prontuario_motoristas (colaborador_id, pontuacao_atual, faixa_atual, pontos_de_atencao, orientacoes, observacoes, data_atualizacao)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(colaborador_id) DO UPDATE SET
           pontuacao_atual = excluded.pontuacao_atual,
           faixa_atual = excluded.faixa_atual,
           pontos_de_atencao = excluded.pontos_de_atencao,
           orientacoes = excluded.orientacoes,
           observacoes = excluded.observacoes,
           data_atualizacao = excluded.data_atualizacao`,
        [
          colaborador.id,
          novaPontuacao,
          novaFaixa,
          normalizeValue(row, ['pontos_de_atencao', 'PontosDeAtencao']),
          normalizeValue(row, ['orientacoes', 'Orientacoes']),
          normalizeValue(row, ['observacoes', 'Observacoes']),
          normalizeValue(row, ['data_atualizacao', 'DataAtualizacao']) || now
        ]
      );

      const pontuacaoMudou = prontuarioAnterior && Number(prontuarioAnterior.pontuacao_atual) !== novaPontuacao;
      const faixaMudou = prontuarioAnterior && String(prontuarioAnterior.faixa_atual || '') !== String(novaFaixa || '');
      if (pontuacaoMudou || faixaMudou) {
        await runDb(
          `INSERT INTO historico_pontuacao (colaborador_id, pontuacao_anterior, pontuacao_nova, faixa_anterior, faixa_nova, motivo, responsavel, data_alteracao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            colaborador.id,
            prontuarioAnterior.pontuacao_atual,
            novaPontuacao,
            prontuarioAnterior.faixa_atual,
            novaFaixa,
            'Importacao de prontuario',
            req.user.nome_completo,
            now
          ]
        );
      }

      imported += 1;
    } catch (err) {
      errors.push({ row: index + 1, error: err.message });
    }
  }

  res.json({ imported, errors });
});

router.post('/respostas_chatbot', authenticateToken, authorizeRoles('admin'), uploadSingleFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

  let rows;
  try {
    rows = parseBuffer(req.file);
  } catch (err) {
    return res.status(400).json({ error: 'Formato de arquivo invalido' });
  }

  const errors = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    const pergunta = normalizeValue(row, ['pergunta', 'Pergunta']);
    const resposta = normalizeValue(row, ['resposta', 'Resposta']);
    const categoria = normalizeValue(row, ['categoria', 'Categoria']) || 'geral';
    const ativoValue = normalizeValue(row, ['ativo', 'Ativo']);
    const ativo = ativoValue === '0' || ativoValue.toLowerCase() === 'nao' ? 0 : 1;

    if (!pergunta || !resposta) {
      errors.push({ row: index + 1, error: 'Pergunta e resposta sao obrigatorias' });
      continue;
    }

    try {
      await runDb(
        'INSERT INTO respostas_chatbot (categoria, pergunta, resposta, ativo) VALUES (?, ?, ?, ?)',
        [categoria, pergunta, resposta, ativo]
      );
      imported += 1;
    } catch (err) {
      errors.push({ row: index + 1, error: err.message });
    }
  }

  res.json({ imported, errors });
});

module.exports = router;
