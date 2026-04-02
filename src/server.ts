// Sentry must be imported before everything else
import "./instrument";
import * as Sentry from "@sentry/node";
import http from "http";
import fs from "fs";
import path from "path";
import { processCheckout } from "./components/Checkout";

const PORT = 3000;

const server = http.createServer((req, res) => {
  Sentry.withIsolationScope(() => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const htmlPath = path.join(__dirname, "../src/public/index.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(fs.readFileSync(htmlPath, "utf-8"));
      return;
    }

    if (req.method === "POST" && req.url === "/api/checkout") {
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

    res.writeHead(404);
    res.end("Not Found");
  });
});

server.listen(PORT, () => {
  console.log(`T-1000 Demo App running on http://localhost:${PORT}`);
});
