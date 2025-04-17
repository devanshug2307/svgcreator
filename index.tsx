/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality } from "@google/genai";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
// We'll use a simpler approach to avoid TypeScript errors
// Instead of using svgo directly, we'll just embed the image in an SVG

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const fps = 4;
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
const generationContainer = document.querySelector(
  ".generation-container"
) as HTMLDivElement;
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message;
  } catch (e) {
    return error;
  }
}

async function createGifFromPngs(
  imageUrls: string[],
  targetWidth = 1024,
  targetHeight = 1024
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create canvas context");
  }
  const gif = GIFEncoder();
  const fpsInterval = 1 / fps;
  const delay = fpsInterval * 1000;

  for (const url of imageUrls) {
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = "#ffffff";
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const format = "rgb444";
    const palette = quantize(data, 256, { format });
    const index = applyPalette(data, palette, format);
    gif.writeFrame(index, targetWidth, targetHeight, { palette, delay });
  }

  gif.finish();
  const buffer = gif.bytesView();
  const blob = new Blob([buffer], { type: "image/gif" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  return img;
}

function updateStatus(message: string, progress = 0) {
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
          // Handle the part.inlineData.data as unknown type
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

    // Create SVG wrapping the PNG
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
      '<image href="' +
      imageData +
      '" width="1024" height="1024"/>' +
      "</svg>";

    return { imageData, svgContent };
  } catch (error) {
    console.error("Error generating vector illustration:", error);
    updateStatus(`Error generating vector illustration: ${parseError(error)}`);
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

  // Create and add image
  const img = new Image();
  img.src = imageData;
  img.className = "result-image";
  img.onclick = () => {
    openSvgEditor(svgContent, index);
  };
  img.style.cursor = "pointer";
  outputCard.appendChild(img);

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
  previewArea.innerHTML = svgContent;

  // Create control panel
  const controlPanel = document.createElement("div");
  controlPanel.className = "svg-editor-controls";

  // Extract colors from SVG before rendering controls
  const svgColors = extractColorsFromSvg(svgContent);
  const colorPalette = createColorPalette(svgColors);

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
  initSvgEditorControls(svgContent, previewArea, index);
}

// Function to extract colors from SVG
function extractColorsFromSvg(svgContent: string): string[] {
  const colors = new Set<string>();
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

  // Look for fill and stroke attributes
  const elements = svgDoc.querySelectorAll("[fill], [stroke]");
  elements.forEach((element) => {
    const fill = element.getAttribute("fill");
    const stroke = element.getAttribute("stroke");

    // Add valid color values (exclude "none", transparent, etc.)
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
    // Basic default colors
    colors.add("#68A240"); // Green
    colors.add("#333336"); // Dark gray
    colors.add("#D5D9CF"); // Light gray
    colors.add("#FFD632"); // Yellow
    colors.add("#D8A128"); // Orange
  }

  return Array.from(colors);
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

        // Apply to SVG
        updateSvgPreview();
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

    // Apply color replacements
    replaceColors(svgDoc, originalColors);

    // Get or create a transform group to hold the image
    let transformGroup = svgElement.querySelector("g.transform-group");
    const imageElement = svgElement.querySelector("image");

    if (!transformGroup && imageElement) {
      // Create transform group
      transformGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      transformGroup.classList.add("transform-group");

      // Move the image into the transform group
      const parent = imageElement.parentNode;
      if (parent) {
        parent.removeChild(imageElement);
        transformGroup.appendChild(imageElement);
        svgElement.appendChild(transformGroup);
      }
    }

    // Apply size
    if (iconSizeSlider) {
      const size = iconSizeSlider.value;
      svgElement.setAttribute("width", size);
      svgElement.setAttribute("height", size);

      // Update viewBox to maintain aspect ratio
      svgElement.setAttribute("viewBox", `0 0 ${size} ${size}`);

      if (imageElement) {
        imageElement.setAttribute("width", size);
        imageElement.setAttribute("height", size);
      }
    }

    // Apply padding
    if (paddingSlider && imageElement) {
      const padding = parseInt(paddingSlider.value);
      const size = parseInt(iconSizeSlider?.value || "200");
      const paddingValue = (padding / 100) * size;

      if (imageElement) {
        const newSize = size - paddingValue * 2;
        imageElement.setAttribute("x", `${paddingValue}`);
        imageElement.setAttribute("y", `${paddingValue}`);
        imageElement.setAttribute("width", `${newSize}`);
        imageElement.setAttribute("height", `${newSize}`);
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
    previewArea.innerHTML = currentSvg;
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
    const msg = parseError(error);
    console.error("Error generating vector illustrations:", error);
    updateStatus(`Error generating vector illustrations: ${msg}`);
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
