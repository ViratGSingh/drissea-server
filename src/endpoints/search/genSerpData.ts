import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import "dotenv/config";
import axios from "axios";
import { Groq } from "groq-sdk";
import Perplexity from "@perplexity-ai/perplexity_ai";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

type OrganicResult = {
  url: string;
  title: string;
  excerpts: string;
};



export class FastGenSerpData extends OpenAPIRoute {
  schema = {
    tags: ["General Serp Search"],
    summary: "Get source links from google",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str({description: "User query to understand and reply"}),
              country: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                query: Str(),
                answer: Str(),
                sourceUrls: z.array(Str()),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid searchId parameter",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Document not found",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
    const data = await this.getValidatedData<typeof this.schema>();
    const { query, country } = data.body;
    



    try {
      // Run web search, YouTube search, and Map search in parallel
      const [webSearchResult, youtubeSearchResult, mapSearchResult] = await Promise.all([
        // Web search
        (async () => {
          const perpxApiKey = process.env.PERPX_API_KEY || "";
          
          if (!perpxApiKey) {
            console.warn("PERPX_API_KEY is not set");
            return [];
          }

          const client = new Perplexity({
            apiKey: perpxApiKey,
          });

          const response = await client.search.create({
            query: query,
            max_results: 10,
            max_tokens: 25000,
            max_tokens_per_page: 2048,
            country: country.toUpperCase() || "IN"
          });
          
          return (response.results || []).map(
            (item: any): OrganicResult => ({
              url: item.url,
              title: item.title,
              excerpts: item.snippet || "",
            })
          );
        })(),
        // YouTube search
        (async () => {
          try {
            const youtubeApiKey = process.env.YOUTUBE_API_KEY;
            if (!youtubeApiKey) {
              return { youtubeQuery: query, videos: [] };
            }


            const response = await axios.get(
              "https://www.googleapis.com/youtube/v3/search",
              {
                params: {
                  part: "snippet",
                  q: query,
                  key: youtubeApiKey,
                  maxResults: 10,
                  type: "video",
                  regionCode: country,
                },
              }
            );

            const items = response.data.items || [];
            
            // Select best videos (max 3)
            const bestVideoIds = await selectBestVideos(items, query);
            const bestItems = items.filter((i: any) => bestVideoIds.includes(i.id.videoId));
            
            const videos = bestItems.map((bestItem: any) => ({
              videoId: bestItem.id.videoId,
              title: bestItem.snippet.title,
              startTimestamp: "0:00",
              endTimestamp: "0:00",
              snippet: `${bestItem.snippet.title}\n\n${bestItem.snippet.channelTitle}\n\n${bestItem.snippet.description}`,
              thumbnail: bestItem.snippet.thumbnails.high?.url ?? bestItem.snippet.thumbnails.medium?.url ?? bestItem.snippet.thumbnails.default?.url,
              channelTitle: bestItem.snippet.channelTitle,
              channelId: bestItem.snippet.channelId,
              description: bestItem.snippet.description
            }));

            return videos;
          } catch (error: any) {
            console.error("YouTube API Error:", error?.response?.data || error.message);
            return [];
          }
        })(),
        // Map search
        (async () => {
          try {
            const mapsApiKey = process.env.MAPS_API_KEY;
            if (!mapsApiKey) {
              return { mapQuery: query, results: [] };
            }

            // Generate optimized map query
            const mapQuery = await generateMapQuery(query);

            // Text Search
            const searchResponse = await axios.get(
              "https://maps.googleapis.com/maps/api/place/textsearch/json",
              {
                params: {
                  query: mapQuery,
                  key: mapsApiKey,
                },
              }
            );

            const searchResults = searchResponse.data.results || [];
            const topResults = searchResults.slice(0, searchResults.length > 5 ? 5 : searchResults.length);

            // Get Place Details for each result
            const results = await Promise.all(
              topResults.map(async (place: any, index: number) => {
                try {
                  const detailsResponse = await axios.get(
                    "https://maps.googleapis.com/maps/api/place/details/json",
                    {
                      params: {
                        place_id: place.place_id,
                        key: mapsApiKey,
                        fields: "name,place_id,geometry,formatted_address,photos,rating,user_ratings_total,opening_hours,price_level,website,formatted_phone_number,types,url,international_phone_number,business_status,reviews,editorial_summary",
                      },
                    }
                  );

                  const details = detailsResponse.data.result;
                  return formatLocalResultData(place, details, index, mapsApiKey, mapQuery);
                } catch (err) {
                  console.error(`Error fetching details for place ${place.place_id}:`, err);
                  return formatLocalResultData(place, {}, index, mapsApiKey, mapQuery);
                }
              })
            );

            return results;
          } catch (error: any) {
            console.error("Map API Error:", error?.response?.data || error.message);
            return [];
          }
        })()
      ]);

      return {
        query,
        web: webSearchResult,
        youtube: youtubeSearchResult,
        map: mapSearchResult,
        success: true,
      };
    } catch (error: any) {
      console.error("SerpAPI fetch error:", error);
      return Response.json(
        { error: "Failed to fetch SerpAPI results" },
        { status: 500 }
      );
    }
  }
}

async function generateYoutubeQuery(userQuery: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) return userQuery;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that optimizes user queries for YouTube search. " +
            "Return a JSON object with a single field 'youtubeQuery'. " +
            "Rules: " +
            "1. Extract the core search keywords from the natural language input. " +
            "2. Remove conversational phrases like 'show me', 'I want to see', 'find me', 'can you search for', etc. " +
            "3. Keep important keywords like topic, subject, tutorial type, creator name if mentioned. " +
            "4. Optimize for YouTube's search algorithm by using common search terms. " +
            "5. Keep the query concise (3-7 words typically work best). " +
            "Example: 'can you find me some videos about how to make pasta at home' -> 'homemade pasta recipe tutorial'. " +
            "Example: 'I want to watch something about the history of ancient Rome' -> 'ancient Rome history documentary'. " +
            "Example: 'show me MrBeast's latest video' -> 'MrBeast latest video'.",
        },
        {
          role: "user",
          content: JSON.stringify({ userQuery }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return parsed.youtubeQuery || userQuery;
  } catch (e) {
    console.error("Error generating YouTube query:", e);
    return userQuery;
  }
}

async function selectBestVideos(items: any[], userQuery: string): Promise<string[]> {
  if (!items || items.length === 0) return [];
  if (!process.env.GROQ_API_KEY) return [items[0].id.videoId];

  const candidates = items.map((item, index) => ({
    index,
    title: item.snippet.title,
    description: item.snippet.description,
  }));

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an intelligent assistant. Given a user query and a list of YouTube videos (title, description), select the most relevant videos (up to 3) that are likely to contain the answer. " +
            "Return a strict JSON object with a single field: 'bestIndices' (array of numbers). " +
            "Sort the indices by relevance. " +
            "If NO video is relevant, return an empty array.",
        },
        {
          role: "user",
          content: JSON.stringify({
            user_query: userQuery,
            videos: candidates,
          }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const bestIndices = Array.isArray(parsed.bestIndices) ? parsed.bestIndices : [];
    
    return bestIndices
      .map((idx: any) => items[idx]?.id?.videoId)
      .filter((id: any) => id); // Filter out undefined if index is out of bounds
  } catch (e) {
    console.error("Error selecting best videos:", e);
    return [];
  }
}

async function generateMapQuery(userQuery: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) return userQuery;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that optimizes user queries for Google Maps search. " +
            "Return a JSON object with a single field 'mapQuery'. " +
            "Rules: " +
            "1. If the user matches a specific place (e.g. 'koramangala social menu reviews'), extract just the place name and location (e.g. 'Social Koramangala'). Remove intent words like 'menu', 'reviews', 'images', 'price'. " +
            "2. If the user asks for a category (e.g. 'good italian food'), keep it descriptive (e.g. 'Italian restaurants nearby'). " +
            "3. Do NOT change specific place names into generic categories. " +
            "Example: 'koramangala social menu reviews bangalore' -> 'Social Koramangala Bangalore'. " +
            "Example: 'best sushi in tokyo' -> 'Sushi restaurants in Tokyo'.",
        },
        {
          role: "user",
          content: JSON.stringify({ userQuery }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return parsed.mapQuery || userQuery;
  } catch (e) {
    console.error("Error generating map query:", e);
    return userQuery;
  }
}

function formatLocalResultData(
  searchResult: any,
  details: any,
  index: number,
  apiKey: string,
  searchQuery: string
) {
  // Merge search result and details, preferring details
  const data = { ...searchResult, ...details };

  const images = (data.photos || []).map((photo: any) => {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${apiKey}`;
  });

  const openingHours = data.opening_hours || {};
  
  // Format reviews for snippet
  const reviews = (data.reviews || [])
    .slice(0, data.reviews?.length > 10 ? 10 : data.reviews?.length) // Limit to top 10 reviews
    .map((r: any) => `"${r.text}" - ${r.rating}/5`)
    .join('\n');

  const baseSnippet = data.editorial_summary?.overview || data.name || '';
  const snippet = reviews ? `${baseSnippet}\n\nTop Reviews:\n${reviews}` : baseSnippet;

  // Format based on LocalResultData structure
  return {
    position: index,
    title: data.name || '',
    place_id: data.place_id || '',
    data_id: data.place_id || '', // Using place_id as data_id fallback
    data_cid: '', // specific to certain scraping methods, likely not available from API
    gps_coordinates: {
      latitude: data.geometry?.location?.lat,
      longitude: data.geometry?.location?.lng,
    },
    place_id_search: searchQuery,
    provider_id: 'google_places',
    rating: data.rating || 0.0,
    reviews: data.user_ratings_total || 0,
    price: data.price_level ? '$'.repeat(data.price_level) : '',
    type: (data.types && data.types.length > 0) ? data.types[0] : '',
    types: data.types || [],
    images: images,
    type_id: '', // internal use
    type_ids: [], // internal use
    address: data.formatted_address || '',
    open_state: openingHours.open_now ? 'Open' : (openingHours.open_now === false ? 'Closed' : ''),
    hours: (openingHours.weekday_text && openingHours.weekday_text.length > 0) ? openingHours.weekday_text.join('\n') : '',
    operating_hours: data.opening_hours || {},
    phone: data.formatted_phone_number || data.international_phone_number || '',
    website: data.website || '',
    snippet: snippet,
  };
}

