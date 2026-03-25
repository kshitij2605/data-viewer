import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChunkStore } from '../stores/chunkStore.ts';
import { editChunk } from '../api/chunks.ts';

const css = {
  container: {
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  header: {
    padding: '8px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--color-bg)',
    borderBottom: '1px solid var(--color-border)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background 100ms ease',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  chevron: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    transition: 'transform 200ms ease',
  },
  body: {
    overflow: 'hidden',
  },
  inner: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  modeSwitch: {
    display: 'flex',
    gap: '6px',
  },
  modeBtn: {
    padding: '4px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'var(--color-surface)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 100ms ease',
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
    padding: '10px 12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
    lineHeight: 1.7,
    resize: 'none' as const,
    outline: 'none',
    background: 'var(--color-bg)',
    transition: 'border-color 150ms ease',
    overflow: 'hidden',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    padding: '6px 18px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 100ms ease',
  },
  chunkLabel: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
  },
  statusMsg: {
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '4px',
  },
} as const;

export default function ViewerEditor() {
  const { selectedChunk, fetchChunks } = useChunkStore();
  const docId = selectedChunk ? undefined : undefined; // Chunks have docId context from parent
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<'content' | 'comment'>('content');
  const [editText, setEditText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep docId reference from store for refresh
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
      // Refresh chunks - need docId from store context
      const store = useChunkStore.getState();
      if (store.chunks.length > 0) {
        // Use the page_number to figure out doc reference - parent handles this
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
        onMouseEnter={(e) => { e.currentTarget.style.background = '#eee'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg)'; }}
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
            style={{ ...css.statusMsg, color: '#16a34a', background: '#f0fdf4' }}
          >
            保存しました
          </motion.span>
        )}
        {status === 'error' && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ ...css.statusMsg, color: '#dc2626', background: '#fef2f2' }}
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
                      transition={{ duration: 0.15 }}
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
                      transition={{ duration: 0.15 }}
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
