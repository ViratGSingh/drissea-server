import { DateTime, Str } from "chanfana";
import type { Context } from "hono";
import { z } from "zod";

export type Env = {
  API_SECRET: string;
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_STORAGE_BUCKET: string;
  FIREBASE_MESSAGING_SENDER_ID: string;
  FIREBASE_APP_ID: string;
  FIREBASE_MEASUREMENT_ID: string;
  IG_RAPID_API_KEY:string;
  GROQ_API_KEY:string;
  SERP_API_KEY:string;
};

export type AppContext = Context<{ Bindings: Env }>;

export const Task = z.object({
	name: Str({ example: "lorem" }),
	slug: Str(),
	description: Str({ required: false }),
	completed: z.boolean().default(false),
	due_date: DateTime(),
});

export interface InstagramResponse {
  source_url:string;
  user: {
    id: string;
    username: string;
    fullname: string;
    is_verified: boolean;
  };
  video: {
    id: string;
    duration: number;
    thumbnail_url: string;
    video_url: string;
    caption: string;
  };
}
export interface InstagramError {
  error: string;
}