import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './stores/authStore.ts';
import { useDocumentStore } from './stores/documentStore.ts';
import LoginPage from './components/LoginPage.tsx';
import Header from './components/Header.tsx';
import Sidebar from './components/Sidebar.tsx';
import Footer from './components/Footer.tsx';
import ChunkTable from './components/ChunkTable.tsx';
import ViewerEditor from './components/ViewerEditor.tsx';
import ThumbnailPanel from './components/ThumbnailPanel.tsx';
import ImageModal from './components/ImageModal.tsx';
import FeedbackPicker from './components/FeedbackPicker.tsx';
import DiffView from './components/DiffView.tsx';
import MarkdownView from './components/MarkdownView.tsx';
import TextOnlyView from './components/TextOnlyView.tsx';
import TablesOnlyView from './components/TablesOnlyView.tsx';
import ImagesOnlyView from './components/ImagesOnlyView.tsx';
import PdfViewer from './components/PdfViewer.tsx';
import type { Chunk } from './api/chunks.ts';

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

  // Image modal state
  const [imageModal, setImageModal] = useState({ open: false, src: '', alt: '' });
  // Feedback picker state
  const [feedbackPicker, setFeedbackPicker] = useState<{
    open: boolean;
    chunkId: number | null;
    rect: DOMRect | null;
  }>({ open: false, chunkId: null, rect: null });
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

  const handleImageClick = useCallback((src: string, alt: string) => {
    setImageModal({ open: true, src, alt });
  }, []);

  const handleFeedbackClick = useCallback((chunk: Chunk) => {
    setFeedbackPicker({ open: true, chunkId: chunk.id, rect: null });
  }, []);

  const handleHomeClick = useCallback(() => {
    useDocumentStore.getState().setViewMode('chunks');
  }, []);

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
            <TablesOnlyView />
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
            <ChunkTable
              onChunkSelect={() => {}}
              onFeedbackClick={handleFeedbackClick}
            />
            <ViewerEditor />
          </motion.div>
        );
    }
  };

  return (
    <div style={layoutCss.shell}>
      <Header onHomeClick={handleHomeClick} onMenuClick={() => setSidebarOpen((v) => !v)} />
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
        onClose={() => setImageModal({ open: false, src: '', alt: '' })}
      />
      <FeedbackPicker
        open={feedbackPicker.open}
        chunkId={feedbackPicker.chunkId}
        anchorRect={feedbackPicker.rect}
        onClose={() => setFeedbackPicker({ open: false, chunkId: null, rect: null })}
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
