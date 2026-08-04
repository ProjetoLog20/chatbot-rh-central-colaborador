import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ChatCircleDots,
  ClockCounterClockwise,
  Plus,
  Stop,
  Trash,
  WifiSlash,
  X
} from '@phosphor-icons/react';
import { getChatbotSuggestions } from '../api.js';
import { useYuriChat } from '../hooks/useYuriChat.js';
import YuriMarkdown from './YuriMarkdown.jsx';

const defaultSuggestions = [
  'Qual o sonho da unidade?',
  'Ver meu SKAP',
  'Ver meu prontuário',
  'Como funciona o primeiro acesso?',
  'Como funciona a Pesquisa de Clima?',
  'O que são os 3Rs?',
  'Como funciona o Campeão de Segurança?',
  'Preciso falar com o RH'
];

function labelForSource(source) {
  const labels = {
    base_rh: 'Base oficial do RH',
    resposta_cadastrada: 'Base oficial do RH',
    openai: 'Yuri IA',
    groq: 'Yuri IA',
    fallback: 'Resposta de contingência',
    ia_desativada: 'Base local',
    ia_sem_chave: 'Configuração pendente'
  };
  return labels[source] || '';
}

function statusCopy(status) {
  const labels = {
    idle: 'Assistente de RH LOG20',
    thinking: 'Analisando sua mensagem…',
    responding: 'Respondendo…',
    reconnecting: 'Reconectando…',
    offline: 'Sem conexão',
    error: 'Não foi possível responder'
  };
  return labels[status] || labels.idle;
}

function formatSessionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function ChatAssistant({ user }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [suggestions, setSuggestions] = useState(defaultSuggestions);
  const chatBodyRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const {
    sessions,
    activeSessionId,
    messages,
    status,
    busy,
    error,
    canRetry,
    sendMessage,
    stopResponse,
    retryLast,
    clearError,
    createNewSession,
    selectSession,
    deleteSession
  } = useYuriChat(user);

  useEffect(() => {
    if (!open) return;
    getChatbotSuggestions()
      .then((rows) => {
        const questions = (Array.isArray(rows) ? rows : [])
          .map((item) => item.pergunta)
          .filter(Boolean);
        setSuggestions(questions.length ? questions : defaultSuggestions);
      })
      .catch(() => setSuggestions(defaultSuggestions));
  }, [open]);

  useEffect(() => {
    if (!open || !stickToBottomRef.current) return;
    const body = chatBodyRef.current;
    if (!body) return;
    window.requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight;
    });
  }, [messages, status, open]);

  useEffect(() => {
    if (!open) return;
    stickToBottomRef.current = true;
    inputRef.current?.focus();
  }, [open, activeSessionId]);

  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 720px)').matches) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }, [question]);

  function playOpenSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.07);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.07);
      oscillator.stop(context.currentTime + 0.22 + index * 0.04);
    });
    window.setTimeout(() => context.close(), 400);
  }

  function toggleChat() {
    setOpen((value) => {
      const nextValue = !value;
      if (nextValue) playOpenSound();
      return nextValue;
    });
  }

  function submit(text) {
    const clean = String(text || '').trim();
    if (!clean || busy || status === 'offline' || status === 'reconnecting') return;
    setQuestion('');
    stickToBottomRef.current = true;
    void sendMessage(clean);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(question);
    }
  }

  function handleBodyScroll() {
    const body = chatBodyRef.current;
    if (!body) return;
    stickToBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  }

  const showSuggestions = messages.filter((message) => message.role === 'user').length === 0;

  return (
    <div className={`chat-assistant ${open ? 'open' : ''} ${busy ? 'thinking' : ''}`}>
      {!open ? (
        <button className="chat-toggle" onClick={toggleChat} aria-label="Falar com Yuri">
          <span className="chat-toggle-icon" aria-hidden="true"><ChatCircleDots size={27} weight="fill" /></span>
          <span className="chat-toggle-label">Fale com o Yuri</span>
        </button>
      ) : null}

      {open ? (
        <section className={`chat-window ${historyOpen ? 'history-open' : ''}`} aria-label="Yuri, Assistente de RH">
          {historyOpen ? <>
            <button
              type="button"
              className="chat-history-backdrop"
              aria-label="Fechar histórico"
              onClick={() => setHistoryOpen(false)}
            />

            <aside className="chat-history-panel" aria-label="Histórico de conversas">
            <div className="chat-history-header">
              <div>
                <small>Yuri</small>
                <strong>Conversas</strong>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico">
                <X size={18} weight="bold" />
              </button>
            </div>
            <button
              type="button"
              className="chat-new-session"
              disabled={busy}
              onClick={() => {
                createNewSession();
                setHistoryOpen(false);
              }}
            >
              <Plus size={18} weight="bold" /> Nova conversa
            </button>
            <div className="chat-session-list">
              {sessions.map((session) => (
                <div className={`chat-session-item ${session.id === activeSessionId ? 'active' : ''}`} key={session.id}>
                  <button
                    type="button"
                    className="chat-session-select"
                    disabled={busy}
                    onClick={() => {
                      selectSession(session.id);
                      setHistoryOpen(false);
                    }}
                  >
                    <span>{session.title}</span>
                    <small>{formatSessionDate(session.updatedAt)}</small>
                  </button>
                  <button
                    type="button"
                    className="chat-session-delete"
                    disabled={busy}
                    onClick={() => deleteSession(session.id)}
                    aria-label={`Excluir conversa ${session.title}`}
                  >
                    <Trash size={15} />
                  </button>
                </div>
              ))}
            </div>
              <p className="chat-history-note">Até 8 conversas ficam salvas somente neste navegador.</p>
            </aside>
          </> : null}

          <div className="chat-main">
            <header className="chat-header">
              <div className="chat-agent">
                <div className="chat-avatar">
                  <img src="/mascote-ia.png" alt="" />
                  <span />
                </div>
                <div>
                  <strong>Yuri</strong>
                  <span>{statusCopy(status)}</span>
                </div>
              </div>
              <div className="chat-header-actions">
                <button
                  type="button"
                  className="chat-history-toggle"
                  onClick={() => setHistoryOpen((value) => !value)}
                  aria-label="Abrir histórico de conversas"
                  aria-expanded={historyOpen}
                >
                  <ClockCounterClockwise size={20} weight="bold" />
                </button>
                <button className="chat-close" onClick={() => setOpen(false)} aria-label="Fechar chat">
                  <X size={19} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </header>

            {(error || status === 'offline' || status === 'reconnecting') ? (
              <div className={`chat-connection-state ${status}`} role="status">
                {status === 'offline' ? <WifiSlash size={18} weight="bold" /> : <ArrowClockwise size={18} weight="bold" />}
                <span>{error || statusCopy(status)}</span>
                {canRetry && status !== 'offline' ? (
                  <button type="button" onClick={() => void retryLast()}>Tentar novamente</button>
                ) : null}
                {error && !canRetry && status !== 'offline' && status !== 'reconnecting' ? (
                  <button type="button" onClick={clearError}>Fechar</button>
                ) : null}
              </div>
            ) : null}

            <div className="chat-body" ref={chatBodyRef} onScroll={handleBodyScroll} aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`chat-message ${message.role} ${message.streaming ? 'streaming' : ''} ${message.interrupted ? 'interrupted' : ''}`}>
                  {message.role === 'assistant' ? <YuriMarkdown>{message.text}</YuriMarkdown> : <p>{message.text}</p>}
                  {message.streaming ? <span className="chat-stream-cursor" aria-hidden="true" /> : null}
                  {labelForSource(message.source) ? <small>{labelForSource(message.source)}</small> : null}
                </article>
              ))}
              {status === 'thinking' ? (
                <div className="chat-message assistant typing" aria-label="Yuri pensando">
                  <p>Yuri está pensando</p>
                  <span /><span /><span />
                </div>
              ) : null}
            </div>

            {showSuggestions ? (
              <div className="chat-suggestions" aria-label="Ações rápidas">
                <span className="chat-suggestions-title">Como posso ajudar?</span>
                {suggestions.slice(0, 6).map((item) => (
                  <button key={item} onClick={() => submit(item)} disabled={busy || status !== 'idle'}>
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            <form className="chat-footer" onSubmit={(event) => { event.preventDefault(); submit(question); }}>
              <div className="chat-composer">
                <textarea
                  ref={inputRef}
                  value={question}
                  rows={1}
                  maxLength={1200}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={status === 'offline' ? 'Aguardando conexão…' : 'Escreva sua dúvida…'}
                  disabled={status === 'offline' || status === 'reconnecting'}
                />
                <small>Enter envia · Shift + Enter cria uma nova linha</small>
              </div>
              {busy ? (
                <button type="button" className="chat-stop" onClick={() => stopResponse('user')} aria-label="Interromper resposta">
                  <Stop size={20} weight="fill" aria-hidden="true" />
                  <span>Parar</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!question.trim() || busy || status === 'offline' || status === 'reconnecting'}
                  aria-label="Enviar mensagem"
                >
                  <ChatCircleDots size={20} weight="fill" aria-hidden="true" />
                  <span>Enviar</span>
                </button>
              )}
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
