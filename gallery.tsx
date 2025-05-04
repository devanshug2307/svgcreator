import React from "react";
import ReactDOM from "react-dom/client";
import Gallery from "./src/pages/Gallery";

// Initialize the gallery
const galleryContainer = document.getElementById("gallery-content");
if (galleryContainer) {
  const root = ReactDOM.createRoot(galleryContainer);
  root.render(<Gallery />);
}
