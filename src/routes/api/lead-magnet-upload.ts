import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "lead-magnets";

export const Route = createFileRoute("/api/lead-magnet-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        const userId = userData?.user?.id;
        if (userError || !userId) return Response.json({ error: "unauthorized" }, { status: 401 });

        const form = await request.formData();
        const file = form.get("file");
        const slug = cleanSlug(String(form.get("slug") ?? "material"));

        if (!(file instanceof File)) {
          return Response.json({ error: "Arquivo ausente." }, { status: 400 });
        }

        await ensureBucket();

        const safeName = cleanFileName(file.name || "material.pdf");
        const path = `${userId}/${slug}/${Date.now()}-${safeName}`;
        const bytes = new Uint8Array(await file.arrayBuffer());

        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, bytes, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          return Response.json({ error: uploadError.message }, { status: 500 });
        }

        const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        return Response.json({
          ok: true,
          url: data.publicUrl,
          path,
          fileName: file.name,
          fileType: inferFileType(file.type),
        });
      },
    },
  },
});

async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data?.id) return;

  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
    ],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

function cleanSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "material";
}

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function inferFileType(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
