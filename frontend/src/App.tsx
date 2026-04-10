import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './stores/authStore.ts';
import { useDocumentStore } from './stores/documentStore.ts';
import { useChunkStore } from './stores/chunkStore.ts';
import LoginPage from './components/LoginPage.tsx';
import Header from './components/Header.tsx';
import Sidebar from './components/Sidebar.tsx';
import Footer from './components/Footer.tsx';
import ChunkTable from './components/ChunkTable.tsx';
import ViewerEditor from './components/ViewerEditor.tsx';
import ThumbnailPanel from './components/ThumbnailPanel.tsx';
import ImageModal from './components/ImageModal.tsx';
import DiffView from './components/DiffView.tsx';
import MarkdownView from './components/MarkdownView.tsx';
import TextOnlyView from './components/TextOnlyView.tsx';
import TablesOnlyView from './components/TablesOnlyView.tsx';
import ImagesOnlyView from './components/ImagesOnlyView.tsx';
import AIReviewView from './components/AIReviewView.tsx';
import PdfViewer from './components/PdfViewer.tsx';
import { getPageMarkdown } from './api/documents.ts';
import { withToken } from './api/client.ts';

const layoutCss = {
  shell: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--color-bg)',
  },
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px',
    gap: '10px',
    overflow: 'hidden',
    minWidth: 0,
  },
} as const;

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const viewMode = useDocumentStore((s) => s.viewMode);
  const selectedDoc = useDocumentStore((s) => s.selectedDocument);

  // Sidebar toggle for mobile overlay
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sidebar collapse for desktop
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(200);

  // Image modal state
  const [imageModal, setImageModal] = useState({ open: false, src: '', alt: '', pageMarkdown: '', pageNum: 0, numPages: 0 });
  // Store image list for navigation in images view
  const imageListRef = useRef<{ src: string; alt: string; pageMarkdown?: string }[]>([]);

  // Diff view state
  const [diffView, setDiffView] = useState<{ open: boolean; chunkId: number | null }>({
    open: false,
    chunkId: null,
  });
  // PDF viewer state
  const [pdfViewer, setPdfViewer] = useState({ open: false });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleImageClick = useCallback((src: string, alt: string, pageMarkdown?: string, pageNum?: number, numPages?: number, imageList?: { src: string; alt: string; pageMarkdown?: string }[]) => {
    imageListRef.current = imageList || [];
    setImageModal({ open: true, src, alt, pageMarkdown: pageMarkdown || '', pageNum: pageNum || 0, numPages: numPages || 0 });
  }, []);

  const handlePageChange = useCallback(async (page: number) => {
    // Image list navigation (no pageMarkdown)
    const list = imageListRef.current;
    if (list.length > 0) {
      const idx = page - 1;
      if (idx >= 0 && idx < list.length) {
        setImageModal((prev) => ({ ...prev, src: list[idx].src, alt: list[idx].alt, pageMarkdown: list[idx].pageMarkdown || '', pageNum: page }));
      }
      return;
    }
    // Page thumbnail navigation
    if (!selectedDoc) return;
    const src = withToken(`/api/documents/${selectedDoc.id}/page/${page}/thumbnail`);
    let md = '';
    try { md = await getPageMarkdown(selectedDoc.id, page); } catch { /* ignore */ }
    setImageModal((prev) => ({ ...prev, src, alt: `Page ${page}`, pageMarkdown: md, pageNum: page }));
  }, [selectedDoc]);

  // Auto-open editor when a chunk is selected
  const selectedChunk = useChunkStore((s) => s.selectedChunk);
  useEffect(() => {
    if (selectedChunk) setEditorOpen(true);
  }, [selectedChunk]);

  // Resizable split between ChunkTable and ViewerEditor
  const [editorOpen, setEditorOpen] = useState(false);
  const [chunkTableFlex, setChunkTableFlex] = useState(3);
  const [editorFlex, setEditorFlex] = useState(2);
  const [isSplitDragging, setIsSplitDragging] = useState(false);

  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsSplitDragging(true);
    const startY = e.clientY;
    const startChunkFlex = chunkTableFlex;
    const startEditorFlex = editorFlex;
    const totalFlex = startChunkFlex + startEditorFlex;

    const container = (e.currentTarget as HTMLElement).parentElement;
    const containerHeight = container?.getBoundingClientRect().height ?? 400;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const deltaRatio = (delta / containerHeight) * totalFlex;
      const newChunk = Math.max(0.5, Math.min(totalFlex - 0.5, startChunkFlex + deltaRatio));
      const newEditor = totalFlex - newChunk;
      setChunkTableFlex(newChunk);
      setEditorFlex(newEditor);
    };

    const onUp = () => {
      setIsSplitDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  }, [chunkTableFlex, editorFlex]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (viewMode) {
      case 'markdown':
        return (
          <motion.div
            key="markdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <MarkdownView onImageClick={handleImageClick} />
          </motion.div>
        );
      case 'text':
        return (
          <motion.div
            key="text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <TextOnlyView />
          </motion.div>
        );
      case 'tables':
        return (
          <motion.div
            key="tables"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <TablesOnlyView onImageClick={handleImageClick} />
          </motion.div>
        );
      case 'images':
        return (
          <motion.div
            key="images"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <ImagesOnlyView onImageClick={handleImageClick} />
          </motion.div>
        );
      case 'ai_review':
        return (
          <motion.div
            key="ai_review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <AIReviewView />
          </motion.div>
        );
      case 'chunks':
      default:
        return (
          <motion.div
            key="chunks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}
          >
            <ThumbnailPanel onImageClick={handleImageClick} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
              <div style={{
                flex: editorOpen ? `${chunkTableFlex} 1 0` : '1 1 0',
                display: 'flex', flexDirection: 'column', minHeight: '80px', overflow: 'hidden',
                transition: isSplitDragging ? 'none' : 'flex 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                <ChunkTable onChunkSelect={() => {}} />
              </div>
              <div
                className="resize-handle"
                style={{ flexShrink: 0, cursor: editorOpen ? 'ns-resize' : undefined, zIndex: 10, display: editorOpen ? undefined : 'none' }}
                onMouseDown={handleSplitDragStart}
              />
              <div style={{
                flex: editorOpen ? `${editorFlex} 1 0` : '0 0 auto',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                transition: isSplitDragging ? 'none' : 'flex 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                <ViewerEditor isOpen={editorOpen} onToggle={() => setEditorOpen((v) => !v)} />
              </div>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div style={layoutCss.shell}>
      <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
      <div style={layoutCss.body}>
        <div
          className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
        <main style={layoutCss.main}>
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </main>
      </div>
      <Footer />

      {/* Global modals */}
      <ImageModal
        open={imageModal.open}
        src={imageModal.src}
        alt={imageModal.alt}
        pageMarkdown={imageModal.pageMarkdown || undefined}
        pageNum={imageModal.pageNum || undefined}
        numPages={imageModal.numPages || undefined}
        onPageChange={handlePageChange}
        onClose={() => { imageListRef.current = []; setImageModal({ open: false, src: '', alt: '', pageMarkdown: '', pageNum: 0, numPages: 0 }); }}
      />
      <DiffView
        open={diffView.open}
        chunkId={diffView.chunkId}
        onClose={() => setDiffView({ open: false, chunkId: null })}
      />
      <PdfViewer
        open={pdfViewer.open}
        documentId={selectedDoc?.id ?? null}
        onClose={() => setPdfViewer({ open: false })}
      />
    </div>
  );
}

export default App;
