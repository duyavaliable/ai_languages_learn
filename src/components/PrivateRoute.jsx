import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  const [isChecking, setIsChecking] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsValid(false);
      setIsChecking(false);
      return;
    }

    api.get('/auth/profile')
      .then(() => {
        setIsValid(true);
      })
      .catch(() => {
        setIsValid(false);
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [token]);

  if (isChecking) {
    return null;
  }

  return isValid ? children : <Navigate to="/login" replace />;
}

export default PrivateRoute;