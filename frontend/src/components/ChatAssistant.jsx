import { useEffect, useState } from 'react';
import { askYuri, getChatbotSuggestions } from '../api.js';

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

function getGreeting(user) {
  const preferredName = String(user?.nome_preferido || '').trim();
  if (preferredName) {
    return `Olá, ${preferredName}! Eu sou o Yuri, assistente de RH da LOG20. Como posso te ajudar hoje?`;
  }

  return 'Olá! Eu sou o Yuri, assistente de RH da LOG20. Como posso te ajudar hoje?';
}

function labelForSource(source) {
  const labels = {
    base_rh: 'Base do RH',
    resposta_cadastrada: 'Base do RH',
    openai: 'Yuri IA',
    groq: 'Yuri IA',
    fallback: 'Instabilidade',
    ia_desativada: 'IA desativada',
    ia_sem_chave: 'IA sem chave'
  };
  return labels[source] || '';
}

export default function ChatAssistant({ user }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      text: getGreeting(user)
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(defaultSuggestions);

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

  function playOpenSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);

    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.07);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.07);
      oscillator.stop(context.currentTime + 0.24 + index * 0.04);
    });

    window.setTimeout(() => context.close(), 420);
  }

  function toggleChat() {
    setOpen((value) => {
      const nextValue = !value;
      if (nextValue) playOpenSound();
      return nextValue;
    });
  }

  async function sendQuestion(text) {
    const userQuestion = text.trim();
    if (!userQuestion || loading) return;

    setMessages((prev) => [...prev, { type: 'user', text: userQuestion }]);
    setQuestion('');
    setLoading(true);

    try {
      const history = messages.slice(-8).map((message) => ({
        role: message.type === 'assistant' ? 'assistant' : 'user',
        content: message.text
      }));
      const response = await askYuri(userQuestion, history);

      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: response.reply || 'Não consegui responder agora. Tente novamente em instantes.',
          source: response.source
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'assistant', text: 'Não consegui responder agora. Tente novamente em instantes.' }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendQuestion(question);
    }
  }

  return (
    <div className={`chat-assistant ${open ? 'open' : ''} ${loading ? 'thinking' : ''}`}>
      {!open ? (
        <button className="chat-toggle" onClick={toggleChat} aria-label="Falar com Yuri">
          <span>Y</span>
          Yuri
        </button>
      ) : null}
      {open ? (
        <section className="chat-window" aria-label="Yuri, Assistente de RH">
          <div className="chat-header">
            <div className="chat-agent">
              <div className="chat-avatar">
                <img src="/mascote-ia.png" alt="" />
                <span />
              </div>
              <div>
                <strong>Yuri</strong>
                <span>{loading ? 'Analisando sua mensagem...' : 'Assistente de RH LOG20'}</span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Fechar chat">
              x
            </button>
          </div>

          <div className="chat-body">
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.type}`}>
                <p>{message.text}</p>
                {labelForSource(message.source) ? <small>{labelForSource(message.source)}</small> : null}
              </div>
            ))}
            {loading ? (
              <div className="chat-message assistant typing" aria-label="Yuri pensando">
                <p>Yuri está digitando...</p>
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <div className="chat-suggestions">
            {suggestions.map((item) => (
              <button key={item} onClick={() => sendQuestion(item)} disabled={loading}>
                {item}
              </button>
            ))}
          </div>

          <div className="chat-footer">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva sua dúvida..."
            />
            <button onClick={() => sendQuestion(question)} disabled={loading || !question.trim()}>
              Enviar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
