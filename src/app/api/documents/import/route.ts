import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError, requireApiUser } from "@/lib/http";
import { IMPORT_EXTENSIONS, isImportable } from "@/lib/files";
import { convertFileToHtml } from "@/lib/import";
import { putObject } from "@/lib/storage";
import { readUpload, storageKeyFor } from "@/lib/upload";
import { checkDuplicate, numberedFilename } from "@/lib/duplicates";

/** Turns an uploaded .txt / .md / .docx into a new document owned by the caller. */
export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const upload = await readUpload(req, isImportable, IMPORT_EXTENSIONS.join(", "));
  // Importing a file this user already uploaded needs confirmation; the copy is numbered.
  const copyNumber = await checkDuplicate(user.id, upload.sha256, upload.allowDuplicate);
  const filename = numberedFilename(upload.filename, copyNumber);

  let converted;
  try {
    converted = await convertFileToHtml(filename, upload.buffer);
  } catch (err) {
    console.error("import conversion failed", err);
    throw new HttpError(422, "We couldn't read that file. Is it a valid .txt, .md or .docx?");
  }

  const doc = await prisma.document.create({
    data: { title: converted.title, content: converted.html, ownerId: user.id },
    select: { id: true },
  });

  // Keep the original file attached to the new document. Best-effort: the import itself
  // already succeeded, so a storage hiccup shouldn't fail the request.
  let originalAttached = true;
  try {
    const key = storageKeyFor(doc.id, filename);
    await putObject(key, upload.buffer, upload.mimeType);
    await prisma.attachment.create({
      data: {
        documentId: doc.id,
        storageKey: key,
        filename,
        mimeType: upload.mimeType,
        size: upload.size,
        sha256: upload.sha256,
        uploadedById: user.id,
      },
    });
  } catch (err) {
    console.error("storing original upload failed", err);
    originalAttached = false;
  }

  return NextResponse.json({ id: doc.id, originalAttached }, { status: 201 });
});
