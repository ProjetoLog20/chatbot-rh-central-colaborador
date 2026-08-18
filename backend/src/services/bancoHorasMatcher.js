const { isPointExemptRole, normalizeText } = require('./bancoHorasParser');

function bigrams(value) {
  const input = normalizeText(value).replace(/\s+/g, ' ');
  if (input.length < 2) return input ? [input] : [];
  const result = [];
  for (let index = 0; index < input.length - 1; index += 1) {
    result.push(input.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  const counts = new Map();
  a.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  let matches = 0;
  b.forEach((item) => {
    const available = counts.get(item) || 0;
    if (!available) return;
    matches += 1;
    counts.set(item, available - 1);
  });
  return (2 * matches) / (a.length + b.length);
}

function collaboratorNames(collaborator) {
  return [collaborator.nome_completo, collaborator.nome_preferido]
    .map(normalizeText)
    .filter(Boolean);
}

function normalizedRegistration(value) {
  return String(value || '').trim().toLowerCase();
}

function isOfficialScopeCollaborator(collaborator) {
  const sector = normalizeText(collaborator?.setor);
  const role = normalizeText(collaborator?.cargo);
  return sector === 'administrativo'
    || sector === 'apoio logistico'
    || role.includes('manobrista');
}

function isKairosScopeStructure(structure) {
  const normalized = normalizeText(structure);
  return normalized.includes('armazem')
    || normalized.includes('amazem')
    || normalized.includes('administrativo')
    || normalized.includes('cascavel');
}

function publicCandidate(collaborator, score) {
  return {
    id: collaborator.id,
    matricula: collaborator.matricula,
    nome_completo: collaborator.nome_completo,
    cargo: collaborator.cargo,
    setor: collaborator.setor,
    unidade: collaborator.unidade,
    score: Number(score.toFixed(4))
  };
}

function linkedResult(collaborator, method, confidence) {
  return {
    colaborador_id: collaborator.id,
    status_vinculo: 'vinculado',
    metodo_vinculo: method,
    confianca_vinculo: confidence,
    nome_ginfo_snapshot: collaborator.nome_completo,
    matricula_ginfo_snapshot: collaborator.matricula,
    dispensado_ponto: isPointExemptRole(collaborator.cargo),
    sugestoes: []
  };
}

function matchIdentity(source, collaborators, aliases = []) {
  const normalizedSourceName = normalizeText(source.nome_kairos);
  const sourceRegistration = normalizedRegistration(source.matricula_kairos);
  const activeById = new Map(collaborators.map((item) => [Number(item.id), item]));
  const alias = aliases.find((item) => (
    item.nome_kairos_normalizado === normalizedSourceName
    && normalizedRegistration(item.matricula_kairos) === sourceRegistration
  ));
  if (alias) {
    const collaborator = activeById.get(Number(alias.colaborador_id));
    if (collaborator) return linkedResult(collaborator, 'alias_confirmado', 1);
  }

  const exact = collaborators.filter((collaborator) => collaboratorNames(collaborator).includes(normalizedSourceName));
  if (exact.length === 1) return linkedResult(exact[0], 'nome_exato', 1);

  const scored = collaborators
    .map((collaborator) => {
      const nameScore = Math.max(0, ...collaboratorNames(collaborator).map((name) => diceSimilarity(normalizedSourceName, name)));
      const sameRegistration = String(source.matricula_kairos || '').trim() === String(collaborator.matricula || '').trim();
      const score = Math.min(1, nameScore + (sameRegistration ? 0.04 : 0));
      return { collaborator, score };
    })
    .filter((item) => item.score >= 0.55)
    .sort((left, right) => right.score - left.score || left.collaborator.nome_completo.localeCompare(right.collaborator.nome_completo, 'pt-BR'));

  return {
    colaborador_id: null,
    status_vinculo: 'pendente',
    metodo_vinculo: exact.length > 1 ? 'nome_ambiguo' : 'revisao_manual',
    confianca_vinculo: scored[0]?.score || null,
    nome_ginfo_snapshot: null,
    matricula_ginfo_snapshot: null,
    dispensado_ponto: false,
    sugestoes: scored.slice(0, 3).map((item) => publicCandidate(item.collaborator, item.score))
  };
}

function matchReport(parsed, collaborators, aliases = []) {
  const cache = new Map();
  const activeById = new Map(collaborators.map((item) => [Number(item.id), item]));
  const resolve = (row) => {
    const key = `${row.nome_kairos_normalizado || normalizeText(row.nome_kairos)}\u0000${normalizedRegistration(row.matricula_kairos)}`;
    if (!cache.has(key)) cache.set(key, matchIdentity(row, collaborators, aliases));
    return cache.get(key);
  };

  const matchedBalances = parsed.saldos.map((row) => ({ ...row, ...resolve(row) }));
  const matchedDays = parsed.dias.map((row) => {
    const match = resolve(row);
    const withoutPunches = !row.batidas?.length;
    const classification = match.dispensado_ponto && withoutPunches ? 'nao_aplicavel' : row.classificacao;
    return { ...row, ...match, classificacao: classification };
  });

  const insideScope = (row) => {
    if (isKairosScopeStructure(row.estrutura_kairos)) return true;
    const collaborator = activeById.get(Number(row.colaborador_id));
    return Boolean(collaborator && isOfficialScopeCollaborator(collaborator));
  };
  const saldos = matchedBalances.filter(insideScope);
  const dias = matchedDays.filter(insideScope);
  const excluded = (matchedBalances.length - saldos.length) + (matchedDays.length - dias.length);
  const avisos = [...(parsed.avisos || [])];
  if (excluded > 0) {
    avisos.push(`${excluded} linha(s) fora do escopo Armazém/Administrativo foram desconsideradas.`);
  }

  return { ...parsed, saldos, dias, avisos };
}

module.exports = {
  diceSimilarity,
  isKairosScopeStructure,
  isOfficialScopeCollaborator,
  matchIdentity,
  matchReport,
  normalizedRegistration
};
