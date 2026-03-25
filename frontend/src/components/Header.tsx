import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function formatJapaneseDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const day = DAY_NAMES[date.getDay()];
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} (${day}) ${h}:${min}`;
}

const css = {
  header: {
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    background: 'var(--color-surface)',
    borderBottom: '2px solid var(--color-primary)',
    position: 'relative' as const,
    zIndex: 100,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    minWidth: '200px',
  },
  dateText: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  homeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 100ms ease',
    display: 'flex',
    alignItems: 'center',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    position: 'absolute' as const,
    left: '50%',
    transform: 'translateX(-50%)',
  },
  logo: {
    height: '28px',
    width: '28px',
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '1.5px',
    whiteSpace: 'nowrap' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '200px',
    justifyContent: 'flex-end',
  },
  loginBtn: {
    padding: '6px 16px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 100ms ease',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--color-text)',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    flexShrink: 0,
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  },
} as const;

interface HeaderProps {
  onHomeClick?: () => void;
}

export default function Header({ onHomeClick }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [dateStr, setDateStr] = useState(() => formatJapaneseDateTime(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setDateStr(formatJapaneseDateTime(new Date()));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const initial = user?.display_name?.charAt(0) ?? user?.username?.charAt(0) ?? 'U';

  return (
    <motion.header
      style={css.header}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div style={css.left}>
        <span style={css.dateText}>{dateStr}</span>
        <button
          style={css.homeBtn}
          onClick={onHomeClick}
          title="ホーム"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          &#x1F3E0;
        </button>
      </div>

      <div style={css.center}>
        <img src="/logo.png" alt="大塚商会" style={css.logo} />
        <span style={css.companyName}>大塚商会</span>
      </div>

      <div style={css.right}>
        {isAuthenticated && user ? (
          <>
            <div style={css.userInfo}>
              <span>{user.display_name || user.username}</span>
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
                e.currentTarget.style.color = 'var(--color-text-secondary)';
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
