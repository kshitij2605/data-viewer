import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getMarkdown } from '../api/documents.ts';
import { withToken } from '../api/client.ts';

const css = {
  container: {
    flex: 1,
    display: 'flex',
    gap: '0',
    overflow: 'hidden',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-sm)',
  },
  leftPane: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    minWidth: 0,
  },
  rightPane: {
    flexShrink: 0,
    overflow: 'hidden',
    padding: '16px',
    background: 'var(--color-surface-inset)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0',
  },
  rightLabel: {
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    marginBottom: '8px',
    flexShrink: 0,
  },
  pageThumb: {
    width: '100%',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-raised)',
    cursor: 'pointer',
    transition: 'box-shadow var(--transition-normal)',
    display: 'block',
  },
  pageLabel: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-faint)',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    fontSize: 'var(--text-base)',
    lineHeight: 1.8,
    color: 'var(--color-text)',
  },
  loading: {
    padding: '48px',
    textAlign: 'center' as const,
    color: 'var(--color-text-faint)',
    fontSize: 'var(--text-base)',
  },
  error: {
    padding: '24px',
    textAlign: 'center' as const,
    color: 'var(--color-error)',
    fontSize: 'var(--text-base)',
  },
  pageSectionDivider: {
    border: 'none',
    borderTop: '1px solid var(--color-border)',
    margin: '1.2em 0',
  },
} as const;

const markdownStyles = `
.md-content h1 { font-size: 1.5em; font-weight: 700; font-family: var(--font-display); margin: 1.2em 0 0.5em; color: var(--color-text); border-bottom: 2px solid var(--color-border); padding-bottom: 0.3em; }
.md-content h2 { font-size: 1.3em; font-weight: 700; font-family: var(--font-display); margin: 0.8em 0 0.4em; color: var(--color-text); }
.md-content h3 { font-size: 1.1em; font-weight: 600; font-family: var(--font-display); margin: 0.6em 0 0.3em; }
.md-content p { margin: 0.5em 0; }
.md-content ul, .md-content ol { margin: 0.5em 0; padding-left: 1.5em; }
.md-content li { margin: 0.2em 0; }
.md-content table { border-collapse: collapse; margin: 1em 0; width: 100%; font-size: 13px; }
.md-content th, .md-content td { border: 1px solid var(--color-border); padding: 8px 12px; text-align: left; }
.md-content th { background: var(--color-surface-raised); font-weight: 600; font-family: var(--font-display); }
.md-content code { background: var(--color-surface-inset); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.9em; font-family: var(--font-mono); }
.md-content pre { background: var(--color-surface-inset); padding: 14px 18px; border-radius: var(--radius-md); overflow-x: auto; margin: 0.5em 0; border: 1px solid var(--color-border-light); }
.md-content pre code { background: transparent; padding: 0; }
.md-content blockquote { border-left: 3px solid var(--color-primary); padding-left: 14px; margin: 0.5em 0; color: var(--color-text-secondary); }
.md-content img { max-width: 100%; border-radius: var(--radius-sm); cursor: pointer; transition: box-shadow var(--transition-normal); margin: 0.5em 0; }
.md-content img:hover { box-shadow: var(--shadow-md); }
.md-content a { color: var(--color-primary); text-decoration: underline; }
.md-content hr { border: none; border-top: 1px solid var(--color-border); margin: 1.2em 0; }
`;

interface MarkdownViewProps {
  onImageClick?: (src: string, alt: string, pageMarkdown?: string, pageNum?: number, numPages?: number) => void;
}

export default function MarkdownView({ onImageClick }: MarkdownViewProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rightWidth, setRightWidth] = useState(360);
  const [isDragging, setIsDragging] = useState(false);
  const [activePage, setActivePage] = useState(1);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const thumbRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const programmaticScroll = useRef(false);

  const numPages = doc?.num_pages ?? 0;

  // Split content into per-page sections (same delimiter as backend)
  const pageSections = useMemo(() => {
    if (!content) return [];
    return content.split(/\n---\s*\n?/);
  }, [content]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(200, Math.min(800, startWidth + delta)));
    };
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, [rightWidth]);

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    setActivePage(1);
    getMarkdown(doc.id)
      .then(setContent)
      .catch(() => setError('Markdownの取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [doc]);

  // Scroll handler: find the last section whose top is at or above the scroll viewport top
  useEffect(() => {
    const leftPane = leftPaneRef.current;
    if (!leftPane || pageSections.length === 0) return;

    const handleScroll = () => {
      const paneTop = leftPane.getBoundingClientRect().top;
      let current = 1;
      for (const [page, el] of sectionRefs.current) {
        const elTop = el.getBoundingClientRect().top - paneTop;
        // Section whose top has scrolled past (or is at) the viewport top
        if (elTop <= 20) {
          current = page;
        }
      }
      setActivePage(current);
    };

    leftPane.addEventListener('scroll', handleScroll, { passive: true });
    return () => leftPane.removeEventListener('scroll', handleScroll);
  }, [pageSections]);

  // Smoothly scroll the right pane thumbnail into view when activePage changes
  useEffect(() => {
    const thumbEl = thumbRefs.current.get(activePage);
    if (thumbEl && rightPaneRef.current) {
      programmaticScroll.current = true;
      thumbEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { programmaticScroll.current = false; }, 500);
    }
  }, [activePage]);

  if (!doc) {
    return <div style={css.loading}>ドキュメントを選択してください。</div>;
  }

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <motion.div
      style={css.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <style>{markdownStyles}</style>

      {/* Left: Markdown text split by page */}
      <div style={css.leftPane} ref={leftPaneRef}>
        {loading ? (
          <div style={css.loading}>読み込み中...</div>
        ) : error ? (
          <div style={css.error}>{error}</div>
        ) : (
          <div className="md-content" style={css.content}>
            {pageSections.map((section, idx) => {
              const pageNum = idx + 1;
              return (
                <div
                  key={idx}
                  data-page={pageNum}
                  ref={(el) => { if (el) sectionRefs.current.set(pageNum, el); else sectionRefs.current.delete(pageNum); }}
                >
                  {idx > 0 && <hr style={css.pageSectionDivider} />}
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({ src, alt, ...props }) => (
                        <img
                          src={src}
                          alt={alt || ''}
                          {...props}
                          onClick={() => onImageClick?.(src || '', alt || '')}
                        />
                      ),
                    }}
                  >
                    {section}
                  </Markdown>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Draggable divider */}
      <div
        style={{
          width: '5px',
          flexShrink: 0,
          background: isDragging ? 'var(--color-primary)' : 'var(--color-border)',
          cursor: 'ew-resize',
          transition: isDragging ? 'none' : 'background var(--transition-fast)',
        }}
        onMouseDown={handleDragStart}
        onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = 'var(--color-text-muted)'; }}
        onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = 'var(--color-border)'; }}
      />

      {/* Right: Single active page with smooth crossfade */}
      <div style={{ ...css.rightPane, width: rightWidth }} ref={rightPaneRef}>
        <div style={css.rightLabel}>PDF ページ</div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pages.map((p) => {
            const src = withToken(`/api/documents/${doc.id}/layout-thumbnail/${p}`);
            const isActive = p === activePage;
            return (
              <div
                key={p}
                ref={(el) => { if (el) thumbRefs.current.set(p, el); else thumbRefs.current.delete(p); }}
                style={{
                  transition: 'opacity 300ms ease, transform 300ms ease',
                  opacity: isActive ? 1 : 0.4,
                  transform: isActive ? 'scale(1)' : 'scale(0.95)',
                }}
              >
                <img
                  src={src}
                  alt={`Page ${p}`}
                  style={{
                    ...css.pageThumb,
                    borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: isActive ? '0 0 0 2px var(--color-primary-ghost), 0 4px 16px rgba(230,57,70,0.12)' : 'none',
                    transition: 'border-color 300ms ease, box-shadow 300ms ease',
                  }}
                  onClick={() => onImageClick?.(src, `Page ${p}`, undefined, p, numPages)}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = isActive
                      ? '0 0 0 2px var(--color-primary-ghost), 0 4px 16px rgba(230,57,70,0.12)'
                      : 'none';
                  }}
                />
                <div style={css.pageLabel}>Page {p}</div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
