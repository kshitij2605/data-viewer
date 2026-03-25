import { create } from 'zustand';
import * as docApi from '../api/documents.ts';
import type { Document } from '../api/documents.ts';

type ViewMode = 'chunks' | 'markdown' | 'text' | 'tables' | 'images';

interface DocumentState {
  documents: Document[];
  selectedDocument: Document | null;
  viewMode: ViewMode;
  loadDocuments: () => Promise<void>;
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

  setDocument: (doc: Document | null) => {
    set({ selectedDocument: doc });
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },
}));
