import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class GenRecallAnswer extends OpenAPIRoute {
  schema = {
    tags: ["Recall"],
    summary: "Generate Recall Search",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              email: Str(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved generated query",
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              success: z.literal(true),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid task parameter",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
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
    const task = data.body.query;

    //Set Basic User Context Data
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      // @ts-ignore
      c.req.raw?.connection?.remoteAddress ||
      "";
    let countryCode = "in";
    let userContext = "";
    // store timezone extracted from ipapi so we can format dates in the user's local time
    let userTimezone: string | undefined;
    let ipJson: {
      city?: string;
      region?: string;
      country_name?: string;
      country_code?: string;
      timezone?: string;
      org?: string;
      postal?: string;
      latitude?: number;
      longitude?: number;
      ip?: string;
      error?: string;
    };
    try {
      let ipapiUrl = `https://ipapi.co`;
      if (clientIp) {
        ipapiUrl += `/${clientIp}/json/?key=${process.env.IPAPI_API_KEY}`;
      } else {
        ipapiUrl += `/json/?key=${process.env.IPAPI_API_KEY}`;
      }
      const ipRes = await fetch(ipapiUrl);
      const ipJson: {
        city?: string;
        region?: string;
        country_name?: string;
        country_code?: string;
        timezone?: string;
        org?: string;
        postal?: string;
        latitude?: number;
        longitude?: number;
        ip?: string;
        error?: string;
      } = await ipRes.json();
      countryCode = ipJson.country_code
        ? ipJson.country_code.toLowerCase()
        : "in";
      // Extract all relevant fields
      const {
        city,
        region,
        country_name,
        country_code,
        timezone,
        org,
        postal,
        latitude,
        longitude,
        ip,
      } = ipJson;
      userTimezone = timezone;
      // Compute local datetime string
      let datetimeStr = "";
      if (timezone) {
        try {
          datetimeStr = new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: timezone,
          }).format(new Date());
        } catch (e) {
          datetimeStr = "";
        }
      }
      // Build human-readable user context string
      userContext =
        (country_code ? `Country Code: ${country_code}\n` : "") +
        (country_name ? `Country Name: ${country_name}\n` : "") +
        (region ? `Region: ${region}\n` : "") +
        (city ? `City: ${city}\n` : "") +
        (timezone ? `Timezone: ${timezone}\n` : "") +
        (datetimeStr && timezone
          ? `Date: ${new Intl.DateTimeFormat(undefined, {
              dateStyle: "full",
              timeZone: timezone,
            }).format(new Date())}\n`
          : "") +
        (datetimeStr && timezone
          ? `Time: ${new Intl.DateTimeFormat(undefined, {
              timeStyle: "long",
              timeZone: timezone,
            }).format(new Date())}\n`
          : "") +
        (org ? `ISP/Org: ${org}\n` : "") +
        (ip ? `IP: ${ip}\n` : "") +
        (postal ? `Postal: ${postal}\n` : "") +
        (latitude && longitude
          ? `Approximate Coordinates: ${latitude},${longitude}\n`
          : "");
      userContext = userContext.trim();
      if (!userContext) userContext = "";
    } catch (err) {
      // If ipapi fails, fallback to default countryCode and unavailable context
      countryCode = "in";
      userContext = "User context unavailable";
    }

    if (!task || typeof task !== "string" || task.trim() === "") {
      return c.json(
        { error: "No task provided", success: false },
        { status: 400 }
      );
    }

    //Retrieve Previous Sessions
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../serviceAccountKey.json")
        ),
      });
    }
    const sessionsRef = admin.firestore().collection("sessions");
    const snapshot = await sessionsRef
      .where("email", "==", data.body.email)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    if (snapshot.empty) {
      return c.json(
        { success: false, error: "No previous sessions" },
        { status: 404 }
      );
    }

    const formattedSessions = snapshot.docs
      .map((doc, i) => {
        const data = doc.data();
        const firstQuestion = Array.isArray(data.questions) ? data.questions[0] : "";
        const firstAnswer = Array.isArray(data.answers) ? data.answers[0] : "";
        const createdAt = data.createdAt;
        // Prefer the explicit timezone from ipapi (if available) so the timestamp is shown in the user's local time.
        // For locale, construct a reasonable BCP-47 tag using English + the country (e.g. "en-IN").
        const tz = userTimezone && typeof userTimezone === "string" ? userTimezone : undefined;
        const locale = countryCode && countryCode.length === 2 ? `en-${countryCode.toUpperCase()}` : undefined;
        const formattedDate = createdAt
          ? new Date(createdAt).toLocaleString(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: tz,
            })
          : "";
        return `(${i + 1}) Date:\n${formattedDate}\nQuestion:\n${firstQuestion}\nAnswer:\n${firstAnswer}`;
      })
      .join("\n\n");

    // const sessionsData = await this.getValidatedData<typeof this.schema>();
    // const { query, results } = data.body;

    

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are Drissea, a helpful assistant.

Your task: Answer the user's question in detail, but only using the context information provided. Do not add information from outside the given context.

Context includes:
- User context details
- The user's most recent question and answer pairs

Always ensure your answer is clear, well-structured, and grounded only in the provided context.

Here is the user context:
${userContext}

Here are the user's most recent question and answer pairs:
${formattedSessions}`,
          },
          {
            role: "user",
            content: task,
          },
        ],
        temperature: 1,
        max_completion_tokens: 256,
        top_p: 1,
        stream: false,
        stop: null,
      });

      const answer = (chatCompletion.choices[0]?.message?.content ?? "").trim();

      return c.json({
        answer,
        success: true,
      });
    } catch (error) {
      return c.json(
        { error: "Failed to generate query", success: false },
        { status: 500 }
      );
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};
