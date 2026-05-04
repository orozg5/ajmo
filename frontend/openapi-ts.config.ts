import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: process.env.OPENAPI_URL ?? "http://localhost:8000/openapi.json",
  output: {
    path: "src/lib/api/generated",
    format: "prettier",
    lint: "eslint",
  },
  plugins: [
    "@hey-api/client-fetch",
    "@hey-api/schemas",
    "@hey-api/sdk",
    "@hey-api/typescript",
    "zod",
    "@tanstack/react-query",
  ],
});
