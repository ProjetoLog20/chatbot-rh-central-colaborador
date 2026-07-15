function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'sem-request-id';

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Conteudo enviado acima do limite permitido',
      request_id: requestId
    });
  }

  console.error(`[${requestId}]`, err);

  res.status(500).json({
    error: 'Erro interno no servidor',
    request_id: requestId
  });
}

module.exports = errorHandler;
