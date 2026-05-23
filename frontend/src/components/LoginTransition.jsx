import { useEffect } from 'react';

const ENABLE_LOGIN_SOUND = true;
const LOGIN_SOUND_SRC = '/sounds/login-transition.mp3';
const LOGIN_SOUND_VOLUME = 0.25;

export default function LoginTransition() {
  useEffect(() => {
    if (!ENABLE_LOGIN_SOUND) return undefined;

    // Coloque o arquivo de audio em frontend/public/sounds/login-transition.mp3.
    const audio = new Audio(LOGIN_SOUND_SRC);
    audio.volume = LOGIN_SOUND_VOLUME;
    audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  return (
    <section className="login-transition" aria-live="polite" aria-busy="true">
      <div className="login-transition-content">
        <div className="coin-logo-wrap">
          <img className="coin-logo" src="/rh-logo.jpg" alt="RH LOG20 Cascavel" />
        </div>
        <div className="login-transition-copy">
          <h1>Preparando sua Central...</h1>
          <p>Logística que faz bem.</p>
        </div>
      </div>
    </section>
  );
}
