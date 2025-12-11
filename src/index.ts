import { fromHono } from "chanfana";
import { Hono } from "hono";
import { serve } from '@hono/node-server';
import { SearchProfileData } from "./endpoints/searchIgProfileData.js";
import { DrisseaSerpData } from "./endpoints/search/drisseaSerpData.js";
import { AltGetSessionData } from "./endpoints/altGetSessionData.js";
import { YoutubeProfileSearchData } from "./endpoints/searchYtProfileData.js";
import { YoutubeSearchData } from "./endpoints/searchYtData.js";
import { DevGenSerpData } from "./endpoints/dev/devGenSerpData.js";
import { MapSearchData } from "./endpoints/searchMapData.js";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});


//Search APIs
openapi.get("/api/search/drissea", DrisseaSerpData);
openapi.post("/api/search/youtube/channel", YoutubeProfileSearchData);
openapi.post("/api/search/youtube", YoutubeSearchData);
openapi.get("/dev/api/search/source/general", DevGenSerpData);
openapi.post("/api/search/map", MapSearchData);

//Creator APIs
openapi.get("/api/creator/get", SearchProfileData);


//Thread APIs
openapi.get("/api/thread/get", AltGetSessionData);




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
