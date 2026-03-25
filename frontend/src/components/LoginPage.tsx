import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #f8f9fa 100%)',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  decorLine: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'linear-gradient(90deg, transparent 0%, var(--color-primary) 30%, var(--color-primary) 70%, transparent 100%)',
  },
  card: {
    background: 'var(--color-surface)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
    padding: '48px 40px 40px',
    width: '380px',
    maxWidth: '90vw',
    position: 'relative' as const,
    borderTop: '3px solid var(--color-primary)',
  },
  logoContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '32px',
  },
  logo: {
    width: '80px',
    height: '80px',
    objectFit: 'contain' as const,
    marginBottom: '12px',
  },
  companyName: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '2px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    marginTop: '4px',
    letterSpacing: '1px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '10px 14px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
    fontFamily: 'inherit',
    background: 'var(--color-bg)',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '1px',
    cursor: 'pointer',
    transition: 'background 150ms ease, transform 100ms ease',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#dc2626',
  },
} as const;

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
    } catch {
      setError('ログインに失敗しました。ユーザー名またはパスワードを確認してください。');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.decorLine} />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            x: shake ? [0, -8, 8, -6, 6, -3, 3, 0] : 0,
          }}
          transition={{
            opacity: { duration: 0.4, ease: 'easeOut' },
            y: { duration: 0.4, ease: 'easeOut' },
            scale: { duration: 0.4, ease: 'easeOut' },
            x: { duration: 0.5, ease: 'easeOut' },
          }}
          style={styles.card}
        >
          <div style={styles.logoContainer}>
            <img src="/logo.png" alt="大塚商会" style={styles.logo} />
            <span style={styles.companyName}>大塚商会</span>
            <span style={styles.subtitle}>Data Viewer</span>
          </div>

          <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>ユーザー名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                placeholder="username"
                autoComplete="username"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,57,70,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="password"
                autoComplete="current-password"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,57,70,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={styles.errorBox}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              style={{
                ...styles.button,
                opacity: isLoading ? 0.7 : 1,
              }}
              whileHover={{ scale: 1.02, background: 'var(--color-primary-dark)' }}
              whileTap={{ scale: 0.98 }}
              disabled={isLoading}
            >
              {isLoading ? 'ログイン中...' : 'ログイン'}
            </motion.button>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
