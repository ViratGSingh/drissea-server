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
import { AltBulkSerpData } from "./endpoints/altbulkSerpData.js";
import { BraveSerpData } from "./endpoints/braveSerpData.js";
import { ExtractIGVideoData } from "./endpoints/extractIgContentData.js";
import { AltSerpData } from "./endpoints/altSerpData.js";
import { GenIGSearchQuery } from "./endpoints/genSearchQuery.js";
import { CreateSessionData } from "./endpoints/createSessionData.js";
import { UpdateSessionData } from "./endpoints/updateSessionData.js";
import { GetSessionData } from "./endpoints/getSessionData.js";
import { GetCacheData } from "./endpoints/getCacheData.js";
import { CreateUserData } from "./endpoints/createUserData.js";
import { UpdateUserData } from "./endpoints/updateUserData.js";
import { GetUserData } from "./endpoints/getUserData.js";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints

//Search APIs
openapi.get("/api/search/google", SerpData);
openapi.get("/api/bulk/search/duckduckgo", AltBulkSerpData);
openapi.get("/api/search/duckduckgo", AltSerpData);
openapi.get("/api/search/brave", BraveSerpData);
openapi.get("/api/search-data", SearchData);
openapi.post("/api/save-search-data", SaveResultData);
openapi.post("/api/search/gen/query", GenIGSearchQuery);

//Instagram APIs
openapi.get("/api/instagram/extract/reel", IGVideoData);
openapi.get("/api/instagram/get/content", GetIgVideoData);
openapi.post("/api/instagram/extract/content", ExtractIGVideoData);
openapi.post("/api/instagram/cache/content", GetCacheData);
openapi.post("/api/instagram/get/source", GetIgSourceData);
openapi.post("/api/instagram/get/source/alt", AltGetIgSourceData);
openapi.post("/api/instagram/backup/data", IGSaveVideoData);
openapi.post("/api/instagram/gen/answer", IGGenAnswer);

//Session APIs
openapi.post("/api/session/create", CreateSessionData);
openapi.post("/api/session/update", UpdateSessionData);
openapi.get("/api/session/get", GetSessionData);

//User APIs
openapi.post("/api/user/create", CreateUserData);
openapi.post("/api/user/update", UpdateUserData);
openapi.get("/api/user/get", GetUserData);

//Other APIs
openapi.get("/api/og-extract", OgExtract);

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
