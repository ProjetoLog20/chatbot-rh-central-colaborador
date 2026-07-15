const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-exclusivo-para-testes-automatizados';
process.env.ACCESS_COUNTER_ENABLED = 'false';

const app = require('../src/index');
const db = require('../src/db');

test.after(async () => {
  await db.close();
});

test('health check valida aplicacao e banco sem expor detalhes', async () => {
  const response = await request(app).get('/api/health').expect(200);

  assert.deepEqual(response.body, { status: 'ok', database: 'ok' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
});

test('cabecalhos de seguranca e CSP sao enviados pela API', async () => {
  const response = await request(app).get('/api/health').expect(200);

  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
});

test('request id valido e preservado para rastreabilidade', async () => {
  const response = await request(app)
    .get('/api/health')
    .set('X-Request-Id', 'teste-seguranca-123')
    .expect(200);

  assert.equal(response.headers['x-request-id'], 'teste-seguranca-123');
});

test('login bloqueia forca bruta sem alterar resposta das tentativas normais', async () => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ matricula: `inexistente-${attempt}`, senha: 'senha-invalida' })
      .expect(401);

    assert.equal(response.body.error, 'Matricula ou senha invalidos');
  }

  const blocked = await request(app)
    .post('/api/auth/login')
    .send({ matricula: 'inexistente-bloqueada', senha: 'senha-invalida' })
    .expect(429);

  assert.match(blocked.body.error, /Muitas tentativas/);
  assert.ok(blocked.headers['retry-after']);
});

test('payload JSON acima de 1 MB e recusado com resposta controlada', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ matricula: 'teste', senha: 'x'.repeat(1024 * 1024 + 1) })
    .expect(413);

  assert.equal(response.body.error, 'Conteudo enviado acima do limite permitido');
  assert.ok(response.body.request_id);
});

test('importacao administrativa rejeita extensao inesperada antes do processamento', async () => {
  const token = jwt.sign(
    { id: 1, matricula: 'admin-teste', perfil: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  const response = await request(app)
    .post('/api/skap/importar')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('conteudo-invalido'), 'arquivo.txt')
    .expect(400);

  assert.equal(response.body.error, 'Apenas arquivos .xlsx sao permitidos');
});

test('importacao administrativa continua proibida para colaborador comum', async () => {
  const token = jwt.sign(
    { id: 2, matricula: 'colaborador-teste', perfil: 'colaborador' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  await request(app)
    .post('/api/skap/importar')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('conteudo-invalido'), 'arquivo.xlsx')
    .expect(403);
});

test('notificacao percorre publicacao, entrega, leitura e metrica sem vazar entre perfis', async () => {
  const suffix = Date.now();
  const adminMatricula = `admin-notif-${suffix}`;
  const colaboradorMatricula = `colab-notif-${suffix}`;

  await db.run(
    `INSERT INTO colaboradores (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, ?, ?, 'admin', 'Ativo', 0, 0)`,
    [adminMatricula, 'Admin Notificacoes', 'hash-nao-utilizado']
  );
  await db.run(
    `INSERT INTO colaboradores (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, ?, ?, 'colaborador', 'Ativo', 0, 0)`,
    [colaboradorMatricula, 'Colaborador Notificacoes', 'hash-nao-utilizado']
  );

  const admin = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [adminMatricula]);
  const colaborador = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [colaboradorMatricula]);
  const adminToken = jwt.sign({ id: admin.id, matricula: adminMatricula, perfil: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const colaboradorToken = jwt.sign({ id: colaborador.id, matricula: colaboradorMatricula, perfil: 'colaborador' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const created = await request(app)
    .post('/api/notificacoes/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      titulo: 'Atualizacao de teste do Yuri',
      mensagem: 'Mensagem exibida apenas durante o teste automatizado.',
      categoria: 'novidade',
      prioridade: 'importante',
      status: 'publicado',
      para_todos: false,
      para_colaborador: true,
      link_url: '/produtividade',
      link_texto: 'Ver detalhes'
    })
    .expect(201);

  const notificationId = created.body.id;
  assert.ok(notificationId);

  const inbox = await request(app)
    .get('/api/notificacoes')
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .expect(200);
  assert.equal(inbox.body.nao_lidas, 1);
  assert.equal(inbox.body.notificacoes[0].id, notificationId);

  await request(app)
    .post(`/api/notificacoes/${notificationId}/ler`)
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .expect(200);

  const readInbox = await request(app)
    .get('/api/notificacoes')
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .expect(200);
  assert.equal(readInbox.body.nao_lidas, 0);

  const adminInbox = await request(app)
    .get('/api/notificacoes')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(adminInbox.body.notificacoes.some((item) => item.id === notificationId), false);

  const metrics = await request(app)
    .get('/api/notificacoes/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const metric = metrics.body.find((item) => item.id === notificationId);
  assert.equal(Number(metric.total_leituras), 1);

  await request(app)
    .delete(`/api/notificacoes/admin/${notificationId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await db.run('DELETE FROM colaboradores WHERE id IN (?, ?)', [admin.id, colaborador.id]);
});
