/** Limits shared by server validation and client inputs (no server-only imports). */
export const MAX_TITLE_LENGTH = 200;
/** Serialized HTML cap — generous for text documents, stops accidental giant payloads. */
export const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
