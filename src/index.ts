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
import { GetRecallData } from "./endpoints/getRecallData.js";
import { CreateRecallData } from "./endpoints/createRecallData.js";
import { UpdateRecallData } from "./endpoints/updateRecallData.js";
import { GetSessionRecallData } from "./endpoints/getSessionRecallData.js";
import { UpdSerpData } from "./endpoints/updSerpData.js";
import { AltGetSourceData } from "./endpoints/altGetSourceData.js";
import { ExtractAllVideoData } from "./endpoints/extractAllContentData.js";
import { UpdGenSearchQuery } from "./endpoints/altGenSearchQuery.js";
import { UpdGenAnswer } from "./endpoints/updGenAnswer.js";
import { GenRecallAnswer } from "./endpoints/genRecallAnswer.js";
import { UpdGetRecallData } from "./endpoints/updGetRecallData.js";
import { DevGetAllSourceData } from "./endpoints/dev/getDevSourceData.js";
import { DevExtractAllVideoData } from "./endpoints/dev/extractDevlAllContentData.js";
import { DevGenSerpData } from "./endpoints/dev/devGenSerpData.js";
import { DevGenAnswer } from "./endpoints/dev/devGenAnswer.js";
import { GenGeneralSearchQuery } from "./endpoints/dev/devGenGeneralQuery.js";
import { GetUserHistoryData } from "./endpoints/getUserHistoryData.js";
import { DevAnswerSimilarity } from "./endpoints/dev/devVideoAnswerSimilarity.js";
import { GenAnswerSimilarity } from "./endpoints/genVideoAnswerSimilarity.js";
import { SaveVideoThumbnail } from "./endpoints/saveVideoThumbnail.js";
import { NewGenExtractVideoData } from "./endpoints/newGenExtractContentData.js";
import { WebSerpData } from "./endpoints/webSerpData.js";
import { ShortVideosSerpData } from "./endpoints/shortVideosSerpData.js";
import { VideosSerpData } from "./endpoints/videosSerpData.js";
import { NewsSerpData } from "./endpoints/newsSerpData.js";
import { ImagesSerpData } from "./endpoints/imagesSerpData.js";
import { CreateThreadData } from "./endpoints/createThreadData.js";
import { UpdateThreadData } from "./endpoints/updateThreadData.js";

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


//Search APIs

openapi.get("/api/search/web", WebSerpData);
openapi.get("/api/search/videos/short", ShortVideosSerpData);
openapi.get("/api/search/videos", VideosSerpData);
openapi.get("/api/search/news", NewsSerpData);
openapi.get("/api/search/images", ImagesSerpData);

//New Approach APIs
openapi.post("/api/generate/query", UpdGenSearchQuery);
openapi.get("/api/search/source", UpdSerpData);
openapi.post("/api/fetch/source", AltGetSourceData);
openapi.post("/api/extract/source", NewGenExtractVideoData);
openapi.post("/api/generate/answer", UpdGenAnswer);
openapi.post("/api/recall/answer", GenRecallAnswer);
openapi.post("/api/recall/sources", UpdGetRecallData);
openapi.post("/api/answer/similarity/social", GenAnswerSimilarity);
openapi.post("/dev/api/answer/similarity/social", DevAnswerSimilarity);
openapi.post("/api/save/video/thumbnail", SaveVideoThumbnail);


//Dev General Search APIs
openapi.post("/dev/api/generate/query/general", GenGeneralSearchQuery);
openapi.get("/dev/api/search/source/general", DevGenSerpData);
openapi.post("/api/fetch/source", AltGetSourceData);
openapi.post("/dev/api/generate/answer/general", DevGenAnswer);
openapi.post("/api/recall/answer", GenRecallAnswer);
openapi.post("/api/recall/sources", UpdGetRecallData);

// Dev APIs
openapi.post("/dev/api/fetch/source", DevGetAllSourceData);
openapi.post("/dev/api/extract/source", DevExtractAllVideoData);


//openapi.post("/api/youtube/extract", YTExtractData);

//Session APIs
openapi.post("/api/session/create", CreateSessionData);
openapi.post("/api/session/update", UpdateSessionData);
openapi.get("/api/session/get", GetSessionData);


//Thread APIs
openapi.post("/api/thread/create", CreateThreadData);
openapi.post("/api/thread/update", UpdateThreadData);
openapi.get("/api/thread/get", GetSessionData);

//Recall APIs
openapi.post("/api/recall/videos", GetRecallData);
openapi.post("/api/recall/create", CreateRecallData);
openapi.post("/api/recall/update", UpdateRecallData);
openapi.get("/api/recall/get", GetSessionRecallData);

//User APIs
openapi.post("/api/user/create", CreateUserData);
openapi.post("/api/user/update", UpdateUserData);
openapi.get("/api/user/get", GetUserData);
openapi.post("/api/user/search/history", GetUserHistoryData);

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
