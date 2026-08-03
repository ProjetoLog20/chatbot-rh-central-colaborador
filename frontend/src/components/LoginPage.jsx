import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { setToken, setUserData } from '../auth.js';
import LoginTransition from './LoginTransition.jsx';
import './login-page.css';

const entrance = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } }
};

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export default function LoginPage({ onLogin }) {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [showTransition, setShowTransition] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(matricula, senha);

      if (data.requiresPasswordChange) {
        sessionStorage.setItem('firstAccess', JSON.stringify({
          matricula,
          senhaAtual: senha,
          nome_completo: data.nome_completo,
          perfil: data.perfil
        }));
        onLogin(null);
        navigate('/primeiro-acesso');
        return;
      }

      setToken(data.token);
      setUserData(data.usuario);
      onLogin(data.usuario);
      setShowTransition(true);
      window.setTimeout(() => navigate('/'), reduceMotion ? 80 : 1800);
    } catch (err) {
      setError(err.error || 'Não foi possível entrar. Confira seus dados.');
      setLoading(false);
    }
  }

  if (showTransition) return <LoginTransition />;

  return (
    <MotionConfig reducedMotion="user">
      <section className="login-experience" aria-labelledby="login-title">
        <div className="login-background" aria-hidden="true">
          <motion.span
            className="login-orb login-orb-one"
            animate={reduceMotion ? undefined : { x: [0, 22, 0], y: [0, -18, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="login-orb login-orb-two"
            animate={reduceMotion ? undefined : { x: [0, -18, 0], y: [0, 24, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <motion.div className="login-layout" variants={stagger} initial="hidden" animate="visible">
          <motion.article className="login-story" variants={entrance} transition={{ duration: 0.55 }}>
            <motion.div className="login-story-brand" variants={entrance}>
              <img src="/rh-logo.jpg" alt="" />
              <span>Central do Colaborador</span>
            </motion.div>

            <motion.div className="login-story-copy" variants={entrance}>
              <span className="login-eyebrow">Seu RH mais perto de você</span>
              <h2>Tudo o que você precisa, em um só lugar.</h2>
              <p>
                Consulte informações, acompanhe seu desenvolvimento e converse com o Yuri de forma simples e segura.
              </p>
            </motion.div>

            <motion.div className="login-yuri-stage" variants={entrance}>
              <motion.span
                className="login-yuri-aura"
                aria-hidden="true"
                animate={reduceMotion ? undefined : { scale: [0.92, 1.08, 0.92], opacity: [0.34, 0.62, 0.34] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="login-yuri-sparkles" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <motion.div
                className="login-yuri-picture"
                initial={reduceMotion ? undefined : { opacity: 0, scale: 0.82, rotate: -5 }}
                animate={reduceMotion ? undefined : {
                  opacity: 1,
                  scale: 1,
                  y: [0, -11, -4, 0],
                  rotate: [-0.8, 1, -0.3, -0.8]
                }}
                transition={{
                  opacity: { duration: 0.35 },
                  scale: { type: 'spring', stiffness: 190, damping: 15 },
                  y: { duration: 5.2, repeat: Infinity, ease: 'easeInOut' },
                  rotate: { duration: 5.2, repeat: Infinity, ease: 'easeInOut' }
                }}
                whileHover={reduceMotion ? undefined : { scale: 1.045, y: -9, rotate: 0 }}
              >
                <motion.img
                  src="/mascote-ia.png"
                  alt="Yuri, assistente virtual de RH da LOG20"
                  animate={reduceMotion ? undefined : { scale: [1.015, 1.045, 1.015], x: [0, 1.5, 0] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.div>
              <motion.div
                className="login-yuri-message"
                initial={{ opacity: 0, scale: 0.92, x: 12 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.72, type: 'spring', stiffness: 220, damping: 20 }}
              >
                <strong>Olá! Eu sou o Yuri.</strong>
                <span>Vamos começar?</span>
              </motion.div>
            </motion.div>

            <motion.ul className="login-benefits" variants={entrance} aria-label="Recursos da Central">
              <li><span>01</span> Acesso rápido</li>
              <li><span>02</span> Dados protegidos</li>
              <li><span>03</span> Atendimento humanizado</li>
            </motion.ul>
          </motion.article>

          <motion.div
            className="login-access-card"
            variants={entrance}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            <div className="login-access-heading">
              <span className="login-secure-badge"><i aria-hidden="true" /> Ambiente seguro</span>
              <h1 id="login-title">Bem-vindo de volta</h1>
              <p>Entre com sua matrícula e senha para acessar sua Central.</p>
            </div>

            <AnimatePresence mode="wait">
              {location.state?.message ? (
                <motion.div
                  className="login-feedback login-feedback-success"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                >
                  {location.state.message}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <form onSubmit={handleSubmit} noValidate>
              <label className="login-field">
                <span>Matrícula</span>
                <span className="login-input-wrap">
                  <i className="login-field-icon"><UserIcon /></i>
                  <input
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    autoComplete="username"
                    inputMode="numeric"
                    placeholder="Digite sua matrícula"
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                </span>
              </label>

              <label className="login-field">
                <span>Senha</span>
                <span className="login-input-wrap">
                  <i className="login-field-icon"><LockIcon /></i>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </span>
              </label>

              <AnimatePresence>
                {error ? (
                  <motion.div
                    id="login-error"
                    className="login-feedback login-feedback-error"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    role="alert"
                  >
                    <span aria-hidden="true">!</span>
                    {error}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <motion.button
                type="submit"
                className="login-submit"
                disabled={loading || !matricula || !senha}
                whileHover={reduceMotion || loading ? undefined : { y: -2 }}
                whileTap={reduceMotion || loading ? undefined : { scale: 0.985 }}
              >
                <span>{loading ? 'Validando acesso...' : 'Entrar na Central'}</span>
                {loading ? <i className="login-spinner" aria-hidden="true" /> : <ArrowIcon />}
              </motion.button>
            </form>

            <div className="login-access-footer">
              <LockIcon />
              <span>Suas informações são protegidas e acessíveis somente por você e pelo RH autorizado.</span>
            </div>
          </motion.div>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
