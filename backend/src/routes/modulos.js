const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../authMiddleware');
const { ensureModuleConfigTable, listAllModules, listModulesForUser, shapeModule } = require('../moduleConfig');

const router = express.Router();

const editableFields = [
  'ativo',
  'em_manutencao',
  'mensagem_manutencao',
  'visivel_para_admin',
  'visivel_para_motorista',
  'visivel_para_colaborador',
  'ordem'
];

function normalizePatch(body) {
  const payload = {};
  editableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  });
  return payload;
}

router.get('/modulos', authenticateToken, async (req, res) => {
  try {
    const modulos = await listModulesForUser(req.user.perfil);
    return res.json(modulos);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar modulos' });
  }
});

router.get('/admin/modulos', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const modulos = await listAllModules();
    return res.json(modulos);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar configuracoes de modulos' });
  }
});

router.patch('/admin/modulos/:chave', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const payload = normalizePatch(req.body || {});
  const entries = Object.entries(payload);

  if (!entries.length) {
    return res.status(400).json({ error: 'Nenhum campo valido enviado' });
  }

  try {
    await ensureModuleConfigTable();
    const existing = await db.get('SELECT id FROM configuracoes_modulos WHERE chave = ?', [req.params.chave]);
    if (!existing) return res.status(404).json({ error: 'Módulo não encontrado' });

    const sets = entries.map(([field]) => `${field} = ?`);
    const params = entries.map(([, value]) => value);
    await db.run(
      `UPDATE configuracoes_modulos
       SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE chave = ?`,
      [...params, req.params.chave]
    );

    const updated = await db.get('SELECT * FROM configuracoes_modulos WHERE chave = ?', [req.params.chave]);
    return res.json(shapeModule(updated));
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar modulo' });
  }
});

module.exports = router;
