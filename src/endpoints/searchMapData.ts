import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import axios from "axios";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export class MapSearchData extends OpenAPIRoute {
  schema = {
    tags: ["Map Search Agent"],
    summary: "Search Google Maps and return detailed place info",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              userQuery: Str({ description: "User query for the map search" }),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved map results",
        content: {
          "application/json": {
            schema: z.object({
              userQuery: Str(),
              mapQuery: Str(),
              results: z.array(z.any()), // Using any to accommodate the complex LocalResultData structure for now
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: Str(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              error: Str(),
              details: z.any().optional(),
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
      return c.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { userQuery } = data.body;
    const mapsApiKey = process.env.MAPS_API_KEY;

    if (!mapsApiKey) {
      return c.json(
        { success: false, error: "Missing Google Maps API Key" },
        { status: 500 }
      );
    }

    try {
      // 1. Generate Query
      const mapQuery = await generateMapQuery(userQuery);

      // 2. Text Search
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
      // Take top 3 results for detailed info as requested
      const topResults = searchResults.slice(0, searchResults.length>5?5:searchResults.length);

      // 3. Get Place Details for each result
      const results = await Promise.all(
        topResults.map(async (place: any, index: number) => {
          try {
            const detailsResponse = await axios.get(
              "https://maps.googleapis.com/maps/api/place/details/json",
              {
                params: {
                  place_id: place.place_id,
                  key: mapsApiKey,
                  // Requesting fields needed for LocalResultData
                  fields: "name,place_id,geometry,formatted_address,photos,rating,user_ratings_total,opening_hours,price_level,website,formatted_phone_number,types,url,international_phone_number,business_status,reviews,editorial_summary",
                },
              }
            );

            const details = detailsResponse.data.result;

            // 4. Format Data
            return formatLocalResultData(place, details, index, mapsApiKey, mapQuery);
          } catch (err) {
            console.error(`Error fetching details for place ${place.place_id}:`, err);
            // Return basic info if details fail
            return formatLocalResultData(place, {}, index, mapsApiKey, mapQuery);
          }
        })
      );

      return c.json({
        userQuery,
        mapQuery,
        results,
      });

    } catch (error: any) {
      console.error("Map API Error:", error?.response?.data || error.message);
      return c.json(
        {
          success: false,
          error: "Map API Error",
          details: error?.response?.data || error.message,
        },
        { status: 500 }
      );
    }
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
    .slice(0, data.reviews?.length>10?10:data.reviews?.length) // Limit to top 10 reviews
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
