import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { setFeedback } from '../api/feedback.ts';
import { useChunkStore } from '../stores/chunkStore.ts';

const EMOJIS = [
  { emoji: '\u2705', label: '正確', type: 'correct' },
  { emoji: '\u274C', label: '不正確', type: 'incorrect' },
  { emoji: '\u270F\uFE0F', label: '要修正', type: 'needs_edit' },
  { emoji: '\u2753', label: '不明', type: 'unclear' },
  { emoji: '\u26A0\uFE0F', label: '注意', type: 'warning' },
];

const css = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1500,
  },
  popover: {
    position: 'absolute' as const,
    background: 'var(--color-surface)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    padding: '12px',
    border: '1px solid var(--color-border)',
    zIndex: 1501,
  },
  emojiRow: {
    display: 'flex',
    gap: '6px',
  },
  emojiBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 100ms ease',
    position: 'relative' as const,
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--color-text)',
    color: '#fff',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    whiteSpace: 'nowrap' as const,
    marginBottom: '4px',
    pointerEvents: 'none' as const,
  },
} as const;

interface FeedbackPickerProps {
  open: boolean;
  chunkId: number | null;
  anchorRect?: DOMRect | null;
  onClose: () => void;
}

export default function FeedbackPicker({ open, chunkId, anchorRect, onClose }: FeedbackPickerProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const fetchChunks = useChunkStore((s) => s.fetchChunks);

  const handleSelect = async (type: string) => {
    if (!chunkId) return;
    try {
      await setFeedback(chunkId, type);
      // Try to refresh - best effort
      void fetchChunks;
    } catch {
      // silent
    }
    onClose();
  };

  const top = anchorRect ? anchorRect.bottom + 8 : 200;
  const left = anchorRect ? anchorRect.left : 200;

  return (
    <AnimatePresence>
      {open && (
        <>
          <div style={css.overlay} onClick={onClose} />
          <motion.div
            style={{
              ...css.popover,
              top: `${top}px`,
              left: `${left}px`,
            }}
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <div style={css.emojiRow}>
              {EMOJIS.map((item, idx) => (
                <motion.button
                  key={item.type}
                  style={css.emojiBtn}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 20,
                    delay: idx * 0.04,
                  }}
                  whileHover={{
                    scale: 1.15,
                    borderColor: 'var(--color-primary)',
                    background: 'var(--color-bg)',
                  }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleSelect(item.type)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {item.emoji}
                  <AnimatePresence>
                    {hoveredIdx === idx && (
                      <motion.span
                        style={css.tooltip}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
