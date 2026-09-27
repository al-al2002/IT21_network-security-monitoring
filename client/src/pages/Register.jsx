// pages/Register.jsx
// Sign-up form. Public registration creates analyst accounts only
// (the backend enforces this — even if a client sends role: "admin",
// the server downgrades it).

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';

const PasswordIcon = ({ hidden }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
    {hidden ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.3A10.7 10.7 0 0112 4c5.2 0 8.5 4 9.5 6a11.8 11.8 0 01-3.1 3.8M6.2 6.2A11.8 11.8 0 002.5 10c1 2 4.3 6 9.5 6 1 0 2-.2 2.8-.5" />
    ) : (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    )}
  </svg>
);

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedName.length < 2) {
      setError('Full name must be at least 2 characters');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await register(normalizedName, normalizedEmail, password);
      setRedirecting(true);
      setTimeout(() => navigate('/'), 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="auth-panel-in relative w-full max-w-sm overflow-hidden rounded-lg border border-slate-700 border-t-2 border-t-sky-500 bg-slate-800 p-8 shadow-xl ring-1 ring-slate-700/40 backdrop-blur-sm">
        <div className="flex justify-center mb-5">
          <img src="/netguard%20login.png" alt="NetGuard login logo" className="auth-logo-float h-32 w-32 object-contain" />
        </div>
        <p className="mb-1 text-xs text-sky-300">Network Security Monitoring System</p>
        <p className="mb-6 text-sm text-slate-400">Create an account</p>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-200 text-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white transition-colors focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white transition-colors focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 pr-12 text-white transition-colors focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-sky-300 transition-colors hover:bg-slate-800 hover:text-sky-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <PasswordIcon hidden={!showPassword} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 pr-12 text-white transition-colors focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-sky-300 transition-colors hover:bg-slate-800 hover:text-sky-200"
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                aria-pressed={showConfirmPassword}
              >
                <PasswordIcon hidden={!showConfirmPassword} />
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-sky-600 py-2.5 font-medium text-white shadow-lg shadow-sky-950/30 transition-colors hover:bg-sky-500 disabled:bg-slate-600"
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-sky-400 hover:underline">
            Sign in
          </Link>
        </p>

        {redirecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/95">
            <LoadingState label="Opening dashboard" />
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
