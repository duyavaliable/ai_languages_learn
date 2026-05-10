import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';

function PrivateRoute({ children, allowedRoles = [] }) {
  const token = localStorage.getItem('token');
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [isChecking, setIsChecking] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);

  useEffect(() => {
    if (!token) {
      setIsValid(false);
      setIsChecking(false);
      return;
    }

    api.get('/auth/profile')
      .then((response) => {
        setIsValid(true);
        if (allowedRoles.length > 0) {
          const role = String(response?.data?.role || currentUser.role || '').toLowerCase();
          setIsAuthorized(allowedRoles.map((item) => String(item).toLowerCase()).includes(role));
        } else {
          setIsAuthorized(true);
        }
      })
      .catch(() => {
        setIsValid(false);
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [token, allowedRoles, currentUser.role]);

  if (isChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ color: '#556', fontSize: '14px' }}>Đang kiểm tra quyền truy cập...</div>
      </div>
    );
  }

  if (!isValid) {
    return <Navigate to="/login" replace />;
  }

  if (!isAuthorized) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

export default PrivateRoute;