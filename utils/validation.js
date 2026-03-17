export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePassword = (password) => {
  return typeof password === 'string';
};

export const validateUsername = (username) => {
  return username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username);
};
