import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocumentStore } from '../stores/documentStore.ts';
import { getMarkdown } from '../api/documents.ts';

const css = {
  container: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    background: 'var(--color-surface)',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    fontSize: '14px',
    lineHeight: 1.8,
    color: 'var(--color-text)',
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
  },
  error: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#dc2626',
    fontSize: '13px',
  },
} as const;

const markdownStyles = `
.md-content h1 { font-size: 1.5em; font-weight: 700; margin: 1em 0 0.5em; color: var(--color-text); border-bottom: 2px solid var(--color-border); padding-bottom: 0.3em; }
.md-content h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.4em; color: var(--color-text); }
.md-content h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
.md-content p { margin: 0.5em 0; }
.md-content ul, .md-content ol { margin: 0.5em 0; padding-left: 1.5em; }
.md-content li { margin: 0.2em 0; }
.md-content table { border-collapse: collapse; margin: 1em 0; width: 100%; font-size: 13px; }
.md-content th, .md-content td { border: 1px solid var(--color-border); padding: 8px 12px; text-align: left; }
.md-content th { background: var(--color-bg); font-weight: 600; }
.md-content code { background: var(--color-bg); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
.md-content pre { background: var(--color-bg); padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
.md-content pre code { background: transparent; padding: 0; }
.md-content blockquote { border-left: 3px solid var(--color-primary); padding-left: 12px; margin: 0.5em 0; color: var(--color-text-secondary); }
.md-content img { max-width: 100%; border-radius: 4px; cursor: pointer; transition: box-shadow 100ms ease; margin: 0.5em 0; }
.md-content img:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.md-content a { color: var(--color-primary); text-decoration: underline; }
.md-content hr { border: none; border-top: 1px solid var(--color-border); margin: 1em 0; }
`;

interface MarkdownViewProps {
  onImageClick?: (src: string, alt: string) => void;
}

export default function MarkdownView({ onImageClick }: MarkdownViewProps) {
  const doc = useDocumentStore((s) => s.selectedDocument);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    setError('');
    getMarkdown(doc.id)
      .then(setContent)
      .catch(() => setError('Markdownの取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [doc]);

  if (!doc) {
    return <div style={css.loading}>ドキュメントを選択してください。</div>;
  }

  return (
    <motion.div
      style={css.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <style>{markdownStyles}</style>
      {loading ? (
        <div style={css.loading}>読み込み中...</div>
      ) : error ? (
        <div style={css.error}>{error}</div>
      ) : (
        <div className="md-content" style={css.content}>
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
            {content}
          </Markdown>
        </div>
      )}
    </motion.div>
  );
}
