const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = '';

const { ensureRuntimeSchema } = require('../src/runtimeSchema');

test('aplica a migração idempotente do mapa antes de iniciar no PostgreSQL', async () => {
  const executed = [];
  const database = {
    async query(sql) {
      executed.push(sql);
    }
  };

  const result = await ensureRuntimeSchema({ database, usePostgres: true });

  assert.equal(result.applied, true);
  assert.equal(result.migration, '024_rotograma_mapa.sql, 025_planos_melhoria_yuri.sql, 026_pesquisa_clima_integridade.sql');
  assert.equal(executed.length, 3);
  assert.match(executed[0], /ADD COLUMN IF NOT EXISTS map_path_json/i);
  assert.match(executed[0], /CREATE TABLE IF NOT EXISTS rotograma_areas_suporte/i);
  assert.match(executed[1], /CREATE TABLE IF NOT EXISTS planos_melhoria_buckets/i);
  assert.match(executed[1], /planos_melhoria_grau_1/i);
  assert.match(executed[1], /19349/);
  assert.match(executed[1], /19047/);
  assert.match(executed[1], /50383/);
  assert.match(executed[2], /CREATE TABLE IF NOT EXISTS pesquisa_clima_participacoes/i);
  assert.match(executed[2], /ON CONFLICT \(pesquisa_id, colaborador_id\) DO NOTHING/i);
});

test('não executa SQL adicional no SQLite, que já mantém o schema local', async () => {
  const database = {
    async query() {
      throw new Error('não deveria executar');
    }
  };

  const result = await ensureRuntimeSchema({ database, usePostgres: false });

  assert.deepEqual(result, { applied: false, reason: 'sqlite' });
});
