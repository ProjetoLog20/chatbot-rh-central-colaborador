import { useEffect, useState } from 'react';
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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getUser());

  useEffect(() => {
    if (!getToken()) {
      setUser(null);
    }
  }, []);

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate('/login');
  }

  function requireAuth(element, roles = []) {
    if (!user) return <Navigate to="/login" replace />;
    if (user.primeiro_acesso || user.senha_temporaria) return <Navigate to="/primeiro-acesso" replace />;
    if (roles.length && !roles.includes(user.perfil)) return <Navigate to="/" replace />;
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
            <strong>Chat Bot RH</strong>
            <span>Central do Colaborador</span>
          </div>
        </div>
        <div className="header-actions">
          {user && !isFirstAccessRoute ? (
            <nav className="center-nav" aria-label="Centrais">
              <Link to="/">Central do Colaborador</Link>
              {user.perfil === 'admin' ? <Link to="/admin">Central do Administrador</Link> : null}
            </nav>
          ) : null}
          {user && !isFirstAccessRoute ? <span>{user.nome_preferido || user.nome_completo} ({user.perfil})</span> : null}
          {user ? <button onClick={handleLogout}>Sair</button> : null}
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={(user) => setUser(user)} />} />
          <Route path="/" element={requireAuth(<Dashboard user={user} />)} />
          <Route path="/profile" element={requireAuth(<ProfilePage />)} />
          <Route path="/motorista" element={requireAuth(<DriverPage />, ['motorista', 'admin'])} />
          <Route path="/pesquisa-clima" element={requireAuth(<PesquisaClimaPage />)} />
          <Route path="/admin" element={requireAuth(<AdminPage />, ['admin'])} />
          <Route path="/admin/pesquisa-clima" element={requireAuth(<AdminPesquisaClimaPage />, ['admin'])} />
          <Route path="/primeiro-acesso" element={<FirstAccessPage onComplete={() => setUser(null)} />} />
        </Routes>
      </main>

      {shouldShowChatAssistant ? <ChatAssistant /> : null}
    </div>
  );
}

export default App;
