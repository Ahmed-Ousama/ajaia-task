declare module "html-to-docx" {
  export default function HTMLtoDOCX(
    html: string,
    headerHTML?: string | null,
    options?: Record<string, unknown>,
    footerHTML?: string | null,
  ): Promise<Buffer | Blob>;
}
