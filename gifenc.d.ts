// Basic type declaration for gifenc
declare module "gifenc" {
  export function GIFEncoder(options?: any): any;
  export function quantize(
    pixels: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: any
  ): any;
  export function applyPalette(
    pixels: Uint8Array | Uint8ClampedArray,
    palette: any,
    format?: string
  ): any;
  // Add other exports as needed based on usage
}
