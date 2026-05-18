import { create } from 'zustand';
import * as chunkApi from '../api/chunks.ts';
import type { Chunk, ChunkParams } from '../api/chunks.ts';

const PER_PAGE = 15;

interface ChunkState {
  chunks: Chunk[];
  selectedChunk: Chunk | null;
  searchQuery: string;
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  chunkingStrategy: string | null;
  chunkingDocId: number | null;
  isChunking: boolean;
  // Evaluation state — stored here so it survives ChunkTable remounts (view switches)
  isEvaluating: boolean;
  evalDocId: number | null;
  evalProgress: { completed: number; total: number };
  setIsEvaluating: (v: boolean) => void;
  setEvalDocId: (id: number | null) => void;
  setEvalProgress: (p: { completed: number; total: number }) => void;
  setChunk: (chunk: Chunk | null) => void;
  setSearch: (query: string) => void;
  setPage: (page: number) => void;
  updateChunkEval: (chunkId: number, data: { rag_score?: number | null; faq_score?: number | null; ai_suggestion?: string | null }) => void;
  clearChunks: (docId: number) => Promise<void>;
  removeChunk: (chunkId: number) => Promise<{ es_synced: boolean }>;
  fetchChunks: (docId: number) => Promise<void>;
  triggerChunking: (
    docId: number,
    strategy: string,
    params?: Partial<Omit<ChunkParams, 'strategy'>>,
  ) => Promise<{ task_id?: string } | null>;
}

export const useChunkStore = create<ChunkState>((set, get) => ({
  chunks: [],
  selectedChunk: null,
  searchQuery: '',
  page: 1,
  totalPages: 1,
  total: 0,
  perPage: PER_PAGE,
  chunkingStrategy: null,
  chunkingDocId: null,
  isChunking: false,
  isEvaluating: false,
  evalDocId: null,
  evalProgress: { completed: 0, total: 0 },

  setIsEvaluating: (v) => set({ isEvaluating: v }),
  setEvalDocId: (id) => set({ evalDocId: id }),
  setEvalProgress: (p) => set({ evalProgress: p }),

  setChunk: (chunk: Chunk | null) => {
    set({ selectedChunk: chunk });
  },

  setSearch: (query: string) => {
    set({ searchQuery: query, page: 1 });
  },

  setPage: (page: number) => {
    set({ page });
  },

  clearChunks: async (docId: number) => {
    await chunkApi.deleteAllChunks(docId);
    set({ chunks: [], selectedChunk: null, total: 0, page: 1, totalPages: 1, searchQuery: '' });
  },

  removeChunk: async (chunkId: number) => {
    const result = await chunkApi.deleteChunk(chunkId);
    set((state) => ({
      chunks: state.chunks.filter((c) => c.id !== chunkId),
      selectedChunk: state.selectedChunk?.id === chunkId ? null : state.selectedChunk,
      total: state.total - 1,
    }));
    return result;
  },

  updateChunkEval: (chunkId, data) => {
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId ? { ...c, ...data } : c,
      ),
    }));
  },

  fetchChunks: async (docId: number) => {
    const { searchQuery, page, perPage } = get();
    const res = await chunkApi.getChunks(docId, {
      search: searchQuery || undefined,
      page,
      per_page: perPage,
    });
    set({
      chunks: res.chunks,
      total: res.total,
      page: res.page,
      totalPages: Math.max(1, Math.ceil(res.total / res.per_page)),
    });
  },

  triggerChunking: async (
    docId: number,
    strategy: string,
    params?: Partial<Omit<ChunkParams, 'strategy'>>,
  ) => {
    set({ isChunking: true, chunkingStrategy: strategy, chunkingDocId: docId });
    try {
      const result = await chunkApi.triggerChunking(docId, {
        strategy,
        ...params,
      });

      // Synchronous result (array of chunks) — refresh immediately
      if (Array.isArray(result)) {
        set({ page: 1, searchQuery: '' });
        const { page, perPage } = get();
        const res = await chunkApi.getChunks(docId, {
          page,
          per_page: perPage,
        });
        set({
          chunks: res.chunks,
          total: res.total,
          totalPages: Math.max(1, Math.ceil(res.total / res.per_page)),
          isChunking: false,
        });
        return null;
      }

      // Async result (semantic) — return task_id for caller to track progress
      return result as { task_id?: string };
    } catch (err) {
      set({ isChunking: false });
      throw err;
    }
  },
}));
