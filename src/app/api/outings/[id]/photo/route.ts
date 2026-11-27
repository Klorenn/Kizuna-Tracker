import { NextResponse } from "next/server";
import { saveOutingPhoto } from "@/lib/outing-photo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ status: 404, error: "No encontramos esa salida." }, { status: 404 });
  const outingId = id.toLowerCase();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: 401, error: "Inicia sesión para continuar." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: 400, error: "Solicitud no válida." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ status: 400, error: "Falta la foto." }, { status: 400 });
  const admin = createAdminClient();
  const result = await saveOutingPhoto(
    {
      upload: async (path, bytes) => {
        const { error } = await admin.storage.from("outing-photos").upload(path, bytes, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (error) throw new Error(error.message);
      },
      setPhoto: async (userId, outingId, path) => {
        const { error } = await admin.rpc("set_outing_photo", {
          p_user_id: userId,
          p_outing_id: outingId,
          p_path: path,
        });
        if (error) throw new Error(error.message);
      },
      remove: async (path) => {
        await admin.storage.from("outing-photos").remove([path]);
      },
    },
    user.id.toLowerCase(),
    outingId,
    { bytes: await file.arrayBuffer(), type: file.type, size: file.size },
  );
  return NextResponse.json(result, { status: result.status });
}
