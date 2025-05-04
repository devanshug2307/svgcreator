/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality } from "@google/genai";
import ReactDOM from "react-dom/client";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const outputCount = 1; // Number of outputs to generate

// DOM elements
const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
const generateButton = document.getElementById(
  "generate-button"
) as HTMLButtonElement;
const framesContainer = document.getElementById(
  "frames-container"
) as HTMLDivElement;
const resultContainer = document.getElementById(
  "result-container"
) as HTMLDivElement;
const statusDisplay = document.getElementById(
  "status-display"
) as HTMLDivElement;
const viewGalleryButton = document.getElementById(
  "view-gallery"
) as HTMLButtonElement;
const galleryContainer = document.getElementById(
  "gallery-content"
) as HTMLDivElement;
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

// Import the Gallery component
import Gallery from "./src/pages/Gallery";

function updateStatus(message: string) {
  if (statusDisplay) {
    statusDisplay.textContent = message;
  }
}

function switchTab(targetTab: string) {
  tabButtons.forEach((button) => {
    if (button.getAttribute("data-tab") === targetTab) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
  tabContents.forEach((content) => {
    if (content.id === `${targetTab}-content`) {
      content.classList.add("active");
    } else {
      content.classList.remove("active");
    }
  });
  if (targetTab === "output" && resultContainer) {
    resultContainer.style.display = "flex";
  }
  if (targetTab === "gallery") {
    // Render the Gallery component
    const galleryContainer = document.getElementById("gallery-content");
    if (galleryContainer) {
      const root = ReactDOM.createRoot(galleryContainer);
      root.render(<Gallery />);
    }
  }
}

function toggleGallery() {
  if (galleryContainer.style.display === "none") {
    galleryContainer.style.display = "block";
    resultContainer.style.display = "none";
    framesContainer.style.display = "none";
    viewGalleryButton.classList.add("active");

    // Render the Gallery component
    const root = ReactDOM.createRoot(galleryContainer);
    root.render(<Gallery />);
  } else {
    galleryContainer.style.display = "none";
    resultContainer.style.display = "flex";
    framesContainer.style.display = "block";
    viewGalleryButton.classList.remove("active");
  }
}

// Add vector generation function
async function generateVectorStylePrompt(value: string) {
  updateStatus("Generating vector illustration...");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: `Create a clean, flat vector illustration of ${value} using simple geometric shapes and solid colors. Use minimal detailing, clear outlines, limited color palette (4-6 colors maximum), and avoid gradients, textures, or complex shading. The illustration should have distinct shapes with clean edges that would convert well to SVG format. Make it simple enough that it could be drawn with basic vector paths.`,
      config: {
        temperature: 0.7,
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    let imageData: string | null = null;

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType;
          if (data && typeof data === "string" && mimeType) {
            imageData = "data:" + mimeType + ";base64," + data;
            break;
          }
        }
      }
    }

    if (!imageData) {
      throw new Error("No image was generated");
    }

    // Convert base64 to Blob
    const base64Response = await fetch(imageData);
    const blob = await base64Response.blob();

    // Create FormData for the file upload
    const formData = new FormData();
    formData.append("file", blob, "image.png"); // Sending as form data

    // Send to our NEW backend endpoint for vectorization
    const vectorResponse = await fetch("/api/vectorize", {
      // Changed URL
      method: "POST",
      body: formData,
    });

    if (!vectorResponse.ok) {
      const errorText = await vectorResponse.text();
      throw new Error(
        `Failed to vectorize image (server error): ${
          errorText || vectorResponse.statusText
        }`
      );
    }

    // Expecting JSON response with SVG content
    let svgContent;
    try {
      const data = await vectorResponse.json();
      svgContent = data.svg;

      // Validate the SVG content
      if (!svgContent || typeof svgContent !== "string") {
        throw new Error("Invalid SVG content received from server");
      }

      // --- Optional: Keep SVG validation/fixing logic (client-side) ---
      // Fix SVG if it doesn't have proper XML declaration or viewBox (similar to previous logic)
      if (
        !svgContent.trim().startsWith("<?xml") &&
        !svgContent.trim().startsWith("<svg")
      ) {
        console.warn("SVG missing XML declaration or <svg> tag");
      }

      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
      const svgElement = svgDoc.documentElement;

      if (svgElement.tagName === "parsererror") {
        throw new Error("SVG parsing error: Invalid SVG content from server");
      }

      if (
        !svgElement.hasAttribute("viewBox") &&
        svgElement.hasAttribute("width") &&
        svgElement.hasAttribute("height")
      ) {
        const width = svgElement.getAttribute("width") || "200";
        const height = svgElement.getAttribute("height") || "200";
        svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet"); // Good practice

        // Serialize back to string
        const serializer = new XMLSerializer();
        svgContent = serializer.serializeToString(svgDoc);
      }
      // --- End: Optional SVG validation/fixing logic ---
    } catch (error) {
      console.error("Error processing response from /api/vectorize:", error);
      throw new Error(
        `Failed to process SVG response: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Return the original image data and the SVG content from the API
    return { imageData, svgContent };
  } catch (error) {
    console.error("Error generating vector illustration:", error);
    updateStatus(
      `Error generating vector illustration: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

// Helper function to create a single output card with download buttons
function createOutputCard(
  imageData: string,
  svgContent: string,
  index: number
) {
  const outputCard = document.createElement("div");
  outputCard.className = "output-card";

  // Add frame number
  const frameNumber = document.createElement("div");
  frameNumber.className = "frame-number";
  frameNumber.textContent = `${index + 1}`;
  outputCard.appendChild(frameNumber);

  // Create container that will hold both the raster image and SVG
  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";
  imageContainer.style.position = "relative";
  imageContainer.style.width = "100%";
  imageContainer.style.height = "200px";
  imageContainer.style.cursor = "pointer";
  imageContainer.onclick = () => {
    openSvgEditor(svgContent, index);
  };

  // Create and add image (as a background, hidden by default)
  const img = new Image();
  img.src = imageData;
  img.className = "result-image";
  img.style.display = "block";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";

  // Create SVG display (visible on top)
  const svgDisplay = document.createElement("div");
  svgDisplay.className = "svg-display";
  svgDisplay.style.position = "absolute";
  svgDisplay.style.top = "0";
  svgDisplay.style.left = "0";
  svgDisplay.style.width = "100%";
  svgDisplay.style.height = "100%";
  svgDisplay.style.display = "flex";
  svgDisplay.style.justifyContent = "center";
  svgDisplay.style.alignItems = "center";
  svgDisplay.innerHTML = svgContent;

  // Add both to the container
  imageContainer.appendChild(img);
  imageContainer.appendChild(svgDisplay);
  outputCard.appendChild(imageContainer);

  // Create download buttons container
  const downloadContainer = document.createElement("div");
  downloadContainer.className = "download-container";

  // Add PNG download button
  const downloadPNGButton = document.createElement("button");
  downloadPNGButton.className = "download-button";
  downloadPNGButton.innerHTML = '<i class="fas fa-download"></i> PNG';
  downloadPNGButton.onclick = () => {
    const a = document.createElement("a");
    a.href = imageData;
    a.download = `vector-illustration-${index + 1}.png`;
    a.click();
  };

  // Add SVG download button
  const downloadSVGButton = document.createElement("button");
  downloadSVGButton.className = "download-button";
  downloadSVGButton.innerHTML = '<i class="fas fa-download"></i> SVG';
  downloadSVGButton.onclick = () => {
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vector-illustration-${index + 1}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add edit SVG button
  const editSVGButton = document.createElement("button");
  editSVGButton.className = "download-button";
  editSVGButton.innerHTML = '<i class="fas fa-edit"></i> Edit';
  editSVGButton.onclick = () => {
    openSvgEditor(svgContent, index);
  };

  // Add buttons to container
  downloadContainer.appendChild(downloadPNGButton);
  downloadContainer.appendChild(downloadSVGButton);
  downloadContainer.appendChild(editSVGButton);
  outputCard.appendChild(downloadContainer);

  return outputCard;
}

// Add SVG editor functions
function openSvgEditor(svgContent: string, index: number) {
  // Quantize SVG and get palette
  const { quantizedSvgContent, paletteColors } =
    extractColorsFromSvg(svgContent);

  // Create editor modal
  const editorModal = document.createElement("div");
  editorModal.className = "svg-editor-modal";

  // Create a container for the editor
  const editorContainer = document.createElement("div");
  editorContainer.className = "svg-editor-container";

  // Create editor interface with preview and controls
  const editorInterface = document.createElement("div");
  editorInterface.className = "svg-editor-interface";

  // Create preview area
  const previewArea = document.createElement("div");
  previewArea.className = "svg-editor-preview";

  // Add a container for the SVG with proper sizing
  const svgContainer = document.createElement("div");
  svgContainer.style.width = "100%";
  svgContainer.style.height = "100%";
  svgContainer.style.display = "flex";
  svgContainer.style.justifyContent = "center";
  svgContainer.style.alignItems = "center";
  svgContainer.innerHTML = quantizedSvgContent;
  previewArea.appendChild(svgContainer);

  // Create control panel
  const controlPanel = document.createElement("div");
  controlPanel.className = "svg-editor-controls";

  // Use quantized palette for color controls
  const colorPalette = createColorPalette(paletteColors);

  // Add controls as shown in the screenshot
  controlPanel.innerHTML = `
    <div class="control-group">
      <label>Icon Size</label>
      <div class="control-slider">
        <input type="range" id="icon-size" min="50" max="500" value="200" />
        <span id="icon-size-value">200px</span>
      </div>
    </div>
    
    <div class="control-group">
      <label>Padding</label>
      <div class="control-slider">
        <input type="range" id="padding" min="0" max="50" value="0" />
        <span id="padding-value">0%</span>
      </div>
    </div>
    
    <div class="control-group">
      <label>Thickness</label>
      <div class="control-slider">
        <input type="range" id="thickness" min="0" max="20" value="0" />
        <span id="thickness-value">0%</span>
      </div>
    </div>
    
    <div class="control-group">
      <label>Line Color</label>
      <div class="color-picker">
        <input type="color" id="line-color" value="#000000" />
        <span id="line-color-value">#000000</span>
      </div>
    </div>
    
    <div class="control-group">
      <label>Flip/Mirror</label>
      <div class="button-group">
        <button class="icon-button" id="flip-horizontal" title="Flip Horizontal">
          <i class="fas fa-arrows-left-right"></i>
        </button>
        <button class="icon-button" id="flip-vertical" title="Flip Vertical">
          <i class="fas fa-arrows-up-down"></i>
        </button>
        <button class="icon-button" id="flip-diagonal1" title="Flip Diagonal ↘">
          <i class="fas fa-arrow-down-right"></i>
        </button>
        <button class="icon-button" id="flip-diagonal2" title="Flip Diagonal ↙">
          <i class="fas fa-arrow-down-left"></i>
        </button>
      </div>
    </div>
    
    <div class="control-group">
      <label>Rotation</label>
      <div class="button-group">
        <button class="icon-button" id="rotate-ccw" title="Rotate 90° CCW">
          <i class="fas fa-rotate-left"></i>
        </button>
        <button class="icon-button" id="rotate-cw" title="Rotate 90° CW">
          <i class="fas fa-rotate-right"></i>
        </button>
        <button class="icon-button" id="rotate-180" title="Rotate 180°">
          <i class="fas fa-sync"></i>
        </button>
        <button class="icon-button" id="rotate-reset" title="Reset Rotation">
          <i class="fas fa-undo"></i>
        </button>
      </div>
    </div>
    
    <div class="control-group">
      <label>Diagonal</label>
      <div class="button-group">
        <button class="icon-button" id="diagonal-up" title="Diagonal Up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="icon-button" id="diagonal-upright" title="Diagonal Up-Right">
          <i class="fas fa-arrow-up-right"></i>
        </button>
        <button class="icon-button" id="diagonal-uplong" title="Diagonal Up Long">
          <i class="fas fa-arrow-up-long"></i>
        </button>
      </div>
    </div>
    
    <div class="control-group">
      <label>BG Shape</label>
      <div class="button-group">
        <button class="icon-button" id="bg-none" title="No Background">
          <i class="fas fa-ban"></i>
        </button>
        <button class="icon-button" id="bg-square" title="Square Background">
          <i class="far fa-square"></i>
        </button>
        <button class="icon-button" id="bg-circle" title="Circle Background">
          <i class="far fa-circle"></i>
        </button>
        <button class="icon-button" id="bg-custom" title="Custom Shape">
          <i class="fas fa-shapes"></i>
        </button>
      </div>
    </div>
    
    <div class="control-group">
      <label>Trace Width</label>
      <div class="control-slider">
        <input type="range" id="trace-width" min="0" max="20" value="0" />
        <span id="trace-width-value">0%</span>
      </div>
    </div>
    
    ${colorPalette}
    
    <div class="editor-actions">
      <button id="copy-svg-btn" class="editor-action-button">
        <i class="fas fa-copy"></i> COPY SVG
      </button>
      <button id="export-btn" class="editor-action-button primary">
        <i class="fas fa-download"></i> EXPORT
      </button>
    </div>
  `;

  // Add close button
  const closeButton = document.createElement("button");
  closeButton.className = "svg-editor-close";
  closeButton.innerHTML = '<i class="fas fa-times"></i>';
  closeButton.onclick = () => {
    document.body.removeChild(editorModal);
  };

  // Assemble the editor
  editorInterface.appendChild(previewArea);
  editorInterface.appendChild(controlPanel);
  editorContainer.appendChild(editorInterface);
  editorContainer.appendChild(closeButton);
  editorModal.appendChild(editorContainer);

  // Add event listeners for the controls
  document.body.appendChild(editorModal);

  // Initialize the editor controls
  initSvgEditorControls(quantizedSvgContent, previewArea, index);
}

// Function to convert hex color to RGB array
function hexToRgb(hex: string): [number, number, number] | null {
  // Remove # if present
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((x) => x + x)
      .join("");
  }
  if (hex.length !== 6) return null;
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Function to convert RGB array to hex color
function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

// Calculate Euclidean distance between two RGB colors
function colorDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
      Math.pow(a[1] - b[1], 2) +
      Math.pow(a[2] - b[2], 2)
  );
}

// K-means clustering for color quantization
function kMeansQuantize(colors: string[], k: number, maxIters = 10): string[] {
  if (colors.length <= k) return colors;
  const rgbColors = colors.map(hexToRgb).filter(Boolean) as [
    number,
    number,
    number
  ][];
  // Randomly initialize cluster centers
  let centers = rgbColors.slice(0, k);
  for (let iter = 0; iter < maxIters; iter++) {
    // Assign each color to the nearest center
    const clusters: [number, number, number][][] = Array.from(
      { length: k },
      () => []
    );
    rgbColors.forEach((color) => {
      let minDist = Infinity;
      let bestIdx = 0;
      centers.forEach((center, idx) => {
        const dist = colorDistance(color, center);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = idx;
        }
      });
      clusters[bestIdx].push(color);
    });
    // Update centers to mean of assigned colors
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      const mean: [number, number, number] = [0, 0, 0];
      clusters[i].forEach((c) => {
        mean[0] += c[0];
        mean[1] += c[1];
        mean[2] += c[2];
      });
      mean[0] = Math.round(mean[0] / clusters[i].length);
      mean[1] = Math.round(mean[1] / clusters[i].length);
      mean[2] = Math.round(mean[2] / clusters[i].length);
      if (colorDistance(mean, centers[i]) > 1) changed = true;
      centers[i] = mean;
    }
    if (!changed) break;
  }
  // Convert centers back to hex
  return centers.map(rgbToHex);
}

// Map each color to its nearest cluster
function mapColorsToClusters(
  colors: string[],
  clusters: string[]
): { [key: string]: string } {
  const rgbClusters = clusters.map(hexToRgb) as [number, number, number][];
  const colorMap: { [key: string]: string } = {};
  for (const color of colors) {
    const rgb = hexToRgb(color);
    if (!rgb) continue;
    let minDist = Infinity;
    let bestCluster = clusters[0];
    rgbClusters.forEach((center, i) => {
      const dist = colorDistance(rgb, center);
      if (dist < minDist) {
        minDist = dist;
        bestCluster = clusters[i];
      }
    });
    colorMap[color] = bestCluster;
  }
  return colorMap;
}

// Function to extract and quantize colors from SVG
function extractColorsFromSvg(svgContent: string): {
  quantizedSvgContent: string;
  paletteColors: string[];
} {
  const colors = new Set<string>();
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

  // Look for fill and stroke attributes
  const elements = svgDoc.querySelectorAll("[fill], [stroke]");
  elements.forEach((element) => {
    const fill = element.getAttribute("fill");
    const stroke = element.getAttribute("stroke");
    if (
      fill &&
      fill !== "none" &&
      fill !== "transparent" &&
      !fill.startsWith("url(")
    ) {
      colors.add(fill);
    }
    if (
      stroke &&
      stroke !== "none" &&
      stroke !== "transparent" &&
      !stroke.startsWith("url(")
    ) {
      colors.add(stroke);
    }
  });

  // If no colors found, add some default colors
  if (colors.size === 0) {
    colors.add("#68A240");
    colors.add("#333336");
    colors.add("#D5D9CF");
    colors.add("#FFD632");
    colors.add("#D8A128");
  }

  const colorArray = Array.from(colors);
  const k = 10; // Palette size
  // Use k-means for quantization
  const clusters = kMeansQuantize(colorArray, k);
  // Map all colors to their nearest cluster
  const colorMap = mapColorsToClusters(colorArray, clusters);

  // Replace all fill and stroke colors in the SVG with their cluster color
  elements.forEach((element) => {
    const fill = element.getAttribute("fill");
    if (fill && colorMap[fill]) {
      element.setAttribute("fill", colorMap[fill]);
    }
    const stroke = element.getAttribute("stroke");
    if (stroke && colorMap[stroke]) {
      element.setAttribute("stroke", colorMap[stroke]);
    }
  });

  // Serialize the quantized SVG back to a string
  const serializer = new XMLSerializer();
  const quantizedSvgContent = serializer.serializeToString(svgDoc);

  // Return both the quantized SVG and the palette colors
  return { quantizedSvgContent, paletteColors: clusters };
}

// Function to create color palette HTML
function createColorPalette(colors: string[]): string {
  let paletteHtml =
    '<div class="control-group"><label>Color Palette</label><div class="color-palette">';

  colors.forEach((color, index) => {
    paletteHtml += `
      <div class="color-swatch-container">
        <div class="color-swatch" style="background-color: ${color};" data-color="${color}" data-index="${index}"></div>
        <input type="color" class="color-picker-input" value="${color}" data-index="${index}" />
        <span class="color-code">${color}</span>
      </div>
    `;
  });

  paletteHtml += "</div></div>";
  return paletteHtml;
}

function initSvgEditorControls(
  svgContent: string,
  previewArea: HTMLElement,
  index: number
) {
  // Get all control elements
  const iconSizeSlider = document.getElementById(
    "icon-size"
  ) as HTMLInputElement;
  const iconSizeValue = document.getElementById("icon-size-value");
  const paddingSlider = document.getElementById("padding") as HTMLInputElement;
  const paddingValue = document.getElementById("padding-value");
  const thicknessSlider = document.getElementById(
    "thickness"
  ) as HTMLInputElement;
  const thicknessValue = document.getElementById("thickness-value");
  const lineColorPicker = document.getElementById(
    "line-color"
  ) as HTMLInputElement;
  const lineColorValue = document.getElementById("line-color-value");
  const flipHorizontal = document.getElementById("flip-horizontal");
  const flipVertical = document.getElementById("flip-vertical");
  const flipDiagonal1 = document.getElementById("flip-diagonal1");
  const flipDiagonal2 = document.getElementById("flip-diagonal2");
  const rotateCCW = document.getElementById("rotate-ccw");
  const rotateCW = document.getElementById("rotate-cw");
  const rotate180 = document.getElementById("rotate-180");
  const rotateReset = document.getElementById("rotate-reset");
  const diagonalUp = document.getElementById("diagonal-up");
  const diagonalUpRight = document.getElementById("diagonal-upright");
  const diagonalUpLong = document.getElementById("diagonal-uplong");
  const bgNone = document.getElementById("bg-none");
  const bgSquare = document.getElementById("bg-square");
  const bgCircle = document.getElementById("bg-circle");
  const bgCustom = document.getElementById("bg-custom");
  const traceWidthSlider = document.getElementById(
    "trace-width"
  ) as HTMLInputElement;
  const traceWidthValue = document.getElementById("trace-width-value");
  const copySvgBtn = document.getElementById("copy-svg-btn");
  const exportBtn = document.getElementById("export-btn");

  // Set up color swatches and pickers
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const colorPickers = document.querySelectorAll(".color-picker-input");
  const colorCodes = document.querySelectorAll(".color-code");

  // Store original colors for swapping
  const originalColors: { [key: string]: string } = {};
  colorSwatches.forEach((swatch) => {
    const color = (swatch as HTMLElement).dataset.color || "";
    if (color) {
      originalColors[color] = color;
    }
  });

  // Store the original SVG content
  let currentSvg = svgContent;
  let currentRotation = 0;
  let currentFlipH = false;
  let currentFlipV = false;
  let currentFlipD1 = false;
  let currentFlipD2 = false;

  // Store the current palette colors for replacement
  let currentPalette: string[] = [];
  try {
    // Try to extract the palette from the quantized SVG
    const { paletteColors } = extractColorsFromSvg(svgContent);
    currentPalette = paletteColors;
  } catch (e) {
    // fallback: extract from DOM
    currentPalette = [];
  }

  // Add event listeners for controls
  if (iconSizeSlider && iconSizeValue) {
    iconSizeSlider.oninput = () => {
      const size = iconSizeSlider.value;
      if (iconSizeValue) iconSizeValue.textContent = `${size}px`;
      updateSvgPreview();
    };
  }

  if (paddingSlider && paddingValue) {
    paddingSlider.oninput = () => {
      const padding = paddingSlider.value;
      if (paddingValue) paddingValue.textContent = `${padding}%`;
      updateSvgPreview();
    };
  }

  if (thicknessSlider && thicknessValue) {
    thicknessSlider.oninput = () => {
      const thickness = thicknessSlider.value;
      if (thicknessValue) thicknessValue.textContent = `${thickness}%`;
      updateSvgPreview();
    };
  }

  if (lineColorPicker && lineColorValue) {
    lineColorPicker.oninput = () => {
      const color = lineColorPicker.value;
      if (lineColorValue) lineColorValue.textContent = color;
      updateSvgPreview();
    };
  }

  // Set up color swatch interactions
  colorSwatches.forEach((swatch, i) => {
    swatch.addEventListener("click", () => {
      // Open the color picker when swatch is clicked
      const colorPicker = colorPickers[i] as HTMLInputElement;
      colorPicker.click();
    });
  });

  // Set up color picker interactions
  colorPickers.forEach((picker, i) => {
    picker.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const newColor = target.value;
      const dataIndex = target.getAttribute("data-index");
      const swatch = document.querySelector(
        `.color-swatch[data-index="${dataIndex}"]`
      ) as HTMLElement;
      const codeSpan = colorCodes[i];

      if (swatch) {
        const oldColor = swatch.getAttribute("data-color") || "";
        swatch.style.backgroundColor = newColor;
        swatch.setAttribute("data-color", newColor);

        // Update the color code display
        if (codeSpan) {
          codeSpan.textContent = newColor;
        }

        // Update originalColors mapping for SVG replacement
        if (oldColor) {
          originalColors[oldColor] = newColor;
        }

        // Apply to SVG: replace ALL SVG elements using this palette color
        // Parse the current SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(currentSvg, "image/svg+xml");
        const svgElement = svgDoc.documentElement;
        const elements = svgElement.querySelectorAll("[fill], [stroke]");
        elements.forEach((element) => {
          if (element.getAttribute("fill") === oldColor) {
            element.setAttribute("fill", newColor);
          }
          if (element.getAttribute("stroke") === oldColor) {
            element.setAttribute("stroke", newColor);
          }
        });
        // Serialize and update preview
        const serializer = new XMLSerializer();
        currentSvg = serializer.serializeToString(svgDoc);
        const svgContainer = previewArea.querySelector("div");
        if (svgContainer) {
          svgContainer.innerHTML = currentSvg;
        }
      }
    });
  });

  if (flipHorizontal) {
    flipHorizontal.onclick = () => {
      currentFlipH = !currentFlipH;
      flipHorizontal.classList.toggle("active");
      updateSvgPreview();
    };
  }

  if (flipVertical) {
    flipVertical.onclick = () => {
      currentFlipV = !currentFlipV;
      flipVertical.classList.toggle("active");
      updateSvgPreview();
    };
  }

  if (flipDiagonal1) {
    flipDiagonal1.onclick = () => {
      currentFlipD1 = !currentFlipD1;
      flipDiagonal1.classList.toggle("active");
      updateSvgPreview();
    };
  }

  if (flipDiagonal2) {
    flipDiagonal2.onclick = () => {
      currentFlipD2 = !currentFlipD2;
      flipDiagonal2.classList.toggle("active");
      updateSvgPreview();
    };
  }

  if (rotateCCW) {
    rotateCCW.onclick = () => {
      currentRotation = (currentRotation - 90) % 360;
      updateRotationUI();
      updateSvgPreview();
    };
  }

  if (rotateCW) {
    rotateCW.onclick = () => {
      currentRotation = (currentRotation + 90) % 360;
      updateRotationUI();
      updateSvgPreview();
    };
  }

  if (rotate180) {
    rotate180.onclick = () => {
      currentRotation = (currentRotation + 180) % 360;
      updateRotationUI();
      updateSvgPreview();
    };
  }

  if (rotateReset) {
    rotateReset.onclick = () => {
      currentRotation = 0;
      updateRotationUI();
      updateSvgPreview();
    };
  }

  function updateRotationUI() {
    // Remove active class from all rotation buttons
    if (rotateCCW) rotateCCW.classList.remove("active");
    if (rotateCW) rotateCW.classList.remove("active");
    if (rotate180) rotate180.classList.remove("active");

    // Highlight the reset button only if rotation is 0
    if (rotateReset) {
      if (currentRotation === 0) {
        rotateReset.classList.add("active");
      } else {
        rotateReset.classList.remove("active");
      }
    }
  }

  // Diagonal transformations
  if (diagonalUp) {
    diagonalUp.onclick = () => {
      toggleDiagonalButtons(diagonalUp);
      updateSvgPreview();
    };
  }

  if (diagonalUpRight) {
    diagonalUpRight.onclick = () => {
      toggleDiagonalButtons(diagonalUpRight);
      updateSvgPreview();
    };
  }

  if (diagonalUpLong) {
    diagonalUpLong.onclick = () => {
      toggleDiagonalButtons(diagonalUpLong);
      updateSvgPreview();
    };
  }

  function toggleDiagonalButtons(activeButton: HTMLElement | null) {
    // Remove active class from all diagonal buttons
    if (diagonalUp) diagonalUp.classList.remove("active");
    if (diagonalUpRight) diagonalUpRight.classList.remove("active");
    if (diagonalUpLong) diagonalUpLong.classList.remove("active");

    // Add active to clicked button if not already active
    if (activeButton) {
      if (activeButton.classList.contains("active")) {
        activeButton.classList.remove("active");
      } else {
        activeButton.classList.add("active");
      }
    }
  }

  if (bgNone) {
    bgNone.onclick = () => {
      toggleBgButtons(bgNone);
      updateSvgPreview();
    };
  }

  if (bgSquare) {
    bgSquare.onclick = () => {
      toggleBgButtons(bgSquare);
      updateSvgPreview();
    };
  }

  if (bgCircle) {
    bgCircle.onclick = () => {
      toggleBgButtons(bgCircle);
      updateSvgPreview();
    };
  }

  if (bgCustom) {
    bgCustom.onclick = () => {
      toggleBgButtons(bgCustom);
      updateSvgPreview();
    };
  }

  function toggleBgButtons(activeButton: HTMLElement | null) {
    // Remove active class from all background buttons
    if (bgNone) bgNone.classList.remove("active");
    if (bgSquare) bgSquare.classList.remove("active");
    if (bgCircle) bgCircle.classList.remove("active");
    if (bgCustom) bgCustom.classList.remove("active");

    // Add active to clicked button
    if (activeButton) {
      activeButton.classList.add("active");
    }
  }

  // Set bgNone as active by default
  if (bgNone) {
    bgNone.classList.add("active");
  }

  if (traceWidthSlider && traceWidthValue) {
    traceWidthSlider.oninput = () => {
      const width = traceWidthSlider.value;
      if (traceWidthValue) traceWidthValue.textContent = `${width}%`;
      updateSvgPreview();
    };
  }

  if (copySvgBtn) {
    copySvgBtn.onclick = () => {
      // Copy the current SVG to clipboard
      navigator.clipboard
        .writeText(currentSvg)
        .then(() => {
          // Show tooltip instead of alert
          const tooltip = document.createElement("div");
          tooltip.className = "copied-tooltip";
          tooltip.textContent = "Copied!";
          copySvgBtn.appendChild(tooltip);

          // Remove tooltip after 2 seconds
          setTimeout(() => {
            tooltip.remove();
          }, 2000);
        })
        .catch((err) => {
          console.error("Could not copy SVG: ", err);
        });
    };
  }

  if (exportBtn) {
    exportBtn.onclick = () => {
      // Download the current SVG
      const blob = new Blob([currentSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited-vector-illustration-${index + 1}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // Function to update the SVG preview based on current settings
  function updateSvgPreview() {
    // Parse the original SVG content
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    // Ensure SVG has proper viewBox if missing
    if (
      !svgElement.hasAttribute("viewBox") &&
      svgElement.hasAttribute("width") &&
      svgElement.hasAttribute("height")
    ) {
      const width = svgElement.getAttribute("width") || "200";
      const height = svgElement.getAttribute("height") || "200";
      svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    // Always set preserveAspectRatio to display properly
    svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Apply color replacements
    replaceColors(svgDoc, originalColors);

    // Get or create a transform group to hold the image
    let transformGroup = svgElement.querySelector("g.transform-group");

    // Apply size
    if (iconSizeSlider) {
      const size = iconSizeSlider.value;
      svgElement.setAttribute("width", size);
      svgElement.setAttribute("height", size);

      // Update viewBox to maintain aspect ratio if it doesn't exist
      if (!svgElement.hasAttribute("viewBox")) {
        svgElement.setAttribute("viewBox", `0 0 ${size} ${size}`);
      }
    }

    // Apply padding
    if (paddingSlider && svgElement.querySelector("image")) {
      const padding = parseInt(paddingSlider.value);
      const size = parseInt(iconSizeSlider?.value || "200");
      const paddingValue = (padding / 100) * size;

      if (svgElement.querySelector("image")) {
        const newSize = size - paddingValue * 2;
        svgElement.querySelector("image")?.setAttribute("x", `${paddingValue}`);
        svgElement.querySelector("image")?.setAttribute("y", `${paddingValue}`);
        svgElement.querySelector("image")?.setAttribute("width", `${newSize}`);
        svgElement.querySelector("image")?.setAttribute("height", `${newSize}`);
      }
    }

    // Apply line color to any path or stroke elements
    if (lineColorPicker) {
      const color = lineColorPicker.value;
      const pathElements = svgElement.querySelectorAll(
        "path, line, rect, circle, polygon"
      );

      pathElements.forEach((path) => {
        path.setAttribute("stroke", color);
      });
    }

    // Apply transformations to the transform group or the main SVG content
    const contentToTransform = transformGroup || svgElement;
    if (contentToTransform) {
      // Get the center of the SVG for transformations
      const size = parseInt(iconSizeSlider?.value || "200");
      const centerX = size / 2;
      const centerY = size / 2;

      // Initialize transform string
      let transformString = `translate(${centerX} ${centerY})`;

      // Apply rotations
      transformString += ` rotate(${currentRotation})`;

      // Apply flips
      let scaleX = currentFlipH ? -1 : 1;
      let scaleY = currentFlipV ? -1 : 1;

      // Apply diagonal flips (simple implementation)
      if (currentFlipD1) {
        // Swap X and Y for diagonal flip
        const temp = scaleX;
        scaleX = scaleY;
        scaleY = temp;
      }

      if (currentFlipD2) {
        // Swap X and Y and negate for other diagonal
        const temp = scaleX;
        scaleX = -scaleY;
        scaleY = -temp;
      }

      transformString += ` scale(${scaleX}, ${scaleY})`;

      // Apply diagonal transformations
      if (diagonalUp && diagonalUp.classList.contains("active")) {
        transformString += ` skewX(15)`;
      }

      if (diagonalUpRight && diagonalUpRight.classList.contains("active")) {
        transformString += ` skewY(15)`;
      }

      if (diagonalUpLong && diagonalUpLong.classList.contains("active")) {
        transformString += ` skewX(30) skewY(15)`;
      }

      // Apply final translate back to origin
      transformString += ` translate(${-centerX} ${-centerY})`;

      // Set the transform attribute
      contentToTransform.setAttribute("transform", transformString);
    }

    // Add background shape if selected
    let bgShape = svgElement.querySelector(".bg-shape");
    if (bgShape) {
      svgElement.removeChild(bgShape);
      bgShape = null;
    }

    // Check which background shape is active
    if (bgSquare && bgSquare.classList.contains("active")) {
      const size = parseInt(iconSizeSlider?.value || "200");
      bgShape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgShape.classList.add("bg-shape");
      bgShape.setAttribute("x", "0");
      bgShape.setAttribute("y", "0");
      bgShape.setAttribute("width", size.toString());
      bgShape.setAttribute("height", size.toString());
      bgShape.setAttribute("fill", "#ffffff");
      bgShape.setAttribute("stroke", "none");

      // Insert bgShape as the first child
      svgElement.insertBefore(bgShape, svgElement.firstChild);
    } else if (bgCircle && bgCircle.classList.contains("active")) {
      const size = parseInt(iconSizeSlider?.value || "200");
      const radius = size / 2;

      bgShape = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      bgShape.classList.add("bg-shape");
      bgShape.setAttribute("cx", radius.toString());
      bgShape.setAttribute("cy", radius.toString());
      bgShape.setAttribute("r", radius.toString());
      bgShape.setAttribute("fill", "#ffffff");
      bgShape.setAttribute("stroke", "none");

      // Insert bgShape as the first child
      svgElement.insertBefore(bgShape, svgElement.firstChild);
    } else if (bgCustom && bgCustom.classList.contains("active")) {
      // Custom shape (pentagon example)
      const size = parseInt(iconSizeSlider?.value || "200");
      const centerX = size / 2;
      const centerY = size / 2;
      const radius = size * 0.45;

      bgShape = document.createElementNS("http://www.w3.org/2000/svg", "path");

      // Create a pentagon path
      const points = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2; // Start from top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        points.push(`${x},${y}`);
      }

      bgShape.setAttribute("d", `M${points.join(" L")} Z`);
      bgShape.classList.add("bg-shape");
      bgShape.setAttribute("fill", "#ffffff");
      bgShape.setAttribute("stroke", "none");

      // Insert bgShape as the first child
      svgElement.insertBefore(bgShape, svgElement.firstChild);
    }

    // Apply thickness to strokes
    if (thicknessSlider) {
      const thickness = thicknessSlider.value;
      const pathElements = svgElement.querySelectorAll(
        "path, line, rect, circle, polygon"
      );

      pathElements.forEach((path) => {
        if (parseInt(thickness) === 0) {
          path.removeAttribute("stroke-width");
        } else {
          path.setAttribute("stroke-width", thickness);
        }
      });
    }

    // Apply trace width - for simplicity, this adds an outline effect to shapes
    if (traceWidthSlider) {
      const traceWidth = traceWidthSlider.value;
      const pathElements = svgElement.querySelectorAll(
        "path, rect, circle, polygon"
      );

      pathElements.forEach((path) => {
        if (parseInt(traceWidth) === 0) {
          path.removeAttribute("stroke-width");
          path.removeAttribute("stroke");
        } else {
          path.setAttribute("stroke-width", traceWidth);
          path.setAttribute(
            "stroke",
            lineColorPicker ? lineColorPicker.value : "#000000"
          );
          path.setAttribute("fill-opacity", "0.9");
        }
      });
    }

    // Convert back to string
    const serializer = new XMLSerializer();
    currentSvg = serializer.serializeToString(svgDoc);

    // Update the preview
    const svgContainer = previewArea.querySelector("div");
    if (svgContainer) {
      svgContainer.innerHTML = currentSvg;
    }
  }

  // Function to replace colors in the SVG
  function replaceColors(
    svgDoc: Document,
    colorMap: { [key: string]: string }
  ) {
    // Process all elements with fill or stroke attributes
    const elements = svgDoc.querySelectorAll("[fill], [stroke]");

    elements.forEach((element) => {
      // Replace fill attribute if it exists and is in the color map
      const fill = element.getAttribute("fill");
      if (fill && colorMap[fill]) {
        element.setAttribute("fill", colorMap[fill]);
      }

      // Replace stroke attribute if it exists and is in the color map
      const stroke = element.getAttribute("stroke");
      if (stroke && colorMap[stroke]) {
        element.setAttribute("stroke", colorMap[stroke]);
      }
    });

    // Process CSS styles that may contain colors
    const styleElements = svgDoc.querySelectorAll("style");
    styleElements.forEach((styleElement) => {
      let cssText = styleElement.textContent || "";

      // Replace all color occurrences in the CSS
      Object.keys(colorMap).forEach((oldColor) => {
        const regex = new RegExp(
          oldColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "g"
        );
        cssText = cssText.replace(regex, colorMap[oldColor]);
      });

      styleElement.textContent = cssText;
    });
  }

  // Initialize preview
  updateSvgPreview();
}

async function run(value: string) {
  if (framesContainer) framesContainer.textContent = "";
  if (resultContainer) resultContainer.textContent = "";
  resultContainer?.classList.remove("appear");
  switchTab("output");
  if (resultContainer) resultContainer.style.display = "flex";

  updateStatus(`Generating ${outputCount} vector illustrations...`);
  if (generateButton) {
    generateButton.disabled = true;
    generateButton.classList.add("loading");
  }

  try {
    // Create grid container for multiple outputs
    const outputGrid = document.createElement("div");
    outputGrid.className = "output-grid";

    // Generate multiple vector illustrations
    const generationPromises = [];
    for (let i = 0; i < outputCount; i++) {
      generationPromises.push(generateVectorStylePrompt(value));
    }

    // Show progress as each illustration is generated
    const results = [];
    for (let i = 0; i < outputCount; i++) {
      try {
        updateStatus(
          `Generating vector illustration ${i + 1} of ${outputCount}...`
        );
        const result = await generationPromises[i];
        results.push(result);

        // Create and add output card to the grid
        const outputCard = createOutputCard(
          result.imageData,
          result.svgContent,
          i
        );
        outputGrid.appendChild(outputCard);

        // Add to result container as we go to show progress
        if (resultContainer) {
          resultContainer.innerHTML = "";
          resultContainer.appendChild(outputGrid);
          resultContainer.classList.add("appear");
        }
      } catch (error) {
        console.error(`Error generating illustration ${i + 1}:`, error);
      }
    }

    updateStatus("Done!");
    return true;
  } catch (error) {
    console.error("Generation failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateStatus(`Generation failed: ${errorMessage}`);
    return false;
  } finally {
    if (generateButton) {
      generateButton.disabled = false;
      generateButton.classList.remove("loading");
    }
  }
}

// Initialize the app
function main() {
  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      if (promptInput) {
        const value = promptInput.value.trim();
        if (value) {
          await run(value);
        }
      }
    });
  }

  if (viewGalleryButton) {
    viewGalleryButton.addEventListener("click", toggleGallery);
  }

  updateStatus("Ready!");

  // Tab switching
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");
      if (tabName) {
        switchTab(tabName);
      }
    });
  });
}

main();
