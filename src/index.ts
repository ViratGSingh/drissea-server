import { fromHono } from "chanfana";
import { Hono } from "hono";
import { OgExtract } from "./endpoints/ogThumbnail";
import { SearchData } from "./endpoints/searchData";
import { IGVideoData } from "./endpoints/igVideoData";
import { IGSaveVideoData } from "./endpoints/igSaveVideoData";
import { SerpData } from "./endpoints/serpData";
import { IGGenAnswer } from "./endpoints/igGenAnswer";
import { SaveResultData } from "./endpoints/saveResultData";

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
openapi.get("/api/search/google", SerpData);
openapi.post("/api/instagram/backup/data", IGSaveVideoData);
openapi.post("/api/instagram/gen/answer", IGGenAnswer);

// You may also register routes for non OpenAPI directly on Hono
// app.get('/test', (c) => c.text('Hono!'))

// Export the Hono app
export default app;
