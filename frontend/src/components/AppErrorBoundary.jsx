import { Component } from 'react';
import { clearToken } from '../auth.js';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Falha inesperada na interface do Yuri:', error?.name || 'Error');
  }

  handleRetry = () => {
    window.location.reload();
  };

  handleSafeLogout = () => {
    clearToken();
    window.location.assign('/login');
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-error-boundary" role="alert">
        <img src="/mascote-ia.png" alt="Yuri" />
        <h1>O Yuri encontrou uma instabilidade</h1>
        <p>Seus dados não foram reenviados. Tente recarregar a página ou entre novamente.</p>
        <div>
          <button type="button" onClick={this.handleRetry}>Tentar novamente</button>
          <button type="button" onClick={this.handleSafeLogout}>Sair com segurança</button>
        </div>
      </main>
    );
  }
}
