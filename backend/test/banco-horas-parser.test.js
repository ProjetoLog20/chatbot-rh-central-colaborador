const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyDay,
  durationToMinutes,
  minutesToDuration,
  parseDetailedHtml,
  parseSummaryHtml,
  parseSummaryText
} = require('../src/services/bancoHorasParser');
const { matchIdentity, matchReport } = require('../src/services/bancoHorasMatcher');

test('converte durações do Kairos em minutos sem perder sinal', () => {
  assert.equal(durationToMinutes('11:56'), 716);
  assert.equal(durationToMinutes('-01:42'), -102);
  assert.equal(durationToMinutes('(51:23)'), -3083);
  assert.equal(minutesToDuration(-3083), '-51:23');
  assert.throws(() => durationToMinutes('01:99'), /Duração inválida/);
});

test('lê relatório resumido HTML e valida as fórmulas', () => {
  const html = `
    <html><body>
      <h3>Relatório Banco de Horas Resumido - Kairos</h3>
      <span>Período: 01/08/2026 até 12/08/2026</span>
      <table><tbody>
        <tr><th>Matrícula</th><th>Nome</th><th>Estrutura Organizacional</th><th>Saldo Anterior</th><th>Débito</th><th>Crédito</th><th>Saldo do período</th><th>Saldo atual</th></tr>
        <tr><td>90001</td><td>PESSOA EXEMPLO ALFA</td><td>Amazém CAC</td><td>-00:15</td><td>03:35</td><td>02:54</td><td>-00:41</td><td>-00:56</td></tr>
      </tbody></table>
    </body></html>`;
  const parsed = parseSummaryHtml(html);

  assert.equal(parsed.tipo_relatorio, 'resumido');
  assert.equal(parsed.periodo_inicio, '2026-08-01');
  assert.equal(parsed.periodo_fim, '2026-08-12');
  assert.equal(parsed.saldos.length, 1);
  assert.equal(parsed.saldos[0].saldo_atual_min, -56);
  assert.equal(parsed.saldos[0].validacao.periodo_ok, true);
  assert.equal(parsed.saldos[0].validacao.atual_ok, true);
});

test('reconstrói linhas do texto extraído de PDF sem confiar no rodapé', () => {
  const text = `
    Matrícula Nome Estrutura Organizacional Saldo Anterior Débito Crédito Saldo do período Saldo atual
    90001 PESSOA EXEMPLO ALFA Amazém CAC -00:15 03:35 02:54 -00:41 -00:56
    Estrutura Organizacional: Amazém CAC
    Período: Período: 01/08/2026 até 12/08/2026
    Total de registros: 1
    Relatório Banco de Horas Resumido`;
  const parsed = parseSummaryText(text);

  assert.equal(parsed.saldos.length, 1);
  assert.equal(parsed.saldos[0].nome_kairos, 'PESSOA EXEMPLO ALFA');
  assert.equal(parsed.saldos[0].estrutura_kairos, 'Amazém CAC');
});

test('relatório detalhado mantém dia sem batida como pendente', () => {
  const html = `
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3>
      <div class="infosCabecalho" data-bind="with: InfoFuncionario">
        <span data-bind="text: Nome">PESSOA EXEMPLO ALFA</span>
        <span data-bind="text: Matricula">90001</span>
        <span data-bind="text: Cargo">Operador de Empilhadeira</span>
        <span data-bind="text: Estrutura">Amazém CAC</span>
      </div>
      <table class="tbl_ponto"><tbody data-bind="foreach: Entradas">
        <tr><td>02/08/2026 dom</td><td>06:30 - 12:00 | 13:30 - 16:00</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tbody></table>
      <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>01:00</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>01:00</td></tr></table>
    </body></html>`;
  const parsed = parseDetailedHtml(html);

  assert.equal(parsed.saldos.length, 1);
  assert.equal(parsed.dias.length, 1);
  assert.equal(parsed.dias[0].classificacao, 'pendente');
  assert.deepEqual(parsed.dias[0].batidas, []);
});

test('toda ausência exige decisão administrativa, exceto cargo isento', () => {
  assert.equal(classifyDay({ punches: ['07:10'], justification: '', cargo: 'Ajudante' }), 'incompleta');
  assert.equal(classifyDay({ punches: [], justification: 'Folga compensatória', cargo: 'Ajudante' }), 'pendente');
  assert.equal(classifyDay({ punches: [], justification: 'Falta', cargo: 'Ajudante' }), 'pendente');
  assert.equal(classifyDay({ punches: [], justification: '', cargo: 'Supervisor de Operações' }), 'nao_aplicavel');
});

test('cruzamento automático usa nome oficial exato e deixa aproximação para revisão', () => {
  const collaborators = [
    { id: 1, matricula: '90001', nome_completo: 'PESSOA EXEMPLO ALFA', cargo: 'Operador de Empilhadeira' },
    { id: 2, matricula: '90002', nome_completo: 'PESSOA EXEMPLO BETA', cargo: 'Manobrista' }
  ];
  const exact = matchIdentity({ nome_kairos: 'Pessoa Exemplo Alfa', matricula_kairos: '777' }, collaborators, []);
  const approximate = matchIdentity({ nome_kairos: 'Pessoa Exemplo Bet', matricula_kairos: '888' }, collaborators, []);

  assert.equal(exact.status_vinculo, 'vinculado');
  assert.equal(exact.metodo_vinculo, 'nome_exato');
  assert.equal(approximate.status_vinculo, 'pendente');
  assert.equal(approximate.sugestoes[0].id, 2);
});

test('escopo mantém estruturas permitidas e colaboradores oficiais de Administrativo, Apoio Logístico ou Manobrista', () => {
  const collaborators = [
    { id: 1, matricula: '1', nome_completo: 'Pessoa Administrativa', cargo: 'Assistente', setor: 'ADMINISTRATIVO' },
    { id: 2, matricula: '2', nome_completo: 'Pessoa Apoio', cargo: 'Ajudante', setor: 'APOIO LOGÍSTICO' },
    { id: 3, matricula: '3', nome_completo: 'Pessoa Manobrista', cargo: 'Manobrista', setor: 'DISTRIBUIÇÃO' },
    { id: 4, matricula: '4', nome_completo: 'Pessoa Distribuição', cargo: 'Ajudante', setor: 'DISTRIBUIÇÃO' }
  ];
  const makeRow = (id, nome, estrutura) => ({
    linha_origem: id,
    matricula_kairos: `K${id}`,
    nome_kairos: nome,
    nome_kairos_normalizado: nome.toLowerCase(),
    estrutura_kairos: estrutura,
    saldo_anterior_min: 0,
    debito_min: 0,
    credito_min: 0,
    saldo_periodo_min: 0,
    saldo_atual_min: 0
  });
  const parsed = {
    tipo_relatorio: 'resumido',
    formato: 'xls',
    avisos: [],
    saldos: [
      makeRow(1, 'Pessoa Administrativa', 'Distribuição'),
      makeRow(2, 'Pessoa Apoio', 'Distribuição'),
      makeRow(3, 'Pessoa Manobrista', 'Distribuição'),
      makeRow(4, 'Pessoa Distribuição', 'Distribuição'),
      makeRow(5, 'Pessoa sem cadastro', 'Cascavel')
    ],
    dias: []
  };

  const result = matchReport(parsed, collaborators, []);
  assert.deepEqual(result.saldos.map((row) => row.nome_kairos), [
    'Pessoa Administrativa',
    'Pessoa Apoio',
    'Pessoa Manobrista',
    'Pessoa sem cadastro'
  ]);
  assert.match(result.avisos.at(-1), /1 linha.*desconsiderada/i);
});

test('alias persistente separa homônimos pela matrícula Kairos', () => {
  const collaborators = [
    { id: 1, matricula: 'G1', nome_completo: 'Maria da Silva', cargo: 'Assistente' },
    { id: 2, matricula: 'G2', nome_completo: 'Maria da Silva', cargo: 'Assistente' }
  ];
  const aliases = [
    { nome_kairos_normalizado: 'maria da silva', matricula_kairos: 'K1', colaborador_id: 1 },
    { nome_kairos_normalizado: 'maria da silva', matricula_kairos: 'K2', colaborador_id: 2 }
  ];

  const first = matchIdentity({ nome_kairos: 'Maria da Silva', matricula_kairos: 'K1' }, collaborators, aliases);
  const second = matchIdentity({ nome_kairos: 'Maria da Silva', matricula_kairos: 'K2' }, collaborators, aliases);
  assert.equal(first.colaborador_id, 1);
  assert.equal(second.colaborador_id, 2);
});
