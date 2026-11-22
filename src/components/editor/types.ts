import type { Access, ShareRole } from "@/lib/access";

export type AttachmentDTO = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { name: string };
};

export type ShareDTO = { role: ShareRole; user: { id: string; email: string; name: string } };

export type DocumentDTO = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  access: Access;
  owner: { id: string; name: string; email: string };
};
