import { z } from "zod";

import { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH } from "@/lib/validation-limits";

export { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH };

const title = z
  .string()
  .trim()
  .min(1, "Title can't be empty.")
  .max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters.`);

export const createDocumentSchema = z.object({ title: title.optional() });

export const updateDocumentSchema = z
  .object({
    title: title.optional(),
    content: z
      .string()
      .refine((s) => Buffer.byteLength(s, "utf8") <= MAX_CONTENT_BYTES, "Document is too large to save (max 2 MB).")
      .optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, "Nothing to update.");

export const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["VIEWER", "EDITOR"]).default("EDITOR"),
});

export const updateShareSchema = z.object({ role: z.enum(["VIEWER", "EDITOR"]) });
