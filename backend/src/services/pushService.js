const webpush = require('web-push');
const db = require('../db');

async function getPushConfig() {
  const envConfig = {
    publicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
    subject: String(process.env.VAPID_SUBJECT || 'https://www.log20.com.br').trim()
  };
  if (envConfig.publicKey && envConfig.privateKey) return envConfig;

  let stored = await db.get('SELECT public_key, private_key, subject FROM push_configuracao WHERE id = 1');
  if (!stored) {
    const generated = webpush.generateVAPIDKeys();
    await db.run(
      `INSERT INTO push_configuracao (id, public_key, private_key, subject)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [generated.publicKey, generated.privateKey, envConfig.subject]
    );
    stored = await db.get('SELECT public_key, private_key, subject FROM push_configuracao WHERE id = 1');
  }
  return {
    publicKey: stored.public_key,
    privateKey: stored.private_key,
    subject: stored.subject
  };
}

async function configureWebPush() {
  const config = await getPushConfig();
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
}

function matchesAudience(notification, perfil) {
  if (Number(notification.para_todos)) return true;
  const normalized = String(perfil || '').trim().toLowerCase();
  if (normalized === 'admin') return Boolean(Number(notification.para_admin));
  if (normalized === 'motorista') return Boolean(Number(notification.para_motorista));
  return Boolean(Number(notification.para_colaborador));
}

async function deactivateSubscription(id, message) {
  await db.run(
    `UPDATE push_inscricoes
     SET ativo = 0, ultimo_erro = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [String(message || 'Inscricao expirada').slice(0, 500), id]
  );
}

async function sendPushForNotification(notification) {
  await configureWebPush();
  const subscriptions = await db.all(
    `SELECT p.id, p.endpoint, p.p256dh, p.auth, c.perfil
     FROM push_inscricoes p
     JOIN colaboradores c ON c.id = p.colaborador_id
     WHERE p.ativo = 1 AND COALESCE(c.status, 'Ativo') = 'Ativo'`
  );
  const targets = subscriptions.filter((item) => matchesAudience(notification, item.perfil));
  const payload = JSON.stringify({
    title: notification.titulo,
    body: notification.mensagem,
    url: notification.link_url || '/',
    tag: `yuri-notificacao-${notification.id}`,
    notificationId: notification.id,
    category: notification.categoria,
    priority: notification.prioridade
  });

  const result = { configured: true, targeted: targets.length, sent: 0, failed: 0, expired: 0 };
  await Promise.all(targets.map(async (target) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { TTL: 60 * 60 * 24, urgency: notification.prioridade === 'urgente' ? 'high' : 'normal' }
      );
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) {
        result.expired += 1;
        await deactivateSubscription(target.id, `Push expirado (${error.statusCode})`);
      } else {
        await db.run(
          `UPDATE push_inscricoes SET ultimo_erro = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [String(error.message || 'Falha no envio').slice(0, 500), target.id]
        );
      }
    }
  }));

  return result;
}

module.exports = {
  getPushConfig,
  sendPushForNotification
};
