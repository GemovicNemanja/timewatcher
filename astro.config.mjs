import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [react()],
  output: "static",
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
        "base-uri 'none'",
        "form-action 'self'"
      ],
      styleDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "https://fonts.googleapis.com", kind: "element" },
          { resource: "'unsafe-inline'", kind: "attribute" }
        ]
      }
    }
  },
  build: {
    inlineStylesheets: "auto"
  },
  markdown: {
    syntaxHighlight: false
  },
  vite: {
    build: {
      sourcemap: true
    }
  }
});
