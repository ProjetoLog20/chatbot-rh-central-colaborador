const db = require('../db');
const { sendPushForNotification } = require('./pushService');

function normalizeCompetence(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value || '').trim();
}

async function publishPrizeUpdateNotification({ createdBy, competence, source } = {}) {
  const normalizedCompetence = normalizeCompetence(competence);
  const sourceLabel = source === 'armazem'
    ? 'do Armazém'
    : source === 'van'
      ? 'da VAN'
      : 'da Rota';
  const competenceLabel = normalizedCompetence ? ` da competência ${normalizedCompetence}` : '';
  const message = `O Prêmio de Produtividade ${sourceLabel}${competenceLabel} foi atualizado. Acesse o Yuri para consultar seus dados.`;

  const result = await db.run(
    `INSERT INTO notificacoes
     (titulo, mensagem, categoria, prioridade, status, para_todos, para_admin,
      para_motorista, para_colaborador, link_url, link_texto, criado_por, enviar_push)
     VALUES (?, ?, 'premio', 'importante', 'publicado', 1, 0, 0, 0, '/produtividade', 'Ver meu prêmio', ?, 1)`,
    ['Prêmio de produtividade atualizado', message, createdBy || null]
  );
  const notification = await db.get('SELECT * FROM notificacoes WHERE id = ?', [result.lastID]);

  let push = null;
  try {
    push = await sendPushForNotification(notification);
    if (push.configured && push.failed === 0) {
      await db.run('UPDATE notificacoes SET push_enviado_em = CURRENT_TIMESTAMP WHERE id = ?', [notification.id]);
    }
  } catch (error) {
    console.error('Erro ao enviar Push da atualização do prêmio:', error);
  }

  return { notification, push };
}

module.exports = { publishPrizeUpdateNotification };
