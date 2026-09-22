export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    async function sign(value) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.ADMIN_KEY || ""),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
      return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    async function validSession(request) {
      if (!env.ADMIN_KEY) return false;
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/(?:^|;\\s*)JJAM_ADMIN=([^;]+)/);
      if (!match) return false;
      const token = decodeURIComponent(match[1]);
      const parts = token.split(".");
      if (parts.length !== 2) return false;
      const timestamp = Number(parts[0]);
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 86400000 || Date.now() - timestamp < 0) return false;
      return (await sign("jjam:" + timestamp)) === parts[1];
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.username !== "jjam" || !env.ADMIN_KEY || body.password !== env.ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const timestamp = Date.now();
      const token = timestamp + "." + await sign("jjam:" + timestamp);
      return new Response(null, {
        status: 204,
        headers: {
          "Set-Cookie": "JJAM_ADMIN=" + encodeURIComponent(token) + "; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict"
        }
      });
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": "JJAM_ADMIN=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" }
      });
    }

    if (url.pathname === "/fuckoff.html") {
      if (!(await validSession(request))) {
        return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>J JAM — Private</title><style>*{box-sizing:border-box}body{margin:0;background:#f4efd8;color:#111;font-family:Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.box{width:min(400px,100%);border:2px solid #111;padding:26px;background:#f8f3df}.box input{width:100%;border:2px solid #111;padding:12px;background:#fffdf4;margin:6px 0 12px}.box button{width:100%;border:2px solid #111;background:#111;color:#f4efd8;padding:12px;font-weight:700;cursor:pointer}.err{display:none;margin-top:12px;font-size:12px}</style></head><body><div class="box"><strong>J JAM / CONTROL</strong><p>Private control panel.</p><form id="login"><label>Username</label><input id="u" autocomplete="username" required><label>Password</label><input id="p" type="password" autocomplete="current-password" required><button>Enter</button><div class="err" id="e">Wrong username or password.</div></form></div><script>document.getElementById("login").onsubmit=async e=>{e.preventDefault();const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:document.getElementById("u").value,password:document.getElementById("p").value})});if(r.ok)location.reload();else document.getElementById("e").style.display="block"}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
      }
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/admin.html") {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      if (!(await validSession(request))) return new Response("Unauthorized", { status: 401 });
      const form = await request.formData();
      const file = form.get("file");
      const prefix = String(form.get("prefix") || "msuic/library");
      if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
      if (!["msuic/releases","msuic/library","artwork/releases","artwork/library"].includes(prefix)) return new Response("Invalid folder", { status: 400 });
      if (file.size > 200 * 1024 * 1024) return new Response("File too large", { status: 413 });
      const safeName = file.name.normalize("NFKC").replace(/[^\w.()\- ]+/g, "_").replace(/\s+/g, " ").trim();
      const key = prefix + "/" + safeName;
      await env.JJAM_R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" }
      });
      const publicBase = env.R2_PUBLIC_BASE || "";
      return Response.json({ ok: true, key, url: publicBase.replace(/\/$/,"") + "/" + key.split("/").map(encodeURIComponent).join("/") });
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      if (!(await validSession(request))) return new Response("Unauthorized", { status: 401 });
      const body = await request.json();
      if (!body.key || typeof body.key !== "string") return new Response("Missing key", { status: 400 });
      await env.JJAM_R2.delete(body.key);
      return Response.json({ ok: true, key: body.key });
    }

    return env.ASSETS.fetch(request);
  }
};
