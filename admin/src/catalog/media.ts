import { api, errorMessage } from "../api";

export type PublicMediaKind = "cards" | "logos";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadCatalogMedia(kind: PublicMediaKind, file: File) {
  const mimeType = file.type || "image/jpeg";
  const imageBase64 = await fileToBase64(file);
  const res = await api<{ path: string }>(`/admin/media/${kind}`, {
    method: "POST",
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  if (res.status !== 200) {
    return { ok: false as const, message: errorMessage(res.body, "上传失败") };
  }
  return { ok: true as const, path: res.body.path };
}
