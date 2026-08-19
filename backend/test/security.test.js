const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const webpush = require('web-push');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-exclusivo-para-testes-automatizados';
process.env.ACCESS_COUNTER_ENABLED = 'false';
process.env.YURI_AI_ENABLED = 'false';
const testVapidKeys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = testVapidKeys.publicKey;
process.env.VAPID_PRIVATE_KEY = testVapidKeys.privateKey;
process.env.VAPID_SUBJECT = 'https://www.log20.com.br';

const app = require('../src/index');
const db = require('../src/db');
const { clearGeoCache } = require('../src/geoRestriction');

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
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('CORS permite portas locais apenas fora de producao e rejeita origens externas', async () => {
  const local = await request(app)
    .get('/api/health')
    .set('Origin', 'http://127.0.0.1:4100')
    .expect(200);
  assert.equal(local.headers['access-control-allow-origin'], 'http://127.0.0.1:4100');

  const blocked = await request(app)
    .get('/api/health')
    .set('Origin', 'https://origem-nao-autorizada.example')
    .expect(403);
  assert.equal(blocked.body.error, 'Origem nao autorizada');
  assert.ok(blocked.body.request_id);
});

test('Yuri exige autenticacao antes de processar mensagens', async () => {
  await request(app)
    .post('/api/yuri/chat')
    .send({ message: 'Ola, Yuri' })
    .expect(401);
});

test('rotacao de JWT aceita temporariamente o segredo anterior sem aceitar outro algoritmo', async () => {
  process.env.JWT_SECRET_PREVIOUS = 'segredo-anterior-para-rotacao-controlada';
  try {
    const previousToken = jwt.sign(
      { id: 7654321, matricula: 'rotacao-jwt', perfil: 'colaborador' },
      process.env.JWT_SECRET_PREVIOUS,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    await request(app)
      .post('/api/yuri/chat')
      .set('Authorization', `Bearer ${previousToken}`)
      .send({ message: 'Teste de rotacao' })
      .expect(200);

    const unexpectedAlgorithm = jwt.sign(
      { id: 7654321, matricula: 'rotacao-jwt', perfil: 'colaborador' },
      process.env.JWT_SECRET_PREVIOUS,
      { expiresIn: '5m', algorithm: 'HS384' }
    );
    await request(app)
      .post('/api/yuri/chat')
      .set('Authorization', `Bearer ${unexpectedAlgorithm}`)
      .send({ message: 'Algoritmo inesperado' })
      .expect(401);
  } finally {
    delete process.env.JWT_SECRET_PREVIOUS;
  }
});

test('restricao geografica permite Parana e bloqueia outros estados', async () => {
  const originalFetch = global.fetch;
  const token = jwt.sign(
    { id: 987654, matricula: 'geo-teste', perfil: 'colaborador' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  process.env.GEO_RESTRICTION_ENABLED = 'true';
  process.env.GEO_ALLOW_PRIVATE_IPS = 'false';
  process.env.GEO_FAIL_CLOSED = 'true';
  process.env.IPINFO_TOKEN = 'token-apenas-para-teste';

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ geo: { country_code: 'BR', region_code: 'PR' } })
    });
    clearGeoCache();
    await request(app)
      .post('/api/yuri/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Teste no Parana' })
      .expect(200);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ geo: { country_code: 'BR', region_code: 'SC' } })
    });
    clearGeoCache();
    const blocked = await request(app)
      .post('/api/yuri/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Teste fora do Parana' })
      .expect(403);
    assert.equal(blocked.body.code, 'GEO_BLOCKED');

    await request(app).get('/api/health').expect(200);
  } finally {
    global.fetch = originalFetch;
    clearGeoCache();
    delete process.env.GEO_RESTRICTION_ENABLED;
    delete process.env.GEO_ALLOW_PRIVATE_IPS;
    delete process.env.GEO_FAIL_CLOSED;
    delete process.env.IPINFO_TOKEN;
  }
});

test('restricao geografica falha fechada quando a localizacao fica indisponivel', async () => {
  const originalFetch = global.fetch;
  process.env.GEO_RESTRICTION_ENABLED = 'true';
  process.env.GEO_ALLOW_PRIVATE_IPS = 'false';
  process.env.GEO_FAIL_CLOSED = 'true';
  process.env.IPINFO_TOKEN = 'token-apenas-para-teste';

  try {
    global.fetch = async () => { throw new Error('Falha simulada'); };
    clearGeoCache();
    const response = await request(app)
      .post('/api/yuri/chat')
      .send({ message: 'Teste de indisponibilidade' })
      .expect(503);
    assert.equal(response.body.code, 'GEO_UNAVAILABLE');
  } finally {
    global.fetch = originalFetch;
    clearGeoCache();
    delete process.env.GEO_RESTRICTION_ENABLED;
    delete process.env.GEO_ALLOW_PRIVATE_IPS;
    delete process.env.GEO_FAIL_CLOSED;
    delete process.env.IPINFO_TOKEN;
  }
});

test('Yuri limita abuso por conta autenticada', async () => {
  const suffix = Date.now();
  const matricula = `yuri-rate-${suffix}`;
  await db.run(
    `INSERT INTO colaboradores
     (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, 'Usuario Limite Yuri', 'hash', 'colaborador', 'Ativo', 0, 0)`,
    [matricula]
  );
  const usuario = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [matricula]);
  const token = jwt.sign(
    { id: usuario.id, matricula, perfil: 'colaborador' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  try {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const response = await request(app)
        .post('/api/yuri/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: `Pergunta de seguranca ${attempt}` })
        .expect(200);
      assert.equal(response.body.source, 'ia_desativada');
      assert.equal(response.headers['cache-control'], 'no-store');
    }

    const blocked = await request(app)
      .post('/api/yuri/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Tentativa excedente' })
      .expect(429);

    assert.match(blocked.body.error, /Muitas tentativas/);
    assert.ok(blocked.headers['retry-after']);
  } finally {
    await db.run('DELETE FROM colaboradores WHERE id = ?', [usuario.id]);
  }
});

test('request id valido e preservado para rastreabilidade', async () => {
  const response = await request(app)
    .get('/api/health')
    .set('X-Request-Id', 'teste-seguranca-123')
    .expect(200);

  assert.equal(response.headers['x-request-id'], 'teste-seguranca-123');
});

test('painel administrativo usa o contador historico de acessos', async () => {
  const token = jwt.sign(
    { id: 1, matricula: 'admin-contador', perfil: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  const response = await request(app)
    .get('/api/admin/acessos')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(typeof response.body.total_acessos, 'number');
  assert.equal(typeof response.body.total_acessos_hoje, 'number');
  assert.ok(Array.isArray(response.body.history));
  assert.ok(Array.isArray(response.body.monthly_history));
  assert.ok(Array.isArray(response.body.hourly_history));
  assert.equal(response.body.total_logins, undefined);
});

test('login bloqueia forca bruta sem alterar resposta das tentativas normais', async () => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ matricula: `inexistente-${attempt}`, senha: 'senha-invalida' })
      .expect(401);

    assert.equal(response.body.error, 'Matrícula ou senha inválidos');
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

test('colaborador nao consegue alterar cargo ou outros dados operacionais', async () => {
  const suffix = Date.now();
  const matricula = `self-service-${suffix}`;
  await db.run(
    `INSERT INTO colaboradores
     (matricula, nome_completo, email, cargo, setor, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, 'Usuario Self Service', 'original@teste.local', 'Motorista', 'Distribuicao', 'hash', 'colaborador', 'Ativo', 0, 0)`,
    [matricula]
  );
  const usuario = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [matricula]);
  const token = jwt.sign({ id: usuario.id, matricula, perfil: 'colaborador' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const blocked = await request(app)
    .put(`/api/colaboradores/${usuario.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ cargo: 'Administrador', setor: 'RH' })
    .expect(403);
  assert.match(blocked.body.error, /Somente nome preferido/);

  await request(app)
    .put(`/api/colaboradores/${usuario.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nome_preferido: 'Usuario', email: 'novo@teste.local' })
    .expect(200);

  const after = await db.get('SELECT nome_preferido, email, cargo, setor FROM colaboradores WHERE id = ?', [usuario.id]);
  assert.equal(after.nome_preferido, 'Usuario');
  assert.equal(after.email, 'novo@teste.local');
  assert.equal(after.cargo, 'Motorista');
  assert.equal(after.setor, 'Distribuicao');
  await db.run('DELETE FROM colaboradores WHERE id = ?', [usuario.id]);
});

test('administrador reseta senha e servidor confirma o novo primeiro acesso', async () => {
  const suffix = Date.now();
  const adminMatricula = `admin-reset-${suffix}`;
  const colaboradorMatricula = `colab-reset-${suffix}`;
  const oldPasswordHash = await bcrypt.hash('senha-antiga-segura', 4);

  await db.run(
    `INSERT INTO colaboradores
     (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria, data_ultima_troca_senha)
     VALUES (?, 'Admin Reset', 'hash', 'admin', 'Ativo', 0, 0, CURRENT_TIMESTAMP)`,
    [adminMatricula]
  );
  await db.run(
    `INSERT INTO colaboradores
     (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria, data_ultima_troca_senha)
     VALUES (?, 'Colaborador Reset', ?, 'colaborador', 'Ativo', 0, 0, CURRENT_TIMESTAMP)`,
    [colaboradorMatricula, oldPasswordHash]
  );

  const admin = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [adminMatricula]);
  const colaborador = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [colaboradorMatricula]);
  const adminToken = jwt.sign(
    { id: admin.id, matricula: adminMatricula, perfil: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  try {
    const response = await request(app)
      .put(`/api/colaboradores/${colaborador.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resetarSenha: true })
      .expect(200);

    assert.equal(response.body.reset_realizado, true);
    assert.match(response.body.senha_temporaria, /^[A-HJ-NP-Za-km-z2-9]{10,32}$/);
    assert.equal(Boolean(response.body.colaborador.primeiro_acesso), true);
    assert.equal(Boolean(response.body.colaborador.senha_temporaria), true);

    const after = await db.get(
      'SELECT senha_hash, primeiro_acesso, senha_temporaria, data_ultima_troca_senha FROM colaboradores WHERE id = ?',
      [colaborador.id]
    );
    assert.equal(await bcrypt.compare(response.body.senha_temporaria, after.senha_hash), true);
    assert.equal(await bcrypt.compare('senha-antiga-segura', after.senha_hash), false);
    assert.equal(Boolean(after.primeiro_acesso), true);
    assert.equal(Boolean(after.senha_temporaria), true);
    assert.equal(after.data_ultima_troca_senha, null);
  } finally {
    await db.run('DELETE FROM colaboradores WHERE id IN (?, ?)', [admin.id, colaborador.id]);
  }
});

test('falha no Push nao marca notificacao como enviada e permite nova tentativa', async () => {
  const suffix = Date.now();
  const adminMatricula = `admin-push-fail-${suffix}`;
  const colaboradorMatricula = `colab-push-fail-${suffix}`;
  await db.run(
    `INSERT INTO colaboradores (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, 'Admin Push Fail', 'hash', 'admin', 'Ativo', 0, 0)`,
    [adminMatricula]
  );
  await db.run(
    `INSERT INTO colaboradores (matricula, nome_completo, senha_hash, perfil, status, primeiro_acesso, senha_temporaria)
     VALUES (?, 'Colaborador Push Fail', 'hash', 'colaborador', 'Ativo', 0, 0)`,
    [colaboradorMatricula]
  );
  const admin = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [adminMatricula]);
  const colaborador = await db.get('SELECT id FROM colaboradores WHERE matricula = ?', [colaboradorMatricula]);
  await db.run(
    `INSERT INTO push_inscricoes (colaborador_id, endpoint, p256dh, auth, ativo)
     VALUES (?, ?, 'p256dh', 'auth', 1)`,
    [colaborador.id, `https://push.example.test/failure/${suffix}`]
  );
  const adminToken = jwt.sign({ id: admin.id, matricula: adminMatricula, perfil: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const originalSendNotification = webpush.sendNotification;
  webpush.sendNotification = async () => {
    const error = new Error('Falha simulada do provedor Push');
    error.statusCode = 500;
    throw error;
  };

  try {
    const response = await request(app)
      .post('/api/notificacoes/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        titulo: 'Push com falha simulada',
        mensagem: 'Esta notificacao valida o mecanismo de nova tentativa.',
        status: 'publicado',
        para_colaborador: true,
        enviar_push: true
      })
      .expect(201);
    assert.equal(response.body.push_result.failed, 1);
    assert.equal(response.body.push_result.sent, 0);
    const stored = await db.get('SELECT push_enviado_em FROM notificacoes WHERE id = ?', [response.body.id]);
    assert.equal(stored.push_enviado_em, null);
    await db.run('DELETE FROM notificacoes WHERE id = ?', [response.body.id]);
  } finally {
    webpush.sendNotification = originalSendNotification;
    await db.run('DELETE FROM push_inscricoes WHERE colaborador_id = ?', [colaborador.id]);
    await db.run('DELETE FROM colaboradores WHERE id IN (?, ?)', [admin.id, colaborador.id]);
  }
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
      link_texto: 'Ver detalhes',
      enviar_push: true
    })
    .expect(201);

  const notificationId = created.body.id;
  assert.ok(notificationId);
  assert.equal(created.body.push_result.configured, true);
  assert.equal(created.body.push_result.targeted, 0);

  const config = await request(app)
    .get('/api/notificacoes/push/config')
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .expect(200);
  assert.equal(config.body.enabled, true);
  assert.equal(config.body.public_key, testVapidKeys.publicKey);

  const fakeEndpoint = `https://push.example.test/subscription/${suffix}`;
  await request(app)
    .post('/api/notificacoes/push/subscribe')
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .send({ subscription: { endpoint: fakeEndpoint, keys: { p256dh: 'p256dh-teste', auth: 'auth-teste' } } })
    .expect(201);
  const storedSubscription = await db.get('SELECT ativo FROM push_inscricoes WHERE endpoint = ?', [fakeEndpoint]);
  assert.equal(Number(storedSubscription.ativo), 1);

  await request(app)
    .post('/api/notificacoes/push/unsubscribe')
    .set('Authorization', `Bearer ${colaboradorToken}`)
    .send({ endpoint: fakeEndpoint })
    .expect(200);
  const inactiveSubscription = await db.get('SELECT ativo FROM push_inscricoes WHERE endpoint = ?', [fakeEndpoint]);
  assert.equal(Number(inactiveSubscription.ativo), 0);

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
