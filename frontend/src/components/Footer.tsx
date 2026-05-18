import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const css = {
  footer: {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 18px',
    background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-raised) 100%)',
    borderTop: '1px solid var(--color-border-light)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--color-success)',
    flexShrink: 0,
    boxShadow: '0 0 8px rgba(45, 159, 111, 0.35)',
  },
  userDetails: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xxs)',
    letterSpacing: '0.4px',
    color: 'var(--color-text-faint)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '3px 5px',
    borderRadius: 'var(--radius-sm)',
    transition: 'all var(--transition-normal)',
    color: 'var(--color-text-muted)',
    display: 'flex',
    alignItems: 'center',
  },
  avatar: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-xxs)',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
    boxShadow: '0 1px 4px rgba(230, 57, 70, 0.15)',
  },
} as const;

interface FooterProps {
  onSettingsClick: () => void;
}

export default function Footer({ onSettingsClick }: FooterProps) {
  const user = useAuthStore((s) => s.user);
  const initial = user?.display_name?.charAt(0) ?? user?.username?.charAt(0) ?? '';

  return (
    <motion.footer
      style={css.footer}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div style={css.left}>
        <span style={css.statusDot} />
        {user && (
          <span className="footer-user-details" style={css.userDetails}>
            <span>{user.username}</span>
            <span style={{ color: 'var(--color-border)', margin: '0 4px' }}>|</span>
            <span>{user.display_name}</span>
          </span>
        )}
      </div>
      <div style={css.right}>
        <button
          style={css.iconBtn}
          title="設定"
          onClick={onSettingsClick}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-inset)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          &#x2699;
        </button>
        {user && (
          <div style={css.avatar}>{initial}</div>
        )}
      </div>
    </motion.footer>
  );
}
