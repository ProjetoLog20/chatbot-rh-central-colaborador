const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-banco-horas-testes-automatizados';
process.env.ACCESS_COUNTER_ENABLED = 'false';
process.env.YURI_AI_ENABLED = 'false';

const app = require('../src/index');
const db = require('../src/db');

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const createdUserIds = [];
const createdImportIds = [];

async function createUser(profile, name, registration, { cargo = 'Ajudante', setor = 'APOIO LOGÍSTICO' } = {}) {
  const result = await db.run(
    `INSERT INTO colaboradores (
      matricula, nome_completo, cargo, setor, senha_hash, perfil, status, primeiro_acesso, senha_temporaria
    ) VALUES (?, ?, ?, ?, 'hash-teste', ?, 'Ativo', 0, 0)`,
    [registration, name, cargo, setor, profile]
  );
  createdUserIds.push(result.lastID);
  return {
    id: result.lastID,
    token: jwt.sign({ id: result.lastID, matricula: registration, perfil: profile }, process.env.JWT_SECRET, { expiresIn: '5m' })
  };
}

test.after(async () => {
  for (const importId of createdImportIds) await db.run('DELETE FROM bh_importacoes WHERE id = ?', [importId]);
  for (const userId of createdUserIds.reverse()) await db.run('DELETE FROM colaboradores WHERE id = ?', [userId]);
  await db.close();
});

test('rotas do Banco de Horas são exclusivas de administrador', async () => {
  const collaborator = await createUser('colaborador', `Colaborador BH ${suffix}`, `bh-col-${suffix}`);
  await request(app).get('/api/banco-horas/admin/importacoes').expect(401);
  await request(app)
    .get('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${collaborator.token}`)
    .expect(403);
});

test('upload cria rascunho, exige conferência e impede arquivo publicado duplicado', async () => {
  const admin = await createUser('admin', `Admin BH ${suffix}`, `bh-admin-${suffix}`);
  await createUser('colaborador', `Pessoa Exata ${suffix}`, `bh-pessoa-${suffix}`);
  const report = Buffer.from(`
    <html><body><h3>Relatório Banco de Horas Resumido - Kairos</h3>
    <span>Período: 01/08/2026 até 12/08/2026</span><table><tbody>
    <tr><td>123</td><td>Pessoa Exata ${suffix}</td><td>Amazém CAC</td><td>01:00</td><td>00:10</td><td>00:40</td><td>00:30</td><td>01:30</td></tr>
    </tbody></table></body></html>`, 'utf8');

  const uploaded = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${admin.token}`)
    .attach('file', report, { filename: 'resumo-kairos.xls', contentType: 'application/vnd.ms-excel' })
    .expect(201);

  const detail = uploaded.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.importacao.status, 'rascunho');
  assert.equal(detail.bloqueios.vinculos_pendentes, 0);
  assert.equal(detail.pode_aprovar, true);

  const invalidDuration = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/saldos/${detail.saldos[0].id}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      saldo_anterior: 'hora inválida',
      debito: '00:10',
      credito: '00:40',
      justificativa: 'Conferência do valor informado'
    })
    .expect(400);
  assert.equal(invalidDuration.body.code, 'DURACAO_INVALIDA');

  const missingRevision = await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({})
    .expect(400);
  assert.equal(missingRevision.body.code, 'REVISAO_OBRIGATORIA');

  await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(200);

  const duplicate = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${admin.token}`)
    .attach('file', report, { filename: 'resumo-kairos.xls', contentType: 'application/vnd.ms-excel' })
    .expect(409);
  assert.equal(duplicate.body.code, 'ARQUIVO_DUPLICADO');
});

test('dia sem batida precisa ser classificado manualmente antes da aprovação', async () => {
  const adminRow = await db.get(`SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?`, [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const detailed = Buffer.from(`
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3>
    <div class="infosCabecalho" data-bind="with: InfoFuncionario">
      <span data-bind="text: Nome">Pessoa Exata ${suffix}</span><span data-bind="text: Matricula">999</span>
      <span data-bind="text: Cargo">Ajudante Armazém</span><span data-bind="text: Estrutura">Amazém CAC</span>
    </div>
    <table class="tbl_ponto"><tbody data-bind="foreach: Entradas"><tr>
      <td>02/08/2026 dom</td><td>06:30 - 12:00</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr></tbody></table>
    <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>01:30</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>01:30</td></tr></table>
    </body></html>`, 'utf8');

  const uploaded = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', detailed, { filename: 'ponto-detalhado.xls', contentType: 'application/vnd.ms-excel' })
    .expect(201);
  let detail = uploaded.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.bloqueios.dias_pendentes, 1);

  const blocked = await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(409);
  assert.equal(blocked.body.code, 'IMPORTACAO_COM_PENDENCIAS');

  const classified = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/dias/${detail.dias[0].id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classificacao: 'folga', justificativa: 'Folga confirmada pelo responsável' })
    .expect(200);
  detail = classified.body.conferencia;
  assert.equal(detail.dias[0].classificacao, 'folga');
  assert.equal(detail.pode_aprovar, true);

  await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(200);

  const calendar = await request(app)
    .get(`/api/banco-horas/admin/colaboradores/${detail.dias[0].colaborador_id}?mes=2026-08`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(calendar.body.dias[0].classificacao, 'folga');
});

test('marcação incompleta só é liberada após corrigir pares de batidas e recalcular horas', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const report = Buffer.from(`
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3>
    <div class="infosCabecalho" data-bind="with: InfoFuncionario">
      <span data-bind="text: Nome">Pessoa Exata ${suffix}</span><span data-bind="text: Matricula">998</span>
      <span data-bind="text: Cargo">Ajudante Armazém</span><span data-bind="text: Estrutura">Amazém CAC</span>
    </div>
    <table class="tbl_ponto"><tbody data-bind="foreach: Entradas"><tr>
      <td>03/08/2026 seg</td><td>06:30 - 12:00 | 13:00 - 15:05</td><td>06:43</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr></tbody></table>
    <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>00:00</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>00:00</td></tr></table>
    </body></html>`, 'utf8');
  const uploaded = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', report, { filename: 'ponto-incompleto.xls', contentType: 'application/vnd.ms-excel' })
    .expect(201);
  let detail = uploaded.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.bloqueios.marcacoes_incompletas, 1);

  const rejected = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/dias/${detail.dias[0].id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classificacao: 'trabalhado', justificativa: 'Conferido com o espelho do Kairos' })
    .expect(400);
  assert.equal(rejected.body.code, 'BATIDAS_CORRIGIDAS_INVALIDAS');

  const corrected = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/dias/${detail.dias[0].id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classificacao: 'trabalhado',
      batidas: ['06:43', '12:00', '13:00', '15:05'],
      justificativa: 'Conferido com o espelho do Kairos'
    })
    .expect(200);
  detail = corrected.body.conferencia;
  assert.deepEqual(detail.dias[0].batidas, ['06:43', '12:00', '13:00', '15:05']);
  assert.equal(detail.dias[0].horas_trabalhadas, '07:22');
  assert.equal(detail.bloqueios.marcacoes_incompletas, 0);
  assert.ok(detail.auditoria.some((item) => item.campo === 'batidas'));
  assert.ok(detail.auditoria.some((item) => item.campo === 'horas_trabalhadas'));

  const recorrected = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/dias/${detail.dias[0].id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classificacao: 'trabalhado',
      batidas: ['07:00', '12:00', '13:00', '15:00'],
      justificativa: 'Nova correção identificada na conferência'
    })
    .expect(200);
  detail = recorrected.body.conferencia;
  assert.equal(detail.dias[0].horas_trabalhadas, '07:00');
});

test('escopo exclui Distribuição comum e mantém Manobrista de Distribuição', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  await createUser('colaborador', `Distribuição Comum ${suffix}`, `bh-dist-${suffix}`, { cargo: 'Ajudante', setor: 'DISTRIBUIÇÃO' });
  await createUser('colaborador', `Ronaldo Manobrista ${suffix}`, `bh-man-${suffix}`, { cargo: 'Manobrista', setor: 'DISTRIBUIÇÃO' });
  const summary = (registration, name) => Buffer.from(`
    <html><body><h3>Relatório Banco de Horas Resumido - Kairos</h3>
    <span>Período: 01/08/2026 até 12/08/2026</span><table><tbody>
    <tr><td>${registration}</td><td>${name}</td><td>Distribuição</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td></tr>
    </tbody></table></body></html>`, 'utf8');

  const outside = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', summary('701', `Distribuição Comum ${suffix}`), { filename: 'fora-escopo.xls' })
    .expect(400);
  assert.equal(outside.body.code, 'RELATORIO_FORA_ESCOPO');

  const manobrista = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', summary('702', `Ronaldo Manobrista ${suffix}`), { filename: 'manobrista.xls' })
    .expect(201);
  createdImportIds.push(manobrista.body.conferencia.importacao.id);
  assert.equal(manobrista.body.conferencia.saldos.length, 1);
  assert.equal(manobrista.body.conferencia.saldos[0].nome_kairos, `Ronaldo Manobrista ${suffix}`);
});

test('aprovação bloqueia saldos e datas duplicados para o mesmo colaborador', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const duplicateBalances = Buffer.from(`
    <html><body><h3>Relatório Banco de Horas Resumido - Kairos</h3>
    <span>Período: 01/08/2026 até 12/08/2026</span><table><tbody>
    <tr><td>801</td><td>Pessoa Exata ${suffix}</td><td>Amazém CAC</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td></tr>
    <tr><td>802</td><td>Pessoa Exata ${suffix}</td><td>Amazém CAC</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td></tr>
    </tbody></table></body></html>`, 'utf8');
  const balanceUpload = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', duplicateBalances, { filename: 'saldos-duplicados.xls' })
    .expect(201);
  let detail = balanceUpload.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.bloqueios.saldos_duplicados, 1);
  await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(409);

  await createUser('colaborador', `Supervisor Duplicado ${suffix}`, `bh-sup-${suffix}`, { cargo: 'Supervisor', setor: 'APOIO LOGÍSTICO' });
  const duplicateDays = Buffer.from(`
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3>
    <div class="infosCabecalho" data-bind="with: InfoFuncionario">
      <span data-bind="text: Nome">Supervisor Duplicado ${suffix}</span><span data-bind="text: Matricula">803</span>
      <span data-bind="text: Cargo">Supervisor</span><span data-bind="text: Estrutura">Amazém CAC</span>
    </div>
    <table class="tbl_ponto"><tbody data-bind="foreach: Entradas">
      <tr><td>05/08/2026 qua</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>05/08/2026 qua</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>
    <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>00:00</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>00:00</td></tr></table>
    </body></html>`, 'utf8');
  const dayUpload = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', duplicateDays, { filename: 'dias-duplicados.xls' })
    .expect(201);
  detail = dayUpload.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.bloqueios.dias_duplicados, 1);
  await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(409);
});

test('relink de cargo isento para não isento restaura a classificação original', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const exempt = await createUser('colaborador', `Alvo Supervisor ${suffix}`, `bh-alvo-sup-${suffix}`, { cargo: 'Supervisor', setor: 'APOIO LOGÍSTICO' });
  const nonExempt = await createUser('colaborador', `Alvo Ajudante ${suffix}`, `bh-alvo-aj-${suffix}`, { cargo: 'Ajudante', setor: 'APOIO LOGÍSTICO' });
  const report = Buffer.from(`
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3>
    <div class="infosCabecalho" data-bind="with: InfoFuncionario">
      <span data-bind="text: Nome">Identidade sem correspondência ${suffix}</span><span data-bind="text: Matricula">901</span>
      <span data-bind="text: Cargo">Ajudante</span><span data-bind="text: Estrutura">Amazém CAC</span>
    </div>
    <table class="tbl_ponto"><tbody data-bind="foreach: Entradas"><tr>
      <td>06/08/2026 qui</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr></tbody></table>
    <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>00:00</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>00:00</td></tr></table>
    </body></html>`, 'utf8');
  const upload = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', report, { filename: 'relink-isento.xls' })
    .expect(201);
  let detail = upload.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  const identity = detail.dias[0];

  const linkedExempt = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/vinculo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nome_kairos_normalizado: identity.nome_kairos_normalizado,
      matricula_kairos: identity.matricula_kairos,
      colaborador_id: exempt.id,
      justificativa: 'Vínculo temporário para conferência'
    })
    .expect(200);
  detail = linkedExempt.body.conferencia;
  assert.equal(detail.dias[0].classificacao, 'nao_aplicavel');

  const linkedNonExempt = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/vinculo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nome_kairos_normalizado: identity.nome_kairos_normalizado,
      matricula_kairos: identity.matricula_kairos,
      colaborador_id: nonExempt.id,
      justificativa: 'Correção para o colaborador não isento'
    })
    .expect(200);
  detail = linkedNonExempt.body.conferencia;
  assert.equal(detail.dias[0].classificacao_original, 'pendente');
  assert.equal(detail.dias[0].classificacao, 'pendente');
  assert.equal(detail.bloqueios.dias_pendentes, 1);
});

test('vínculo manual persiste homônimos separadamente pela matrícula Kairos', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const firstTarget = await createUser('colaborador', `Alvo Homônimo Um ${suffix}`, `bh-hom-1-${suffix}`);
  const secondTarget = await createUser('colaborador', `Alvo Homônimo Dois ${suffix}`, `bh-hom-2-${suffix}`);
  const report = Buffer.from(`
    <html><body><h3>Relatório Banco de Horas Resumido - Kairos</h3>
    <span>Período: 01/08/2026 até 12/08/2026</span><table><tbody>
    <tr><td>1001</td><td>Homônimo Kairos ${suffix}</td><td>Amazém CAC</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td></tr>
    <tr><td>1002</td><td>Homônimo Kairos ${suffix}</td><td>Amazém CAC</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td><td>00:00</td></tr>
    </tbody></table></body></html>`, 'utf8');
  const upload = await request(app)
    .post('/api/banco-horas/admin/importacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .attach('file', report, { filename: 'homonimos.xls' })
    .expect(201);
  let detail = upload.body.conferencia;
  createdImportIds.push(detail.importacao.id);
  assert.equal(detail.bloqueios.vinculos_pendentes, 2);

  const ambiguous = await request(app)
    .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/vinculo`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nome_kairos_normalizado: detail.saldos[0].nome_kairos_normalizado,
      colaborador_id: firstTarget.id,
      justificativa: 'Tentativa sem matrícula Kairos'
    })
    .expect(400);
  assert.equal(ambiguous.body.code, 'MATRICULA_KAIROS_OBRIGATORIA');

  for (const [registration, target] of [['1001', firstTarget], ['1002', secondTarget]]) {
    const linked = await request(app)
      .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/vinculo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome_kairos_normalizado: detail.saldos[0].nome_kairos_normalizado,
        matricula_kairos: registration,
        colaborador_id: target.id,
        justificativa: `Vínculo confirmado para matrícula ${registration}`
      })
      .expect(200);
    detail = linked.body.conferencia;
  }
  assert.equal(detail.bloqueios.vinculos_pendentes, 0);
  assert.equal(detail.bloqueios.saldos_duplicados, 0);
  await request(app)
    .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ revisao: detail.importacao.revisao })
    .expect(200);

  const aliases = await db.all(
    `SELECT matricula_kairos, colaborador_id FROM bh_vinculos_nome
     WHERE nome_kairos_normalizado = ? ORDER BY matricula_kairos`,
    [detail.saldos[0].nome_kairos_normalizado]
  );
  assert.deepEqual(aliases.map((row) => [row.matricula_kairos, row.colaborador_id]), [
    ['1001', firstTarget.id],
    ['1002', secondTarget.id]
  ]);
});

test('resumo de folga e falta usa somente a publicação mais recente de cada data', async () => {
  const adminRow = await db.get('SELECT id, matricula, perfil FROM colaboradores WHERE matricula = ?', [`bh-admin-${suffix}`]);
  const adminToken = jwt.sign(adminRow, process.env.JWT_SECRET, { expiresIn: '5m' });
  const collaborator = await createUser('colaborador', `Pessoa Sobreposta ${suffix}`, `bh-sobreposta-${suffix}`);
  const detailedReport = (version) => Buffer.from(`
    <html><body><h3>Relatório de Ponto do Funcionário - Kairos</h3><!-- versão ${version} -->
    <div class="infosCabecalho" data-bind="with: InfoFuncionario">
      <span data-bind="text: Nome">Pessoa Sobreposta ${suffix}</span><span data-bind="text: Matricula">1101</span>
      <span data-bind="text: Cargo">Ajudante</span><span data-bind="text: Estrutura">Amazém CAC</span>
    </div>
    <table class="tbl_ponto"><tbody data-bind="foreach: Entradas"><tr>
      <td>07/08/2026 sex</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr></tbody></table>
    <table><tr data-bind="with: BancoHorasSaldo"><td>Saldo Anterior:</td><td>00:00</td><td>Saldo Período:</td><td>00:00</td><td>Saldo Atual:</td><td>00:00</td></tr></table>
    </body></html>`, 'utf8');

  for (const [version, classification] of [[1, 'folga'], [2, 'falta']]) {
    const upload = await request(app)
      .post('/api/banco-horas/admin/importacoes')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', detailedReport(version), { filename: `sobreposto-${version}.xls` })
      .expect(201);
    let detail = upload.body.conferencia;
    createdImportIds.push(detail.importacao.id);
    const classified = await request(app)
      .patch(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/dias/${detail.dias[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classificacao: classification, justificativa: `Classificação confirmada versão ${version}` })
      .expect(200);
    detail = classified.body.conferencia;
    await request(app)
      .post(`/api/banco-horas/admin/importacoes/${detail.importacao.id}/aprovar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ revisao: detail.importacao.revisao })
      .expect(200);
  }

  const list = await request(app)
    .get('/api/banco-horas/admin/colaboradores')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const item = list.body.colaboradores.find((row) => row.id === collaborator.id);
  assert.equal(item.calendario_resumo.falta, 1);
  assert.equal(item.calendario_resumo.folga || 0, 0);

  const calendar = await request(app)
    .get(`/api/banco-horas/admin/colaboradores/${collaborator.id}?mes=2026-08`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(calendar.body.dias.length, 1);
  assert.equal(calendar.body.dias[0].classificacao, 'falta');
});
