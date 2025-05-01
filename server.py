from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import base64
from io import BytesIO
from PIL import Image
import vtracer
import tempfile
import os

app = FastAPI()

# Enable CORS with specific configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.post("/vectorize")
async def vectorize_image(file: UploadFile = File(...)):
    try:
        # Create a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create temporary file paths
            temp_input = os.path.join(temp_dir, "input.png")
            temp_output = os.path.join(temp_dir, "output.svg")
            
            # Read and save the uploaded file
            contents = await file.read()
            with open(temp_input, "wb") as f:
                f.write(contents)
            
            # Convert to vector using VTracer's Python API
            vtracer.convert_image_to_svg_py(
                temp_input,
                temp_output,
                colormode='color',
                hierarchical='stacked',
                mode='spline',
                filter_speckle=4,
                color_precision=6,
                layer_difference=16,
                corner_threshold=60,
                length_threshold=4.0,
                max_iterations=10,
                splice_threshold=45,
                path_precision=3
            )
            
            # Read the generated SVG
            with open(temp_output, 'r') as f:
                svg_content = f.read()
            
            return {"svg": svg_content}
            
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return {"error": str(e)}, 500

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 