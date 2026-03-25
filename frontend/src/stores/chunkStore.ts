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
  isChunking: boolean;
  setChunk: (chunk: Chunk | null) => void;
  setSearch: (query: string) => void;
  setPage: (page: number) => void;
  fetchChunks: (docId: number) => Promise<void>;
  triggerChunking: (
    docId: number,
    strategy: string,
    params?: Partial<Omit<ChunkParams, 'strategy'>>,
  ) => Promise<void>;
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
  isChunking: false,

  setChunk: (chunk: Chunk | null) => {
    set({ selectedChunk: chunk });
  },

  setSearch: (query: string) => {
    set({ searchQuery: query, page: 1 });
  },

  setPage: (page: number) => {
    set({ page });
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
    set({ isChunking: true, chunkingStrategy: strategy });
    try {
      const result = await chunkApi.triggerChunking(docId, {
        strategy,
        ...params,
      });

      // If synchronous result (array of chunks), refresh
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
      }
      // For async (semantic), the caller should use subscribeChunkStatus
      // and call fetchChunks when complete
    } catch (err) {
      set({ isChunking: false });
      throw err;
    }
  },
}));
