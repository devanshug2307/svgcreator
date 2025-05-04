import React from "react";
import "./Gallery.css";

interface SVGItem {
  id: number;
  prompt: string;
  svg: string;
}

const dummySVGs: SVGItem[] = [
  {
    id: 1,
    prompt: "A cute cartoon cat playing with a ball of yarn",
    svg: `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="50" fill="#FFD700"/>
      <circle cx="80" cy="80" r="10" fill="#000"/>
      <circle cx="120" cy="80" r="10" fill="#000"/>
      <path d="M90 120 Q100 130 110 120" stroke="#000" fill="none" stroke-width="2"/>
    </svg>`,
  },
  {
    id: 2,
    prompt: "A simple house with a tree",
    svg: `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect x="50" y="100" width="100" height="80" fill="#8B4513"/>
      <polygon points="50,100 100,50 150,100" fill="#FF0000"/>
      <circle cx="150" cy="70" r="30" fill="#228B22"/>
    </svg>`,
  },
  {
    id: 3,
    prompt: "A smiling sun with rays",
    svg: `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="40" fill="#FFD700"/>
      <path d="M100 50 L100 30 M100 170 L100 150 M50 100 L30 100 M170 100 L150 100" stroke="#FFD700" stroke-width="4"/>
      <path d="M70 70 L50 50 M130 70 L150 50 M70 130 L50 150 M130 130 L150 150" stroke="#FFD700" stroke-width="4"/>
      <circle cx="80" cy="90" r="5" fill="#000"/>
      <circle cx="120" cy="90" r="5" fill="#000"/>
      <path d="M80 110 Q100 120 120 110" stroke="#000" fill="none" stroke-width="2"/>
    </svg>`,
  },
  {
    id: 4,
    prompt: "A simple flower with petals",
    svg: `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="20" fill="#FFD700"/>
      <circle cx="100" cy="100" r="15" fill="#FF69B4"/>
      <path d="M100 50 L100 150" stroke="#228B22" stroke-width="4"/>
      <path d="M100 50 Q120 60 130 80" stroke="#228B22" stroke-width="4" fill="none"/>
      <path d="M100 50 Q80 60 70 80" stroke="#228B22" stroke-width="4" fill="none"/>
    </svg>`,
  },
];

const Gallery: React.FC = () => {
  return (
    <div className="gallery-container">
      <h1>SVG Gallery</h1>
      <div className="gallery-grid">
        {dummySVGs.map((item) => (
          <div key={item.id} className="gallery-item">
            <div
              className="svg-container"
              dangerouslySetInnerHTML={{ __html: item.svg }}
            />
            <div className="prompt-text">{item.prompt}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Gallery;
