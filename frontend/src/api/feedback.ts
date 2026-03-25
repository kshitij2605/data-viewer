import client from './client.ts';

export interface Feedback {
  emoji_type: string | null;
  comment: string | null;
}

export async function setFeedback(
  chunkId: number,
  emojiType: string,
  comment?: string,
): Promise<void> {
  await client.put(`/chunks/${chunkId}/feedback`, {
    emoji_type: emojiType,
    comment: comment ?? '',
  });
}

export async function getFeedback(chunkId: number): Promise<Feedback> {
  const res = await client.get<Feedback>(`/chunks/${chunkId}/feedback`);
  return res.data;
}
