import { useEffect, useRef, useState } from 'react';
import { Link, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ChartBar, CheckCircle, FileText, GearSix, House, MapTrifold, Medal, Recycle, UserCircle } from '@phosphor-icons/react';
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

function getInitials(user) {
  const name = String(user?.nome_preferido || user?.nome_completo || 'Yuri').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'Y'}${parts.length > 1 ? parts.at(-1)[0] : ''}`.toUpperCase();
}

function isRouteIndicatorsAllowed(user) {
  const text = [
    user?.perfil,
    user?.cargo,
    user?.tipo_colaborador
  ].map((value) => String(value || '').trim().toLowerCase()).join(' ');

  return normalizePerfil(user?.perfil) === 'admin' || text.includes('motorista') || text.includes('ajudante');
}

const pageMeta = {
  '/': ['Visão geral', 'Início'],
  '/produtividade': ['Desempenho', 'Meu prêmio'],
  '/skap': ['Desenvolvimento', 'SKAP'],
  '/prontuario': ['Minha jornada', 'Prontuário'],
  '/indicadores-rota': ['Operação', 'Indicadores'],
  '/rotograma-seguro': ['Segurança', 'Rotograma'],
  '/3rs': ['Cultura', '3Rs'],
  '/profile': ['Minha conta', 'Meus dados'],
  '/admin': ['Gestão', 'Administração']
};

function NavIcon({ name }) {
  const icons = {
    home: House,
    prize: Medal,
    check: CheckCircle,
    file: FileText,
    chart: ChartBar,
    route: MapTrifold,
    recycle: Recycle,
    user: UserCircle,
    settings: GearSix
  };
  const Icon = icons[name] || House;
  return <Icon aria-hidden="true" size={18} weight="bold" />;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
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
  const currentPage = pageMeta[location.pathname] || ['Central do Colaborador', 'Yuri'];

  return (
    <div className="app-shell">
      <motion.header
        className="app-header"
        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="brand-block">
          <img src="/rh-logo.jpg" alt="RH Log20 Cascavel" />
          <div>
            <span>{currentPage[0]}</span>
            <strong>{currentPage[1]}</strong>
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
          {user && !isFirstAccessRoute ? (
            <Link className="desktop-user-profile" to="/profile" aria-label="Abrir meus dados">
              <span className="desktop-user-avatar">{getInitials(user)}</span>
              <span>
                <strong>{user.nome_preferido || user.nome_completo}</strong>
                <small>{normalizePerfil(user.perfil) === 'admin' ? 'Administrador' : 'Colaborador'}</small>
              </span>
            </Link>
          ) : null}
          {user && !isFirstAccessRoute ? <NotificationBell /> : null}
          {user && !isFirstAccessRoute ? <span className="mobile-user-avatar" aria-label={`Usuário ${user.nome_preferido || user.nome_completo}`}>{getInitials(user)}</span> : null}
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
      </motion.header>

      {user && !isFirstAccessRoute ? (
        <motion.aside
          className="desktop-app-sidebar"
          aria-label="Menu principal"
          initial={reduceMotion ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link className="sidebar-brand" to="/">
            <img src="/rh-logo.jpg" alt="RH LOG20 Cascavel" />
            <span><strong>Yuri</strong><small>Central RH</small></span>
          </Link>
          <span className="sidebar-section-label">Navegação</span>
          <nav>
            <Link className={location.pathname === '/' ? 'active' : ''} to="/"><span><NavIcon name="home" /></span> Início</Link>
            <Link className={location.pathname === '/produtividade' ? 'active' : ''} to="/produtividade"><span><NavIcon name="prize" /></span> Meu prêmio</Link>
            <Link className={location.pathname === '/skap' ? 'active' : ''} to="/skap"><span><NavIcon name="check" /></span> SKAP</Link>
            <Link className={location.pathname === '/prontuario' ? 'active' : ''} to="/prontuario"><span><NavIcon name="file" /></span> Prontuário</Link>
            <Link className={location.pathname === '/indicadores-rota' ? 'active' : ''} to="/indicadores-rota"><span><NavIcon name="chart" /></span> Indicadores</Link>
            <Link className={location.pathname === '/rotograma-seguro' ? 'active' : ''} to="/rotograma-seguro"><span><NavIcon name="route" /></span> Rotograma</Link>
            <Link className={location.pathname === '/3rs' ? 'active' : ''} to="/3rs"><span><NavIcon name="recycle" /></span> 3Rs</Link>
            <Link className={location.pathname === '/profile' ? 'active' : ''} to="/profile"><span><NavIcon name="user" /></span> Meus dados</Link>
          </nav>
          {normalizePerfil(user.perfil) === 'admin' ? (
            <div className="sidebar-admin">
              <small>ADMIN</small>
              <Link className={location.pathname === '/admin' ? 'active' : ''} to="/admin"><span><NavIcon name="settings" /></span> Administração</Link>
            </div>
          ) : null}
          <div className="sidebar-security"><i /><span><strong>Ambiente protegido</strong><small>Acesso monitorado</small></span></div>
        </motion.aside>
      ) : null}

      <main className={`app-main ${user && !isFirstAccessRoute ? 'authenticated-main' : ''}`}>
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
      {user && token && !isPublicRoute ? <MandatoryNotifications user={user} /> : null}
      {user && !isFirstAccessRoute ? (
        <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
          <Link className={location.pathname === '/' ? 'active' : ''} to="/"><span>⌂</span><small>Início</small></Link>
          <Link className={location.pathname === '/produtividade' ? 'active' : ''} to="/produtividade"><span>🏅</span><small>Prêmio</small></Link>
          <Link className={location.pathname === '/3rs' ? 'active' : ''} to="/3rs"><span>Ⓡ</span><small>3Rs</small></Link>
          <button type="button" onClick={() => setMobileMenuOpen((current) => !current)}><span>☰</span><small>Menu</small></button>
        </nav>
      ) : null}
    </div>
  );
}

export default App;
