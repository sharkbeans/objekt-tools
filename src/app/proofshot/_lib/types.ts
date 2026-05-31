export type AspectRatio = "3:4" | "9:16" | "1:1";
export type EditMode = "photocard" | "background";
export type Layer = "front" | "back";

export interface BackgroundTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

export interface PhotocardTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  layer: Layer;
  showToploader: boolean;
}

export interface GifState {
  isGif: boolean;
  frames: HTMLImageElement[];
  delays: number[];
  currentFrame: number;
  lastFrameTime: number;
  animationFrame: number | null;
}

export interface VideoState {
  isVideo: boolean;
  element: HTMLVideoElement | null;
  originalFile: File | null;
  animationFrame: number | null;
}

export interface CameraState {
  active: boolean;
  stream: MediaStream | null;
  video: HTMLVideoElement | null;
  facingMode: "user" | "environment";
  animationFrame: number | null;
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface GestureState {
  active: boolean;
  startDistance: number;
  startAngle: number;
  startScale: number;
  startRotation: number;
  lastX: number;
  lastY: number;
  lastCenterX?: number;
  lastCenterY?: number;
  pointers: Array<{ id: number; x: number; y: number }>;
}

export interface CropState {
  enabled: boolean;
  aspectRatio: string | null;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ExportVideoResult {
  blob: Blob;
  mimeType: string;
  extension: string;
}
