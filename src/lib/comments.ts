import { z } from "zod";

export const commentSelect = {
  id: true,
  body: true,
  quote: true,
  resolvedAt: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} as const;

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty.")
    .max(2000, "Comment must be at most 2000 characters."),
  quote: z
    .string()
    .trim()
    .max(500, "Quoted text must be at most 500 characters.")
    .nullish()
    .transform((q) => (q ? q : null)),
});

export const updateCommentSchema = z.object({ resolved: z.boolean() });
