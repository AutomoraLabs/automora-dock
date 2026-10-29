import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {Favorites} from './favorites.mjs';
import {exportBackup,restoreBackup,recoverRestore} from './backup.mjs';
import {bootstrapDocument} from './bootstrap.mjs';
import {
  Library,
  detectProfiles,
  preview,
  launch,
  launchSpec,
  favicon,
  profileAvatar,
} from "./core.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = new Library(
  process.env.PROFILEDOCK_DATA ||
    path.join(process.env.LOCALAPPDATA || root, "ProfileDock"),
);
const token = randomBytes(24).toString("hex");
const favorites=new Favorites(store.directory);
recoverRestore(store,favorites);
const origin = "http://127.0.0.1:1420";
// Validate storage before declaring this process ready, including cold startup.
const startupSnapshot=store.read();
const vite = process.argv.includes("--production")
  ? null
  : await (
      await import("vite")
    ).createServer({
      root,
      server: { middlewareMode: true },
      appType: "spa",
    });
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== "127.0.0.1:1420") {
    res.writeHead(403).end();
    return;
  }
  if (req.url === "/api/session" && req.method === "GET") {
    if (req.headers.origin && req.headers.origin !== origin) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ token }));
    return;
  }
  if(req.url === '/api/health' && req.method === 'GET') {
    if(req.headers.origin && req.headers.origin!==origin){res.writeHead(403).end();return;}
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try { const state=store.read();res.end(JSON.stringify({application:'ProfileDock',storageReady:true,revision:state.revision})); }
    catch(error){res.writeHead(503);res.end(JSON.stringify({application:'ProfileDock',storageReady:false,error:error.message}));}
    return;
  }
  if (req.url === "/api/command" && req.method === "POST") {
    if (
      req.headers.origin !== origin ||
      req.headers["x-profiledock-token"] !== token
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 25000000) throw Error("Request is too large.");
      }
      const { command, args = {} } = JSON.parse(body);
      let result;
      if (command === "snapshot") result = store.read();
      else if(command==='export_backup')result=exportBackup(store,favorites);
      else if(command==='restore_backup')result=restoreBackup(store,favorites,args.backup,args.revision);
      else if(command==='favorite_folder')result=args.action==='folder-pick'?await favorites.pick():await favorites.action(args.action,args);
      else if (command === "save_state") result = store.save(args.state);
      else if (command === "detect_profiles")
        result = detectProfiles(args.root, args.executable);
      else if (command === "preview_import") {
        const s = store.read();
        result = preview(
          s.profiles.filter((p) => args.profileIds.includes(p.id)),
        );
      } else if (command === "launch" || command === "prepare_launch") {
        const s = store.read();
        const p = s.profiles.find((x) => x.id === args.profileId);
        if (!p) throw Error("Profile is not registered.");
        result = command === "prepare_launch" ? launchSpec(p,args.url,args.forceMaximized === true) : await launch(p, args.url,args.forceMaximized === true);
      } else if (command === "data_location") result = store.directory;
      else if (command === "favicon") {
        const p = store.read().profiles.find((p) => p.id === args.profileId);
        result = p ? favicon(p, args.url) : null;
      } else if (command === "profile_avatar") {
        const p = store.read().profiles.find((p) => p.id === args.profileId);
        result = p ? profileAvatar(p) : null;
      } else throw Error("Unknown operation.");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (!vite) {
    try {
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      const dist = path.join(root, "dist");
      const target = path.resolve(dist, "." + pathname);
      if (!target.startsWith(dist + path.sep) && target !== dist) {
        res.writeHead(403).end();
        return;
      }
      let file = target;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (pathname.startsWith("/assets/")) {
          res.writeHead(404).end();
          return;
        }
        file = path.join(dist, "index.html");
      }
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".woff2": "font/woff2",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", path.extname(file)==='.html'?'no-store':'no-cache');
      if(path.extname(file)==='.html')res.end(bootstrapDocument(fs.readFileSync(file,'utf8'),store.read(),token));
      else res.end(fs.readFileSync(file));
    } catch {
      res
        .writeHead(500)
        .end("Unable to load application assets. Rebuild the frontend.");
    }
    return;
  }
  vite.middlewares(req, res, () => {
    res.writeHead(404).end();
  });
});
server.listen(1420, "127.0.0.1", () =>
  console.log("ProfileDock ready at " + origin + " — data: " + store.directory + " — revision: " + startupSnapshot.revision + " — bookmarks: " + startupSnapshot.bookmarks.length),
);
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
  vite?.close();
  store.close();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close();
    await vite?.close();
    store.close();
    process.exit(0);
  });
