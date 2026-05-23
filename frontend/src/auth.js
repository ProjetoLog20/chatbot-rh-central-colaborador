export function setToken(token) {
  localStorage.setItem('token', token);
}

export function setUserData(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('firstAccess');
}

export function getToken() {
  return localStorage.getItem('token');
}

export function decodeToken(token) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getUser() {
  const tokenUser = decodeToken(getToken());
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return tokenUser;

  try {
    return { ...tokenUser, ...JSON.parse(storedUser) };
  } catch {
    return tokenUser;
  }
}
