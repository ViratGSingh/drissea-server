import { fromHono } from "chanfana";
import { Hono } from "hono";
import { OgExtract } from "./endpoints/ogThumbnail.js";
import { SearchData } from "./endpoints/searchData.js";
import { IGVideoData } from "./endpoints/igVideoData.js";
import { IGSaveVideoData } from "./endpoints/igSaveVideoData.js";
import { SerpData } from "./endpoints/serpData.js";
import { IGGenAnswer } from "./endpoints/igGenAnswer.js";
import { SaveResultData } from "./endpoints/saveResultData.js";
import { serve } from '@hono/node-server';
import { GetIgVideoData } from "./endpoints/getIgVideoData.js";
import { GetIgSourceData } from "./endpoints/getIgSourceData.js";
import { AltGetIgSourceData } from "./endpoints/altGetIgSourceData.js";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.get("/api/og-extract", OgExtract);
openapi.get("/api/search-data", SearchData);
openapi.post("/api/save-search-data", SaveResultData);
openapi.get("/api/instagram/extract/reel", IGVideoData);
openapi.get("/api/instagram/get/content", GetIgVideoData);
openapi.post("/api/instagram/get/source", GetIgSourceData);
openapi.post("/api/instagram/get/source/alt", AltGetIgSourceData);
openapi.get("/api/search/google", SerpData);
openapi.post("/api/instagram/backup/data", IGSaveVideoData);
openapi.post("/api/instagram/gen/answer", IGGenAnswer);

// You may also register routes for non OpenAPI directly on Hono
// app.get('/test', (c) => c.text('Hono!'))

const port = parseInt(process.env.PORT || '3000');
console.log(`🚀 Hono server running at http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port,
});

// // Export the Hono app
// export default app;
