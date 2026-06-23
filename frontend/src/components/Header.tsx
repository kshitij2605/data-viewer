import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const css = {
  header: {
    height: '54px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-raised) 100%)',
    borderBottom: '1px solid var(--color-border-light)',
    position: 'relative' as const,
    zIndex: 100,
    flexShrink: 0,
    boxShadow: '0 1px 8px rgba(26, 26, 46, 0.04)',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  logo: {
    height: '34px',
    width: '34px',
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '3px',
    whiteSpace: 'nowrap' as const,
  },
  appLabel: {
    fontSize: 'var(--text-xxs)',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-primary)',
    letterSpacing: '1.5px',
    padding: '3px 12px',
    background: 'var(--color-primary-ghost)',
    borderRadius: 'var(--radius-full)',
    textTransform: 'uppercase' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    minWidth: '200px',
    justifyContent: 'flex-end',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(230, 57, 70, 0.2), 0 0 0 2px rgba(230, 57, 70, 0.06)',
    transition: 'transform var(--transition-normal), box-shadow var(--transition-normal)',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '5px 14px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    letterSpacing: '0.5px',
  },
  loginBtn: {
    padding: '7px 18px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all var(--transition-normal)',
    boxShadow: '0 2px 8px rgba(230, 57, 70, 0.2)',
  },
  themeTrack: {
    width: '52px',
    height: '28px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'background 400ms ease',
    padding: 0,
    outline: 'none',
  },
  themeKnob: {
    position: 'absolute' as const,
    top: '3px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    transition: 'left 400ms cubic-bezier(0.68, -0.15, 0.27, 1.15)',
  },
} as const;

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuthStore();

  const initial = user?.display_name?.charAt(0) ?? user?.username?.charAt(0) ?? 'U';

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <motion.header
      style={css.header}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="header-left" style={css.left}>
        <button className="hamburger-btn" onClick={onMenuClick} title="メニュー">
          &#9776;
        </button>
        <span className="header-company-name" style={css.companyName}>Data Viewer</span>
      </div>

      <div className="header-right" style={css.right}>
        <button
          style={{
            ...css.themeTrack,
            background: theme === 'dark' ? '#1a1a2e' : '#ccc8be',
          }}
          onClick={toggleTheme}
          title={theme === 'light' ? 'ダークモード' : 'ライトモード'}
          aria-label="Toggle theme"
        >
          <div style={{
            ...css.themeKnob,
            left: theme === 'dark' ? '27px' : '3px',
          }}>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke={theme === 'dark' ? '#c4b581' : '#e6a000'}
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                transform: theme === 'dark' ? 'rotate(40deg)' : 'rotate(90deg)',
                transition: 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <mask id="moon-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <circle
                  cx={theme === 'dark' ? '12' : '30'}
                  cy={theme === 'dark' ? '4' : '0'}
                  r="9"
                  fill="black"
                  style={{ transition: 'cx 450ms ease, cy 450ms ease' }}
                />
              </mask>
              <circle
                cx="12" cy="12"
                r={theme === 'dark' ? 9 : 5}
                fill={theme === 'dark' ? '#c4b581' : '#e6a000'}
                mask="url(#moon-mask)"
                style={{ transition: 'r 450ms ease, fill 450ms ease' }}
              />
              <g
                stroke={theme === 'dark' ? '#c4b581' : '#e6a000'}
                style={{
                  opacity: theme === 'dark' ? 0 : 1,
                  transition: 'opacity 300ms ease',
                }}
              >
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </g>
            </svg>
          </div>
        </button>
        {isAuthenticated && user ? (
          <>
            <div style={css.userInfo}>
              <span className="user-display-name">{user.display_name || user.username}</span>
            </div>
            <div style={css.avatar}>{initial}</div>
            <button
              style={css.logoutBtn}
              onClick={logout}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.color = 'var(--color-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.color = 'var(--color-text-muted)';
              }}
            >
              ログアウト
            </button>
          </>
        ) : (
          <button style={css.loginBtn}>ログイン</button>
        )}
      </div>
    </motion.header>
  );
}
