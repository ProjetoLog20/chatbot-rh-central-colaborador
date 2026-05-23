require('./config/env');

const bcrypt = require('bcrypt');
const db = require('./db');
const dayjs = require('dayjs');

const senhaAdmin = bcrypt.hashSync('admin123', 10);
const senhaMotorista = bcrypt.hashSync('motorista123', 10);
const senhaColaborador = bcrypt.hashSync('colaborador123', 10);

const colaboradores = [
  { matricula: '1000', nome_completo: 'Administrador RH', cpf: '11111111111', telefone_whatsapp: '11999990000', email: 'admin@empresa.com', cargo: 'Admin RH', setor: 'Recursos Humanos', unidade: 'Sede', tipo_colaborador: 'Interno', status: 'Ativo', data_admissao: '2020-01-10', senha_hash: senhaAdmin, perfil: 'admin' },
  { matricula: '2000', nome_completo: 'João Motorista', cpf: '22222222222', telefone_whatsapp: '11988880000', email: 'joao.motorista@empresa.com', cargo: 'Motorista', setor: 'Logística', unidade: 'Filial A', tipo_colaborador: 'Externo', status: 'Ativo', data_admissao: '2019-05-20', senha_hash: senhaMotorista, perfil: 'motorista' },
  { matricula: '3000', nome_completo: 'Maria Colaboradora', cpf: '33333333333', telefone_whatsapp: '11977770000', email: 'maria.colab@empresa.com', cargo: 'Analista', setor: 'Financeiro', unidade: 'Sede', tipo_colaborador: 'Interno', status: 'Ativo', data_admissao: '2021-07-15', senha_hash: senhaColaborador, perfil: 'colaborador' }
];

const prontuarios = [
  { colaborador_matricula: '2000', pontuacao_atual: 82, faixa_atual: 'Verde', pontos_de_atencao: 'Use cinto de segurança, respeite velocidades', orientacoes: 'Revisar checklist diário', observacoes: 'Boa atenção nos retornos', data_atualizacao: dayjs().format('YYYY-MM-DD HH:mm:ss') }
];

const respostas = [
  { categoria: 'Clima', pergunta: 'como está o clima', resposta: 'O clima segue estável; confira detalhes com o setor de segurança.', ativo: 1 },
  { categoria: 'SKAP', pergunta: 'o que é skap', resposta: 'SKAP é a pesquisa de conhecimento e atitude em processos de segurança.', ativo: 1 },
  { categoria: 'Segurança', pergunta: 'campeão de segurança', resposta: 'O campeão de segurança é o colaborador que promove as melhores ações preventivas.', ativo: 1 },
  { categoria: 'Produtividade', pergunta: 'prêmio de produtividade', resposta: 'O prêmio reconhece os colaboradores com maior eficiência e qualidade no trabalho.', ativo: 1 },
  { categoria: 'Ouvidoria', pergunta: 'ouvidoria', resposta: 'A ouvidoria está disponível em https://www.log20.com.br/ouvidorias', ativo: 1 }
];

const atendimentos = [
  { colaborador_matricula: '3000', telefone: '11977770000', mensagem: 'Preciso de suporte no RH', resposta: 'Aguardando contato do RH', categoria: 'Geral', status: 'Pendente', data_hora: dayjs().format('YYYY-MM-DD HH:mm:ss') }
];

const pesquisasClima = [
  { titulo: 'Pesquisa de Clima 2025', descricao: 'Avaliação de satisfação e ambiente de trabalho', status: 'rascunho', anonima: false, criado_por_matricula: '1000' }
];

const perguntasClima = [
  { pesquisa_ordem: 0, pergunta: 'Como você avalia o seu ambiente de trabalho?', tipo: 'nota', ordem: 1, obrigatoria: true },
  { pesquisa_ordem: 0, pergunta: 'Você se sente valorizado pelo seu gestor?', tipo: 'sim_nao', ordem: 2, obrigatoria: true },
  { pesquisa_ordem: 0, pergunta: 'Qual é sua principal sugestão de melhoria?', tipo: 'texto', ordem: 3, obrigatoria: false },
  { pesquisa_ordem: 0, pergunta: 'Como você avalia a comunicação interna?', tipo: 'nota', ordem: 4, obrigatoria: true }
];

async function loadSeed() {
  await db.run('DELETE FROM respostas_clima');
  await db.run('DELETE FROM perguntas_clima');
  await db.run('DELETE FROM pesquisas_clima');
  await db.run('DELETE FROM atendimentos');
  await db.run('DELETE FROM respostas_chatbot');
  await db.run('DELETE FROM prontuario_motoristas');
  await db.run('DELETE FROM historico_pontuacao');
  await db.run('DELETE FROM colaboradores');

  for (const col of colaboradores) {
    await db.run(
      `INSERT INTO colaboradores (matricula, nome_completo, cpf, telefone_whatsapp, email, cargo, setor, unidade, tipo_colaborador, status, data_admissao, senha_hash, perfil)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        col.matricula,
        col.nome_completo,
        col.cpf,
        col.telefone_whatsapp,
        col.email,
        col.cargo,
        col.setor,
        col.unidade,
        col.tipo_colaborador,
        col.status,
        col.data_admissao,
        col.senha_hash,
        col.perfil
      ]
    );
  }

  for (const item of prontuarios) {
    await db.run(
      `INSERT INTO prontuario_motoristas (colaborador_id, pontuacao_atual, faixa_atual, pontos_de_atencao, orientacoes, observacoes, data_atualizacao)
       VALUES ((SELECT id FROM colaboradores WHERE matricula = ?), ?, ?, ?, ?, ?, ?)`,
      [item.colaborador_matricula, item.pontuacao_atual, item.faixa_atual, item.pontos_de_atencao, item.orientacoes, item.observacoes, item.data_atualizacao]
    );
  }

  for (const item of respostas) {
    await db.run('INSERT INTO respostas_chatbot (categoria, pergunta, resposta, ativo) VALUES (?, ?, ?, ?)', [item.categoria, item.pergunta, item.resposta, item.ativo]);
  }

  for (const item of atendimentos) {
    await db.run(
      `INSERT INTO atendimentos (colaborador_id, telefone, mensagem, resposta, categoria, status, data_hora)
       VALUES ((SELECT id FROM colaboradores WHERE matricula = ?), ?, ?, ?, ?, ?, ?)`,
      [item.colaborador_matricula, item.telefone, item.mensagem, item.resposta, item.categoria, item.status, item.data_hora]
    );
  }

  for (const pesquisa of pesquisasClima) {
    await db.run(
      `INSERT INTO pesquisas_clima (titulo, descricao, status, anonima, criado_por) VALUES (?, ?, ?, ?, (SELECT id FROM colaboradores WHERE matricula = ?))`,
      [pesquisa.titulo, pesquisa.descricao, pesquisa.status, pesquisa.anonima, pesquisa.criado_por_matricula]
    );
  }

  const pesquisaResult = await db.get('SELECT id FROM pesquisas_clima LIMIT 1', []);
  if (pesquisaResult?.id) {
    for (const pergunta of perguntasClima) {
      await db.run(
        `INSERT INTO perguntas_clima (pesquisa_id, pergunta, tipo, ordem, obrigatoria, ativa) VALUES (?, ?, ?, ?, ?, true)`,
        [pesquisaResult.id, pergunta.pergunta, pergunta.tipo, pergunta.ordem, pergunta.obrigatoria]
      );
    }
  }

  console.log('Dados fake carregados com sucesso.');
}

loadSeed().catch((err) => {
  console.error('Erro ao semear banco:', err);
  process.exit(1);
});
