import { defineConfig, PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";
import fs from "fs/promises";
import os from "os";
import { exec } from "child_process";
import formidable from "formidable";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

// Define the API handler plugin
function apiPlugin(): PluginOption {
  return {
    name: "configure-server-api",
    configureServer(server) {
      console.log("Configuring API endpoint /api/vectorize...");

      server.middlewares.use("/api/vectorize", async (req, res) => {
        console.log(`[${req.method}] /api/vectorize request received`);

        if (req.method !== "POST") {
          console.log("Method not POST, sending 405");
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain");
          res.end("Method Not Allowed");
          return;
        }

        // Use formidable to parse the FormData
        const form = formidable({
          keepExtensions: true,
        });

        let svgContent: string | null = null;
        let tempDir = "";
        let inputPngPath = "";

        try {
          console.log("Parsing form data...");
          const [, files] = await form.parse(req);
          console.log("Form data parsed.");

          const imageFileArray = files.file;

          if (!imageFileArray || imageFileArray.length === 0) {
            console.log("No file found in FormData.");
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/plain");
            res.end("No file uploaded in 'file' field");
            return;
          }

          const imageFile = imageFileArray[0];
          inputPngPath = imageFile.filepath;
          console.log(
            `Received file: ${imageFile.originalFilename}, temp path: ${inputPngPath}`
          );

          // 1. Create temporary directory for SVG output
          tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtracer-svg-"));
          const outputSvgPath = path.join(tempDir, "output.svg");
          console.log(`Temporary SVG output dir: ${tempDir}`);

          // 2. Construct and run the vtracer command
          const vtracerCommand = `vtracer --input "${inputPngPath}" --output "${outputSvgPath}" --preset poster`;
          console.log(`Executing vtracer: ${vtracerCommand}`);

          await new Promise<void>((resolve, reject) => {
            exec(vtracerCommand, (error, stdout, stderr) => {
              if (error) {
                console.error(`vtracer exec error: ${error.message}`);
                console.error(`vtracer stderr: ${stderr}`);
                reject(
                  new Error(
                    `vtracer execution failed: ${stderr || error.message}`
                  )
                );
                return;
              }
              if (stderr) {
                console.warn(`vtracer stderr: ${stderr}`);
              }
              console.log(`vtracer stdout: ${stdout}`);
              console.log("vtracer execution successful.");
              resolve();
            });
          });

          // 3. Read the generated SVG file
          console.log(`Reading SVG output from: ${outputSvgPath}`);
          svgContent = await fs.readFile(outputSvgPath, "utf8");
          console.log("SVG content read successfully.");

          // 4. Send the SVG back as JSON
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ svg: svgContent }));
          console.log("SVG response sent to client.");
        } catch (err) {
          console.error("Error during /api/vectorize processing:", err);
          const clientErrorMessage =
            err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: `Processing failed: ${clientErrorMessage}`,
            })
          );
        } finally {
          if (tempDir) {
            try {
              await fs.rm(tempDir, { recursive: true, force: true });
              console.log(`Cleaned up temporary SVG directory: ${tempDir}`);
            } catch (cleanupError) {
              console.error(
                `Error cleaning up temporary SVG directory ${tempDir}:`,
                cleanupError
              );
            }
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  define: {
    "process.env.API_KEY": JSON.stringify(process.env.API_KEY || ""),
  },
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
