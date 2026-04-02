// Sentry must be imported before everything else
import "./instrument";
import * as Sentry from "@sentry/node";
import http from "http";
import fs from "fs";
import path from "path";
import { processCheckout } from "./components/Checkout";
import { searchProducts } from "./components/Search";

const PORT = 3000;

function serveHtml(res: http.ServerResponse, filename: string): void {
  const htmlPath = path.join(__dirname, "../src/public", filename);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(htmlPath, "utf-8"));
}

const server = http.createServer((req, res) => {
  Sentry.withIsolationScope((scope) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    // Add breadcrumb for every request so Sentry events have context
    Sentry.addBreadcrumb({
      category: "http",
      message: `${req.method} ${url.pathname}`,
      data: { method: req.method, url: url.pathname, query: url.search },
      level: "info",
    });

    scope.setTag("route", url.pathname);

    // Pages
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveHtml(res, "index.html");
    }
    if (req.method === "GET" && url.pathname === "/products") {
      return serveHtml(res, "products.html");
    }

    // API: Checkout
    if (req.method === "POST" && url.pathname === "/api/checkout") {
      try {
        const result = processCheckout();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: unknown) {
        Sentry.captureException(err);
        const message = err instanceof Error ? err.message : "Unknown error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // API: Search
    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = url.searchParams.get("q") || "";
      try {
        const result = searchProducts(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: unknown) {
        Sentry.captureException(err);
        const message = err instanceof Error ? err.message : "Unknown error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });
});

server.listen(PORT, () => {
  console.log(`T-1000 Demo App running on http://localhost:${PORT}`);
});
