import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { attachmentSelect, loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, HttpError, requireApiUser } from "@/lib/http";
import { ATTACHMENT_EXTENSIONS, isAttachable } from "@/lib/files";
import { putObject } from "@/lib/storage";
import { readUpload, storageKeyFor } from "@/lib/upload";
import { checkDuplicate, numberedFilename } from "@/lib/duplicates";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.manageAttachments(access)) throw forbidden("You have view-only access to this document.");

  const upload = await readUpload(req, isAttachable, ATTACHMENT_EXTENSIONS.join(", "));
  // Same bytes uploaded before by this user → 409 unless they confirmed; copies get "name (n).ext".
  const copyNumber = await checkDuplicate(user.id, upload.sha256, upload.allowDuplicate);
  const filename = numberedFilename(upload.filename, copyNumber);
  const key = storageKeyFor(doc.id, filename);
  try {
    await putObject(key, upload.buffer, upload.mimeType);
  } catch (err) {
    console.error("attachment upload failed", err);
    throw new HttpError(502, "File storage is unavailable right now. Please try again.");
  }

  const attachment = await prisma.attachment.create({
    data: {
      documentId: doc.id,
      storageKey: key,
      filename,
      mimeType: upload.mimeType,
      size: upload.size,
      sha256: upload.sha256,
      uploadedById: user.id,
    },
    select: attachmentSelect,
  });
  return NextResponse.json(attachment, { status: 201 });
});
