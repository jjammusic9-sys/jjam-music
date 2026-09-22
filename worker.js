export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/upload" && request.method === "POST") {
      if (!env.ADMIN_KEY || request.headers.get("X-JJAM-ADMIN-KEY") !== env.ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const form = await request.formData();
      const file = form.get("file");
      const folder = String(form.get("folder") || "music");
      if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
      if (!["music","artwork"].includes(folder)) return new Response("Invalid folder", { status: 400 });
      if (file.size > 200 * 1024 * 1024) return new Response("File too large", { status: 413 });
      const safeName = file.name.normalize("NFKC").replace(/[^\w.()\- ]+/g, "_").replace(/\s+/g, " ").trim();
      const key = folder + "/" + safeName;
      await env.JJAM_R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" }
      });
      const publicBase = env.R2_PUBLIC_BASE || "";
      return Response.json({ ok: true, key, url: publicBase.replace(/\/$/,"") + "/" + key.split("/").map(encodeURIComponent).join("/") });
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      if (!env.ADMIN_KEY || request.headers.get("X-JJAM-ADMIN-KEY") !== env.ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = await request.json();
      if (!body.key || typeof body.key !== "string") return new Response("Missing key", { status: 400 });
      await env.JJAM_R2.delete(body.key);
      return Response.json({ ok: true, key: body.key });
    }

    return env.ASSETS.fetch(request);
  }
};
