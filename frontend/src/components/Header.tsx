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
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    position: 'relative' as const,
    zIndex: 100,
    flexShrink: 0,
    boxShadow: 'var(--shadow-xs)',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    minWidth: '200px',
  },
  dateText: {
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-muted)',
    fontWeight: 400,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap' as const,
  },
  homeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: 'var(--radius-sm)',
    transition: 'background var(--transition-fast)',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-secondary)',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    position: 'absolute' as const,
    left: '50%',
    transform: 'translateX(-50%)',
  },
  logo: {
    height: '26px',
    width: '26px',
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    whiteSpace: 'nowrap' as const,
  },
  appLabel: {
    fontSize: '11px',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    marginLeft: '4px',
    padding: '2px 8px',
    background: 'var(--color-primary-ghost)',
    borderRadius: '10px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '200px',
    justifyContent: 'flex-end',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
    boxShadow: '0 2px 6px rgba(230, 57, 70, 0.25)',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '5px 12px',
    fontSize: '11px',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    letterSpacing: '0.5px',
  },
  loginBtn: {
    padding: '6px 16px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
  },
} as const;

interface HeaderProps {
  onHomeClick?: () => void;
  onMenuClick?: () => void;
}

export default function Header({ onHomeClick, onMenuClick }: HeaderProps) {
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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="header-left" style={css.left}>
        <button className="hamburger-btn" onClick={onMenuClick} title="メニュー">
          &#9776;
        </button>
        <span className="header-date" style={css.dateText}>{dateStr}</span>
        <button
          style={css.homeBtn}
          onClick={onHomeClick}
          title="ホーム"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-inset)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          &#x1F3E0;
        </button>
      </div>

      <div className="header-center" style={css.center}>
        <img src="/logo.png" alt="大塚商会" style={css.logo} />
        <span className="header-company-name" style={css.companyName}>大塚商会</span>
        <span style={css.appLabel}>DV</span>
      </div>

      <div className="header-right" style={css.right}>
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
