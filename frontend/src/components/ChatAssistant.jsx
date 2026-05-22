import { useState } from 'react';
import { askChatbot } from '../api.js';

const suggestions = [
  'Ola, o que voce pode fazer?',
  'O que e SKAP?',
  'Como esta meu prontuario?'
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      text: 'Ola. Eu sou o Assistente RH Log20. Posso consultar a base do RH, orientar voce pelos canais internos e ajudar a encontrar o proximo passo.'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

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

  function handleMascotMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * -10;
    setTilt({ x, y });
  }

  async function sendQuestion(text) {
    const userQuestion = text.trim();
    if (!userQuestion || loading) return;

    setMessages((prev) => [...prev, { type: 'user', text: userQuestion }]);
    setQuestion('');
    setLoading(true);

    try {
      const response = await askChatbot(userQuestion, previousResponseId);
      if (response.responseId) setPreviousResponseId(response.responseId);

      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: response.resposta,
          source: response.origem
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'assistant', text: 'Nao consegui consultar o assistente agora. Tente novamente em instantes.' }
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
      <button
        className="mascot-launcher"
        onClick={toggleChat}
        onMouseMove={handleMascotMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        style={{ '--tilt-x': `${tilt.x}deg`, '--tilt-y': `${tilt.y}deg` }}
        aria-label="Abrir assistente RH"
      >
        <img className="mascot-image" src="/mascote-ia.png" alt="Mascote Assistente RH Log20" />
        <span className="mascot-shadow" />
        <span className="mascot-bubble">{loading ? 'Pensando...' : open ? 'Estou aqui!' : 'Oi, posso ajudar?'}</span>
      </button>
      <button className="chat-toggle" onClick={toggleChat}>
        <span>IA</span>
        Assistente RH
      </button>
      {open ? (
        <section className="chat-window" aria-label="Assistente RH com IA">
          <div className="chat-header">
            <div className="chat-agent">
              <div className="chat-avatar">
                <img src="/mascote-ia.png" alt="" />
                <span />
              </div>
              <div>
                <strong>Assistente RH Log20</strong>
                <span>{loading ? 'Analisando sua mensagem...' : 'Online e conectado ao RH'}</span>
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
                {message.source ? <small>{message.source === 'ia' ? 'Resposta gerada por IA' : 'Base do RH'}</small> : null}
              </div>
            ))}
            {loading ? (
              <div className="chat-message assistant typing" aria-label="Assistente pensando">
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
              placeholder="Escreva sua duvida..."
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
