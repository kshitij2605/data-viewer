import { create } from 'zustand';
import * as docApi from '../api/documents.ts';
import type { Document } from '../api/documents.ts';

type ViewMode = 'chunks' | 'markdown' | 'text' | 'tables' | 'images';

interface DocumentState {
  documents: Document[];
  selectedDocument: Document | null;
  viewMode: ViewMode;
  loadDocuments: () => Promise<void>;
  deleteDocument: (id: number) => Promise<void>;
  setDocument: (doc: Document | null) => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  selectedDocument: null,
  viewMode: 'chunks',

  loadDocuments: async () => {
    const documents = await docApi.listDocuments();
    set({ documents });
  },

  deleteDocument: async (id: number) => {
    await docApi.deleteDocument(id);
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
      selectedDocument: state.selectedDocument?.id === id ? null : state.selectedDocument,
    }));
  },

  setDocument: (doc: Document | null) => {
    set({ selectedDocument: doc });
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },
}));
