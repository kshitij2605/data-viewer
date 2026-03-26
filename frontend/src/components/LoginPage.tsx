import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg)',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  decorStripe: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'var(--color-primary)',
  },
  decorCorner: {
    position: 'absolute' as const,
    bottom: '40px',
    right: '40px',
    width: '120px',
    height: '120px',
    border: '2px solid var(--color-border)',
    borderRadius: '50%',
    opacity: 0.3,
  },
  decorCorner2: {
    position: 'absolute' as const,
    bottom: '60px',
    right: '60px',
    width: '80px',
    height: '80px',
    border: '1px solid var(--color-primary)',
    borderRadius: '50%',
    opacity: 0.15,
  },
  card: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    padding: '52px 44px 44px',
    width: '400px',
    maxWidth: '90vw',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
  },
  logoContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '36px',
  },
  logo: {
    width: '72px',
    height: '72px',
    objectFit: 'contain' as const,
    marginBottom: '16px',
  },
  companyName: {
    fontSize: '22px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '3px',
  },
  subtitle: {
    fontSize: '11px',
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    marginTop: '6px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '22px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '7px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    fontFamily: 'var(--font-display)',
  },
  input: {
    padding: '11px 14px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
    fontFamily: 'inherit',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
  },
  button: {
    marginTop: '10px',
    padding: '13px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    letterSpacing: '1.5px',
    cursor: 'pointer',
    transition: 'background var(--transition-normal), transform var(--transition-fast)',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--color-error)',
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
      <div style={styles.decorStripe} />
      <div style={styles.decorCorner} />
      <div style={styles.decorCorner2} />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            x: shake ? [0, -8, 8, -6, 6, -3, 3, 0] : 0,
          }}
          transition={{
            opacity: { duration: 0.5, ease: 'easeOut' },
            y: { duration: 0.5, ease: 'easeOut' },
            scale: { duration: 0.5, ease: 'easeOut' },
            x: { duration: 0.5, ease: 'easeOut' },
          }}
          style={styles.card}
        >
          <div style={styles.cardAccent} />
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
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ghost)';
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
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ghost)';
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
              whileHover={{ scale: 1.01, background: 'var(--color-primary-dark)' }}
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
