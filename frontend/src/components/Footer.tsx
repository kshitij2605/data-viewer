import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore.ts';

const css = {
  footer: {
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    background: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--color-success)',
    flexShrink: 0,
    boxShadow: '0 0 6px rgba(45, 159, 111, 0.4)',
  },
  userDetails: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.3px',
    color: 'var(--color-text-muted)',
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
    padding: '2px 4px',
    borderRadius: 'var(--radius-sm)',
    transition: 'background var(--transition-fast)',
    color: 'var(--color-text-muted)',
    display: 'flex',
    alignItems: 'center',
  },
  avatar: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
} as const;

export default function Footer() {
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
