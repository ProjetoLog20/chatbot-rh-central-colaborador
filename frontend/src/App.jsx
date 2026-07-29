import { useEffect, useRef, useState } from 'react';
import { Link, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { getUser, clearToken, getToken } from './auth.js';
import LoginPage from './components/LoginPage.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import DriverPage from './components/DriverPage.jsx';
import AdminPage from './components/AdminPage.jsx';
import ChatAssistant from './components/ChatAssistant.jsx';
import NotFound from './components/NotFound.jsx';
import PesquisaClimaPage from './components/PesquisaClimaPage.jsx';
import AdminPesquisaClimaPage from './components/AdminPesquisaClimaPage.jsx';
import FirstAccessPage from './components/FirstAccessPage.jsx';
import SkapPage from './components/SkapPage.jsx';
import ThreeRsPage from './components/ThreeRsPage.jsx';
import ProdutividadePage from './components/ProdutividadePage.jsx';
import CampeaoSegurancaPage from './components/CampeaoSegurancaPage.jsx';
import AdminCampeoesSeguranca from './components/AdminCampeoesSeguranca.jsx';
import IndicadoresRotaPage from './components/IndicadoresRotaPage.jsx';
import RotogramaSeguroPage from './components/RotogramaSeguroPage.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import MandatoryNotifications from './components/MandatoryNotifications.jsx';
import MandatorySatisfaction from './components/MandatorySatisfaction.jsx';

function normalizePerfil(perfil) {
  return String(perfil || '').trim().toLowerCase();
}

function isRouteIndicatorsAllowed(user) {
  const text = [
    user?.perfil,
    user?.cargo,
    user?.tipo_colaborador
  ].map((value) => String(value || '').trim().toLowerCase()).join(' ');

  return normalizePerfil(user?.perfil) === 'admin' || text.includes('motorista') || text.includes('ajudante');
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerActionsRef = useRef(null);

  useEffect(() => {
    if (!getToken()) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    function closeMenu(event) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        return;
      }
      if (event.type === 'mousedown' && (
        !headerActionsRef.current?.contains(event.target)
        || event.target.closest?.('.notification-center')
      )) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [mobileMenuOpen]);

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate('/login');
  }

  function requireAuth(element, roles = []) {
    if (!user) return <Navigate to="/login" replace />;
    if (user.primeiro_acesso || user.senha_temporaria) return <Navigate to="/primeiro-acesso" replace />;
    if (roles.length && !roles.includes(normalizePerfil(user.perfil))) return <Navigate to="/" replace />;
    return element;
  }

  function requireRouteIndicatorsAuth(element) {
    if (!user) return <Navigate to="/login" replace />;
    if (user.primeiro_acesso || user.senha_temporaria) return <Navigate to="/primeiro-acesso" replace />;
    if (!isRouteIndicatorsAllowed(user)) return <Navigate to="/" replace />;
    return element;
  }

  const token = getToken();
  const isPublicRoute = ['/login', '/primeiro-acesso'].includes(location.pathname);
  const isFirstAccessRoute = location.pathname === '/primeiro-acesso';
  const shouldShowChatAssistant = Boolean(user && token && !isPublicRoute);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <img src="/rh-logo.jpg" alt="RH Log20 Cascavel" />
          <div>
            <strong>Yuri, Assistente de RH</strong>
            <span>Central do Colaborador</span>
          </div>
        </div>
        <div className={`header-actions ${mobileMenuOpen ? 'mobile-open' : ''}`} ref={headerActionsRef}>
          {user && !isFirstAccessRoute ? (
            <button
              type="button"
              className="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
            </button>
          ) : null}
          {user && !isFirstAccessRoute ? (
            <nav className="center-nav desktop-center-nav" aria-label="Centrais">
              <Link to="/">Central do Colaborador</Link>
              <Link to="/profile">Meus dados</Link>
              {normalizePerfil(user.perfil) === 'admin' ? <Link to="/admin">Central do Administrador</Link> : null}
            </nav>
          ) : null}
          {user && !isFirstAccessRoute ? <span className="desktop-user-name">{user.nome_preferido || user.nome_completo} ({user.perfil})</span> : null}
          {user && !isFirstAccessRoute ? <NotificationBell /> : null}
          {user ? <button className="desktop-logout" onClick={handleLogout}>Sair</button> : null}
          {user && !isFirstAccessRoute && mobileMenuOpen ? (
            <nav className="mobile-menu-panel" aria-label="Menu do colaborador">
              <span>{user.nome_preferido || user.nome_completo}</span>
              <Link to="/">Início</Link>
              <Link to="/profile">Meus dados</Link>
              {normalizePerfil(user.perfil) === 'admin' ? <Link to="/admin">Central do Administrador</Link> : null}
              <button type="button" onClick={handleLogout}>Sair</button>
            </nav>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={(user) => setUser(user)} />} />
          <Route path="/" element={requireAuth(<Dashboard user={user} />)} />
          <Route path="/profile" element={requireAuth(<ProfilePage />)} />
          <Route path="/motorista" element={requireAuth(<DriverPage user={user} />)} />
          <Route path="/prontuario" element={requireAuth(<DriverPage user={user} />)} />
          <Route path="/pesquisa-clima" element={requireAuth(<PesquisaClimaPage />)} />
          <Route path="/3rs" element={requireAuth(<ThreeRsPage />)} />
          <Route path="/campeao-seguranca" element={requireAuth(<CampeaoSegurancaPage user={user} />)} />
          <Route path="/campeao-seguranca/gerenciar" element={requireAuth(<AdminCampeoesSeguranca />)} />
          <Route path="/indicadores-rota" element={requireRouteIndicatorsAuth(<IndicadoresRotaPage />)} />
          <Route path="/rotograma-seguro" element={requireAuth(<RotogramaSeguroPage user={user} />)} />
          <Route path="/skap" element={requireAuth(<SkapPage user={user} />)} />
          <Route path="/produtividade" element={requireAuth(<ProdutividadePage user={user} />)} />
          <Route path="/admin" element={requireAuth(<AdminPage />, ['admin'])} />
          <Route path="/admin/pesquisa-clima" element={requireAuth(<AdminPesquisaClimaPage />, ['admin'])} />
          <Route path="/primeiro-acesso" element={<FirstAccessPage onComplete={() => setUser(null)} />} />
        </Routes>
      </main>

      {shouldShowChatAssistant ? <ChatAssistant user={user} /> : null}
      {user && token && !isPublicRoute ? <MandatorySatisfaction user={user} /> : null}
      {user && token && !isPublicRoute ? <MandatoryNotifications user={user} /> : null}
    </div>
  );
}

export default App;
