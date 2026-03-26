import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChunkStore } from '../stores/chunkStore.ts';
import { editChunk } from '../api/chunks.ts';

const css = {
  container: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    flexShrink: 0,
    boxShadow: 'var(--shadow-xs)',
  },
  header: {
    padding: '9px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--color-surface-raised)',
    borderBottom: '1px solid var(--color-border)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background var(--transition-fast)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
  },
  chevron: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    transition: 'transform 200ms ease',
  },
  body: {
    overflow: 'hidden',
  },
  inner: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  modeSwitch: {
    display: 'flex',
    gap: '6px',
  },
  modeBtn: {
    padding: '5px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    transition: 'all var(--transition-fast)',
    color: 'var(--color-text-secondary)',
  },
  modeBtnActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
    fontWeight: 600,
  },
  textarea: {
    width: '100%',
    minHeight: '100px',
    padding: '12px 14px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontFamily: 'inherit',
    lineHeight: 1.7,
    resize: 'none' as const,
    outline: 'none',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text)',
    transition: 'border-color var(--transition-normal)',
    overflow: 'hidden',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    padding: '7px 20px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
    letterSpacing: '0.3px',
  },
  chunkLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    fontFamily: 'var(--font-mono)',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '12px',
  },
  statusMsg: {
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
  },
} as const;

export default function ViewerEditor() {
  const { selectedChunk, fetchChunks } = useChunkStore();
  const docId = selectedChunk ? undefined : undefined;
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<'content' | 'comment'>('content');
  const [editText, setEditText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const _docIdRef = useRef<number | undefined>(docId);

  useEffect(() => {
    if (selectedChunk) {
      setEditText(selectedChunk.content);
      setCommentText(selectedChunk.feedback_comment || '');
      setStatus('idle');
    }
  }, [selectedChunk]);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(100, ta.scrollHeight)}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [editText, commentText, mode, autoResize]);

  const handleSave = async () => {
    if (!selectedChunk) return;
    setSaving(true);
    setStatus('idle');
    try {
      await editChunk(selectedChunk.id, editText);
      setStatus('saved');
      const store = useChunkStore.getState();
      if (store.chunks.length > 0) {
        void fetchChunks;
      }
      _docIdRef.current = undefined;
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.container}>
      <div
        style={css.header}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-inset)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface-raised)'; }}
      >
        <div style={css.headerLeft}>
          <span
            style={{
              ...css.chevron,
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            &#9654;
          </span>
          <span>Viewer and Editor</span>
          {selectedChunk && (
            <span style={css.chunkLabel}>
              &mdash; Chunk #{selectedChunk.chunk_index + 1}
            </span>
          )}
        </div>
        {status === 'saved' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ ...css.statusMsg, color: 'var(--color-success)', background: '#f0fdf4' }}
          >
            保存しました
          </motion.span>
        )}
        {status === 'error' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ ...css.statusMsg, color: 'var(--color-error)', background: '#fef2f2' }}
          >
            保存に失敗しました
          </motion.span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="editor-body"
            style={css.body}
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {!selectedChunk ? (
              <div style={css.emptyState}>
                チャンクを選択するとここに内容が表示されます。
              </div>
            ) : (
              <div style={css.inner}>
                <div style={css.modeSwitch}>
                  <button
                    style={{
                      ...css.modeBtn,
                      ...(mode === 'content' ? css.modeBtnActive : {}),
                    }}
                    onClick={() => setMode('content')}
                  >
                    コンテンツ編集
                  </button>
                  <button
                    style={{
                      ...css.modeBtn,
                      ...(mode === 'comment' ? css.modeBtnActive : {}),
                    }}
                    onClick={() => setMode('comment')}
                  >
                    FBコメント
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {mode === 'content' ? (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <textarea
                        ref={textareaRef}
                        style={css.textarea}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="comment"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <textarea
                        style={{ ...css.textarea, minHeight: '80px' }}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="フィードバックコメントを入力..."
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={css.actions}>
                  <button
                    style={{
                      ...css.saveBtn,
                      opacity: saving ? 0.7 : 1,
                    }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
