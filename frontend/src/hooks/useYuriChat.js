import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askYuri } from '../api.js';

const MAX_SESSIONS = 8;
const MAX_MESSAGES_PER_SESSION = 60;
const STORAGE_VERSION = 1;

function makeId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function getGreeting(user) {
  const preferredName = String(user?.nome_preferido || '').trim();
  if (preferredName) {
    return `Olá, ${preferredName}! Eu sou o Yuri, assistente de RH da LOG20. Como posso te ajudar hoje?`;
  }
  return 'Olá! Eu sou o Yuri, assistente de RH da LOG20. Como posso te ajudar hoje?';
}

function createMessage(role, text, extra = {}) {
  return {
    id: makeId('message'),
    role,
    text,
    createdAt: new Date().toISOString(),
    ...extra
  };
}

function createSession(user) {
  const now = new Date().toISOString();
  return {
    id: makeId('session'),
    title: 'Nova conversa',
    createdAt: now,
    updatedAt: now,
    messages: [createMessage('assistant', getGreeting(user))]
  };
}

function sessionTitle(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nova conversa';
  return clean.length > 46 ? `${clean.slice(0, 46)}…` : clean;
}

function normalizeStoredSessions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((session) => session && typeof session.id === 'string' && Array.isArray(session.messages))
    .map((session) => ({
      id: session.id,
      title: String(session.title || 'Conversa'),
      createdAt: session.createdAt || new Date().toISOString(),
      updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
      messages: session.messages
        .filter((message) => message && ['assistant', 'user'].includes(message.role) && typeof message.text === 'string')
        .slice(-MAX_MESSAGES_PER_SESSION)
        .map((message) => ({
          id: String(message.id || makeId('message')),
          role: message.role,
          text: message.text,
          source: message.source,
          createdAt: message.createdAt || new Date().toISOString(),
          interrupted: Boolean(message.interrupted),
          streaming: false
        }))
    }))
    .filter((session) => session.messages.length)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_SESSIONS);
}

function updateSession(sessions, sessionId, updater) {
  return sessions.map((session) => (session.id === sessionId ? updater(session) : session));
}

export function useYuriChat(user) {
  const userKey = String(user?.id || user?.matricula || 'anonimo');
  const storageKey = useMemo(() => `yuri-chat:${STORAGE_VERSION}:${userKey}`, [userKey]);
  const initialState = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const storedSessions = normalizeStoredSessions(stored?.sessions);
      if (storedSessions.length) {
        const activeId = storedSessions.some((session) => session.id === stored?.activeSessionId)
          ? stored.activeSessionId
          : storedSessions[0].id;
        return { sessions: storedSessions, activeSessionId: activeId };
      }
    } catch {
      // Um histórico inválido é descartado sem impedir a abertura do assistente.
    }
    const session = createSession(user);
    return { sessions: [session], activeSessionId: session.id };
  }, [storageKey, user]);

  const [sessions, setSessions] = useState(initialState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialState.activeSessionId);
  const [status, setStatus] = useState(() => (navigator.onLine ? 'idle' : 'offline'));
  const [error, setError] = useState('');
  const [lastFailedQuestion, setLastFailedQuestion] = useState('');
  const activeRequestRef = useRef(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];
  const busy = status === 'thinking' || status === 'responding';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          activeSessionId,
          sessions: sessions.slice(0, MAX_SESSIONS).map((session) => ({
            ...session,
            messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION).map(({ streaming, ...message }) => message)
          }))
        }));
      } catch {
        // O chat continua funcional mesmo quando o navegador bloqueia armazenamento.
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, sessions, storageKey]);

  const stopResponse = useCallback((reason = 'user') => {
    const request = activeRequestRef.current;
    if (!request) return;
    request.cancelled = true;
    request.controller?.abort();
    if (request.timer) window.clearTimeout(request.timer);

    setSessions((current) => updateSession(current, request.sessionId, (session) => {
      let foundStreamingMessage = false;
      const nextMessages = session.messages.map((message) => {
        if (message.id !== request.messageId) return message;
        foundStreamingMessage = true;
        return {
          ...message,
          text: message.text || 'Resposta interrompida.',
          streaming: false,
          interrupted: true
        };
      });

      if (!foundStreamingMessage && reason === 'user') {
        nextMessages.push(createMessage('assistant', 'Resposta interrompida. Você pode enviar a pergunta novamente.', {
          interrupted: true
        }));
      }

      return { ...session, messages: nextMessages, updatedAt: new Date().toISOString() };
    }));

    activeRequestRef.current = null;
    setStatus(navigator.onLine ? 'idle' : 'offline');
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      stopResponse('offline');
      setStatus('offline');
      setError('Sem conexão. Suas conversas continuam salvas neste navegador.');
    };
    const handleOnline = () => {
      setStatus('reconnecting');
      setError('Reconectando ao Yuri…');
      window.setTimeout(() => {
        setStatus('idle');
        setError('');
      }, 700);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [stopResponse]);

  useEffect(() => () => {
    const request = activeRequestRef.current;
    request?.controller?.abort();
    if (request?.timer) window.clearTimeout(request.timer);
    activeRequestRef.current = null;
  }, []);

  const createNewSession = useCallback(() => {
    if (activeRequestRef.current) return;
    const session = createSession(user);
    setSessions((current) => [session, ...current].slice(0, MAX_SESSIONS));
    setActiveSessionId(session.id);
    setError('');
    setLastFailedQuestion('');
    setStatus(navigator.onLine ? 'idle' : 'offline');
  }, [user]);

  const selectSession = useCallback((sessionId) => {
    if (activeRequestRef.current) return;
    setActiveSessionId(sessionId);
    setError('');
    setStatus(navigator.onLine ? 'idle' : 'offline');
  }, []);

  const deleteSession = useCallback((sessionId) => {
    if (activeRequestRef.current) return;
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== sessionId);
      if (remaining.length) {
        if (sessionId === activeSessionId) setActiveSessionId(remaining[0].id);
        return remaining;
      }
      const replacement = createSession(user);
      setActiveSessionId(replacement.id);
      return [replacement];
    });
  }, [activeSessionId, user]);

  const clearError = useCallback(() => {
    setError('');
    setStatus((current) => (current === 'error' ? 'idle' : current));
  }, []);

  const sendMessage = useCallback(async (text) => {
    const question = String(text || '').trim();
    if (!question || activeRequestRef.current) return false;
    if (!navigator.onLine) {
      setStatus('offline');
      setError('Sem conexão. Reconecte-se para enviar a mensagem.');
      return false;
    }

    const sessionId = activeSession?.id;
    if (!sessionId) return false;
    const history = activeSession.messages
      .filter((message) => !message.streaming && message.text)
      .slice(-8)
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.text
      }));
    const requestId = makeId('request');
    const controller = new AbortController();
    activeRequestRef.current = { id: requestId, sessionId, controller, cancelled: false, timer: null, messageId: null };

    setSessions((current) => updateSession(current, sessionId, (session) => ({
      ...session,
      title: session.title === 'Nova conversa' ? sessionTitle(question) : session.title,
      updatedAt: new Date().toISOString(),
      messages: [...session.messages, createMessage('user', question)].slice(-MAX_MESSAGES_PER_SESSION)
    })));
    setError('');
    setLastFailedQuestion('');
    setStatus('thinking');

    try {
      const response = await askYuri(question, history, controller.signal);
      const request = activeRequestRef.current;
      if (!request || request.id !== requestId || request.cancelled) return false;

      const reply = String(response?.reply || 'Não consegui responder agora. Tente novamente em instantes.');
      const message = createMessage('assistant', '', { source: response?.source, streaming: true });
      request.messageId = message.id;
      setSessions((current) => updateSession(current, sessionId, (session) => ({
        ...session,
        updatedAt: new Date().toISOString(),
        messages: [...session.messages, message].slice(-MAX_MESSAGES_PER_SESSION)
      })));
      setStatus('responding');

      let cursor = 0;
      const chunkSize = Math.max(3, Math.ceil(reply.length / 120));
      const reveal = () => {
        const liveRequest = activeRequestRef.current;
        if (!liveRequest || liveRequest.id !== requestId || liveRequest.cancelled) return;
        cursor = Math.min(reply.length, cursor + chunkSize);
        setSessions((current) => updateSession(current, sessionId, (session) => ({
          ...session,
          updatedAt: new Date().toISOString(),
          messages: session.messages.map((item) => (
            item.id === message.id
              ? { ...item, text: reply.slice(0, cursor), streaming: cursor < reply.length }
              : item
          ))
        })));

        if (cursor < reply.length) {
          liveRequest.timer = window.setTimeout(reveal, 18);
        } else {
          activeRequestRef.current = null;
          setStatus('idle');
        }
      };
      reveal();
      return true;
    } catch (requestError) {
      const request = activeRequestRef.current;
      if (!request || request.id !== requestId || request.cancelled || requestError?.name === 'AbortError') return false;
      activeRequestRef.current = null;
      setStatus(navigator.onLine ? 'error' : 'offline');
      setError(navigator.onLine
        ? 'Não foi possível concluir a resposta. Tente novamente.'
        : 'A conexão caiu durante o envio. Reconecte-se e tente novamente.');
      setLastFailedQuestion(question);
      return false;
    }
  }, [activeSession]);

  const retryLast = useCallback(() => {
    if (lastFailedQuestion) return sendMessage(lastFailedQuestion);
    return Promise.resolve(false);
  }, [lastFailedQuestion, sendMessage]);

  return {
    sessions,
    activeSessionId,
    messages,
    status,
    busy,
    error,
    canRetry: Boolean(lastFailedQuestion),
    sendMessage,
    stopResponse,
    retryLast,
    clearError,
    createNewSession,
    selectSession,
    deleteSession
  };
}
