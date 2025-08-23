import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
import admin from "firebase-admin";

export class CreateUserData extends OpenAPIRoute {
  schema = {
    tags: ["Users"],
    summary: "Save User Data",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              data: z.record(z.any()),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully saved user data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              id: Str(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid request body",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
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

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../serviceAccountKey.json")
        ),
      });
    }

    const { body } = await this.getValidatedData<typeof this.schema>();
    const firestore = admin.firestore();

    const userData = {
      ...body.data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await firestore.collection("users").add(userData);

    return c.json({
      success: true,
      id: docRef.id,
    });
  }
}
