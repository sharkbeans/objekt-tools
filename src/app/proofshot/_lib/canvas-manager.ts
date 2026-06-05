import { parseGIF, decompressFrames, type ParsedFrame } from "gifuct-js";
import { GifReader } from "omggif";
import { ToploaderConfig } from "./toploader-config";
import { BorderManager } from "./border-manager";
import type {
  BackgroundTransform,
  PhotocardTransform,
  GifState,
  VideoState,
  CameraState,
  GestureState,
  CropState,
  ExportVideoResult,
  EditMode,
} from "./types";

export class CanvasManager {
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  backgroundImage: HTMLImageElement | HTMLVideoElement | null = null;
  photocardImage: HTMLImageElement | HTMLVideoElement | null = null;
  originalPhotocardImage: HTMLImageElement | null = null;
  originalPhotocardFile: File | null = null;
  frameMode = false;
  isPlaceholder = false;
  modalOpen = false;
  onUploadRequest: (() => void) | null = null;
  borderManager: BorderManager | null = null;

  photocardGif: GifState = this.freshGifState();
  backgroundGif: GifState = this.freshGifState();
  photocardVideo: VideoState = this.freshVideoState();
  backgroundVideo: VideoState = this.freshVideoState();

  camera: CameraState = {
    active: false,
    stream: null,
    video: null,
    facingMode: "environment",
    animationFrame: null,
    currentZoom: 1,
    minZoom: 1,
    maxZoom: 10,
  };

  background: BackgroundTransform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
  photocard: PhotocardTransform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false, layer: "front", showToploader: true };
  crop: CropState = { enabled: false, aspectRatio: null, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  editMode: EditMode = "photocard";

  private animation = { active: false, velocityX: 0, velocityY: 0 };
  private photocardSavedPos = { x: 0, y: 0 };
  private gesture: GestureState = {
    active: false, startDistance: 0, startAngle: 0, startScale: 1,
    startRotation: 0, lastX: 0, lastY: 0, pointers: [],
  };
  private toploaderGradientCache = {
    westGradient: null as CanvasGradient | null,
    eastGradient: null as CanvasGradient | null,
    southGradient: null as CanvasGradient | null,
    cachedWidth: null as number | null,
    cachedHeight: null as number | null,
  };

  private freshGifState(): GifState {
    return { isGif: false, frames: [], delays: [], currentFrame: 0, lastFrameTime: 0, animationFrame: null };
  }

  private freshVideoState(): VideoState {
    return { isVideo: false, element: null, originalFile: null, animationFrame: null };
  }

  init(canvas: HTMLCanvasElement, onUploadRequest: () => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.onUploadRequest = onUploadRequest;
    this.resizeCanvas();
    this.attachEventListeners();
    this.loadPlaceholderPhotocard();
    this.render();
  }

  setModalOpen(open: boolean) {
    this.modalOpen = open;
  }

  resizeCanvas() {
    const container = this.canvas.parentElement!;
    const isCameraActive = container.classList.contains("camera-active");
    const isPreviewMode = container.classList.contains("preview-mode");

    let canvasWidth: number, canvasHeight: number;

    if (isCameraActive) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (container.classList.contains("aspect-3-4")) {
        canvasWidth = Math.min(vh * 0.75, vw);
        canvasHeight = canvasWidth * (4 / 3);
      } else if (container.classList.contains("aspect-9-16")) {
        canvasWidth = Math.min(vh * 0.5625, vw);
        canvasHeight = canvasWidth * (16 / 9);
      } else if (container.classList.contains("aspect-1-1")) {
        canvasWidth = Math.min(vh, vw);
        canvasHeight = canvasWidth;
      } else {
        canvasWidth = Math.min(vh * 0.75, vw);
        canvasHeight = canvasWidth * (4 / 3);
      }
    } else if (isPreviewMode) {
      this.updatePreviewDisplay();
      return;
    } else {
      const rect = container.getBoundingClientRect();
      canvasWidth = rect.width;
      canvasHeight = rect.height;
      if (canvasWidth < 100 || canvasHeight < 100) {
        canvasWidth = 600;
        canvasHeight = 800;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = canvasWidth * dpr;
    this.canvas.height = canvasHeight * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    if (!isCameraActive) {
      this.canvas.style.width = canvasWidth + "px";
      this.canvas.style.height = canvasHeight + "px";
    }

    this.render();
  }

  private updatePreviewDisplay() {
    const container = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const bufferWidth = this.canvas.width / dpr;
    const bufferHeight = this.canvas.height / dpr;
    this.canvas.style.width = bufferWidth + "px";
    this.canvas.style.height = bufferHeight + "px";

    const containerMaxWidth = 800;
    const containerWidth = container.getBoundingClientRect().width || containerMaxWidth;
    const maxWidth = Math.min(containerMaxWidth, containerWidth);

    if (bufferWidth > maxWidth) {
      const scale = maxWidth / bufferWidth;
      this.canvas.style.transform = `scale(${scale})`;
      this.canvas.style.transformOrigin = "top left";
      container.style.height = bufferHeight * scale + "px";
    } else {
      this.canvas.style.transform = "none";
      container.style.height = "auto";
    }

    this.render();
  }

  private attachEventListeners() {
    window.addEventListener("resize", () => this.resizeCanvas());
    this.canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.handlePointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.handlePointerUp(e));
    this.canvas.addEventListener("touchstart", (e) => {
      if (this.isPlaceholder && e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        if (this.isPointOnPhotocard(touch.clientX - rect.left, touch.clientY - rect.top)) return;
      }
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener("click", (e) => {
      if (!this.photocardImage || !this.isPlaceholder) return;
      const rect = this.canvas.getBoundingClientRect();
      if (this.isPointOnPhotocard(e.clientX - rect.left, e.clientY - rect.top)) {
        e.preventDefault();
        this.onUploadRequest?.();
      }
    });
    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.modalOpen) return;
    if (!this.backgroundImage && !this.photocardImage) return;

    if (this.isPlaceholder && this.gesture.pointers.length === 0) {
      const rect = this.canvas.getBoundingClientRect();
      if (this.isPointOnPhotocard(e.clientX - rect.left, e.clientY - rect.top)) {
        const orig = this.photocard.scale;
        this.photocard.scale *= 0.95;
        this.render();
        this.onUploadRequest?.();
        setTimeout(() => { this.photocard.scale = orig; this.render(); }, 150);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    this.gesture.pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });

    if (this.gesture.pointers.length === 1) {
      if (this.editMode === "photocard") {
        this.photocardSavedPos = { x: this.photocard.x, y: this.photocard.y };
      }
      this.gesture.lastX = e.clientX;
      this.gesture.lastY = e.clientY;
    } else if (this.gesture.pointers.length === 2) {
      const p1 = this.gesture.pointers[0];
      const p2 = this.gesture.pointers[1];
      this.gesture.lastCenterX = (p1.x + p2.x) / 2;
      this.gesture.lastCenterY = (p1.y + p2.y) / 2;
      this.gesture.startDistance = this.getDistance(p1, p2);
      this.gesture.startAngle = this.getAngle(p1, p2);
      this.gesture.startScale = this.editMode === "background" ? this.background.scale : this.photocard.scale;
      this.gesture.startRotation = this.editMode === "background" ? this.background.rotation : this.photocard.rotation;
    }

    this.gesture.active = true;
    this.animation.active = false;
  }

  private handlePointerMove(e: PointerEvent) {
    if (this.modalOpen) return;
    if (this.isPlaceholder && !this.gesture.active) {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.style.cursor = this.isPointOnPhotocard(e.clientX - rect.left, e.clientY - rect.top) ? "pointer" : "grab";
    }
    if (!this.gesture.active) return;

    const idx = this.gesture.pointers.findIndex((p) => p.id === e.pointerId);
    if (idx !== -1) { this.gesture.pointers[idx].x = e.clientX; this.gesture.pointers[idx].y = e.clientY; }

    if (this.editMode === "background" && this.backgroundImage) {
      if (this.gesture.pointers.length === 1) {
        const dx = e.clientX - this.gesture.lastX;
        const dy = e.clientY - this.gesture.lastY;
        this.background.x += dx;
        this.background.y += dy;
        this.gesture.lastX = e.clientX;
        this.gesture.lastY = e.clientY;
        this.animation.velocityX = dx;
        this.animation.velocityY = dy;
      } else if (this.gesture.pointers.length === 2) {
        const p1 = this.gesture.pointers[0];
        const p2 = this.gesture.pointers[1];
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        if (this.gesture.lastCenterX !== undefined) {
          this.background.x += cx - this.gesture.lastCenterX;
          this.background.y += cy - (this.gesture.lastCenterY ?? cy);
        }
        this.gesture.lastCenterX = cx;
        this.gesture.lastCenterY = cy;
        this.background.scale = Math.max(0.1, Math.min(3, this.gesture.startScale * (this.getDistance(p1, p2) / this.gesture.startDistance)));
      }
    } else if (this.editMode === "photocard" && this.photocardImage) {
      if (this.gesture.pointers.length === 1) {
        const dx = e.clientX - this.gesture.lastX;
        const dy = e.clientY - this.gesture.lastY;
        this.photocard.x += dx;
        this.photocard.y += dy;
        this.gesture.lastX = e.clientX;
        this.gesture.lastY = e.clientY;
        this.animation.velocityX = dx;
        this.animation.velocityY = dy;
      } else if (this.gesture.pointers.length === 2) {
        const p1 = this.gesture.pointers[0];
        const p2 = this.gesture.pointers[1];
        this.photocard.scale = Math.max(0.1, Math.min(5, this.gesture.startScale * (this.getDistance(p1, p2) / this.gesture.startDistance)));
        this.photocard.rotation = this.gesture.startRotation + (this.getAngle(p1, p2) - this.gesture.startAngle);
      }
    }
    this.render();
  }

  private handlePointerUp(e: PointerEvent) {
    this.gesture.pointers = this.gesture.pointers.filter((p) => p.id !== e.pointerId);
    if (this.gesture.pointers.length === 0) {
      this.gesture.active = false;
      this.gesture.lastCenterX = undefined;
      this.gesture.lastCenterY = undefined;
      if (Math.abs(this.animation.velocityX) > 1 || Math.abs(this.animation.velocityY) > 1) {
        this.startInertia();
      } else if (this.editMode === "photocard" && !this.isPhotocardVisible()) {
        this.snapPhotocardBack();
      }
    } else if (this.gesture.pointers.length === 1) {
      const p = this.gesture.pointers[0];
      this.gesture.lastX = p.x;
      this.gesture.lastY = p.y;
      this.gesture.lastCenterX = undefined;
      this.gesture.lastCenterY = undefined;
    }
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    if (this.editMode === "background" && this.backgroundImage) {
      this.background.scale = Math.max(0.1, Math.min(3, this.background.scale * delta));
    } else if (this.editMode === "photocard" && this.photocardImage) {
      this.photocard.scale = Math.max(0.1, Math.min(5, this.photocard.scale * delta));
    }
    this.render();
  }

  private startInertia() {
    this.animation.active = true;
    const animate = () => {
      if (!this.animation.active) return;
      if (this.editMode === "background" && this.backgroundImage) {
        this.background.x += this.animation.velocityX;
        this.background.y += this.animation.velocityY;
      } else if (this.editMode === "photocard" && this.photocardImage) {
        this.photocard.x += this.animation.velocityX;
        this.photocard.y += this.animation.velocityY;
      }
      this.animation.velocityX *= 0.9;
      this.animation.velocityY *= 0.9;
      if (Math.abs(this.animation.velocityX) < 0.1 && Math.abs(this.animation.velocityY) < 0.1) {
        this.animation.active = false;
        if (this.editMode === "photocard" && !this.isPhotocardVisible()) {
          this.snapPhotocardBack();
        }
        return;
      }
      this.render();
      requestAnimationFrame(animate);
    };
    animate();
  }

  private isPhotocardVisible(): boolean {
    if (!this.photocardImage) return false;
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.width / dpr;
    const ch = this.canvas.height / dpr;
    const img = this.photocardImage as HTMLImageElement & HTMLVideoElement;
    const iw = (img.videoWidth ?? img.width) * this.photocard.scale;
    const ih = (img.videoHeight ?? img.height) * this.photocard.scale;
    const cos = Math.abs(Math.cos(this.photocard.rotation));
    const sin = Math.abs(Math.sin(this.photocard.rotation));
    const hw = (iw * cos + ih * sin) / 2;
    const hh = (iw * sin + ih * cos) / 2;
    const { x, y } = this.photocard;
    return x + hw > 0 && x - hw < cw && y + hh > 0 && y - hh < ch;
  }

  private snapPhotocardBack() {
    const startX = this.photocard.x;
    const startY = this.photocard.y;
    const targetX = this.photocardSavedPos.x;
    const targetY = this.photocardSavedPos.y;
    const duration = 300;
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.photocard.x = startX + (targetX - startX) * ease;
      this.photocard.y = startY + (targetY - startY) * ease;
      this.render();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }

  private getAngle(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  isPointOnPhotocard(x: number, y: number) {
    if (!this.photocardImage) return false;
    const dx = x - this.photocard.x;
    const dy = y - this.photocard.y;
    const cos = Math.cos(-this.photocard.rotation);
    const sin = Math.sin(-this.photocard.rotation);
    const lx = (dx * cos - dy * sin) / this.photocard.scale;
    const ly = (dx * sin + dy * cos) / this.photocard.scale;
    const w = (this.photocardImage as HTMLVideoElement).videoWidth ?? (this.photocardImage as HTMLImageElement).width;
    const h = (this.photocardImage as HTMLVideoElement).videoHeight ?? (this.photocardImage as HTMLImageElement).height;
    return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  async startCamera(videoEl: HTMLVideoElement) {
    this.camera.video = videoEl;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: this.camera.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    this.camera.stream = stream;
    videoEl.srcObject = stream;
    this.camera.active = true;
    await new Promise<void>((res) => { videoEl.onloadedmetadata = () => res(); });
    this.renderCameraFrame();
  }

  stopCamera() {
    this.camera.stream?.getTracks().forEach((t) => t.stop());
    this.camera.stream = null;
    if (this.camera.animationFrame) cancelAnimationFrame(this.camera.animationFrame);
    this.camera.animationFrame = null;
    this.camera.active = false;
    this.camera.video = null;
    this.render();
  }

  private renderCameraFrame() {
    if (!this.camera.active || !this.camera.video) return;
    this.render();
    this.camera.animationFrame = requestAnimationFrame(() => this.renderCameraFrame());
  }

  captureFrame() {
    if (!this.camera.active || !this.camera.video) return;
    const cap = document.createElement("canvas");
    cap.width = this.camera.video.videoWidth;
    cap.height = this.camera.video.videoHeight;
    cap.getContext("2d")!.drawImage(this.camera.video, 0, 0);
    const img = new Image();
    img.onload = () => {
      this.backgroundImage = img;
      this.stopCamera();
      if (!this.photocardImage || this.isPlaceholder) this.loadPlaceholderPhotocard();
    };
    img.src = cap.toDataURL("image/png");
  }

  setCameraZoom(zoom: number): Promise<boolean> {
    if (!this.camera.stream || !this.camera.active) return Promise.resolve(false);
    const clamped = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, zoom));
    this.camera.currentZoom = clamped;
    const track = this.camera.stream.getVideoTracks()[0];
    if (!track?.getCapabilities) return Promise.resolve(false);
    const caps = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number; max: number } };
    if (!caps.zoom) return Promise.resolve(false);
    return track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] }).then(() => true).catch(() => false);
  }

  getCameraZoom() { return this.camera.currentZoom; }

  // ── Image loading ──────────────────────────────────────────────────────────

  loadPlaceholderPhotocard() {
    const svg = `<svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="900" rx="28" fill="#6d22ff" fill-opacity="0.08" stroke="#7435ff" stroke-width="2.5" stroke-opacity="0.45" stroke-dasharray="14 8"/>
      <circle cx="300" cy="392" r="48" fill="#6d22ff" fill-opacity="0.18"/>
      <path d="M300 414 L300 372 M285 387 L300 370 L315 387" stroke="#a58cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <text x="300" y="490" font-family="-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="34" font-weight="600" letter-spacing="-0.5" fill="#c4a8ff" fill-opacity="0.95" text-anchor="middle">Upload Photocard</text>
      <text x="300" y="528" font-family="-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="24" font-weight="400" fill="#8d74ff" fill-opacity="0.8" text-anchor="middle">Tap anywhere to begin</text>
    </svg>`;
    const img = new Image();
    img.onload = () => {
      this.photocardImage = img;
      this.originalPhotocardImage = null;
      this.originalPhotocardFile = null;
      this.frameMode = false;
      this.isPlaceholder = true;
      this.canvas.classList.add("placeholder-active");
      const rect = this.canvas.getBoundingClientRect();
      this.photocard.x = 450;
      this.photocard.y = 470;
      this.photocard.rotation = -15 * Math.PI / 180;
      this.photocard.scale = Math.min(rect.width, rect.height) / (img.width * 3);
      this.render();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svg);
  }

  loadBackground(file: File): Promise<void> {
    if (file.type.startsWith("video/")) return this.loadBackgroundVideo(file);
    if (file.type === "image/gif") return this.loadBackgroundGif(file);
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          this.backgroundImage = img;
          this.backgroundGif.isGif = false;
          this.backgroundVideo.isVideo = false;
          this.render();
          res();
        };
        img.onerror = rej;
        img.src = e.target!.result as string;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  private async loadBackgroundGif(file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const gif = await this.parseGif(buf);
    this.backgroundGif = { isGif: true, frames: gif.frames, delays: gif.delays, currentFrame: 0, lastFrameTime: performance.now(), animationFrame: null };
    this.backgroundImage = gif.frames[0];
    this.startBackgroundGifAnimation();
    this.render();
  }

  private async loadBackgroundVideo(file: File): Promise<void> {
    return new Promise((res, rej) => {
      const video = document.createElement("video");
      video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = false;
      const url = URL.createObjectURL(file);
      let init = false;
      video.onloadedmetadata = () => { this.backgroundVideo.isVideo = true; this.backgroundVideo.element = video; this.backgroundVideo.originalFile = file; this.backgroundGif.isGif = false; video.currentTime = 0; };
      video.onseeked = () => {
        if (init) return; init = true;
        this.backgroundImage = video;
        video.play().then(() => { this.startBackgroundVideoAnimation(); this.render(); res(); }).catch(rej);
      };
      video.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Failed to load video")); };
      video.src = url;
    });
  }

  loadPhotocard(file: File): Promise<void> {
    if (file.type.startsWith("video/")) return this.loadPhotocardVideo(file);
    if (file.type === "image/gif") return this.loadPhotocardGif(file);
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          this.photocardImage = img;
          this.originalPhotocardImage = img;
          this.originalPhotocardFile = file;
          this.frameMode = false;
          this.isPlaceholder = false;
          this.photocardGif.isGif = false;
          this.photocardVideo.isVideo = false;
          this.canvas.classList.remove("placeholder-active");
          this.canvas.style.cursor = "grab";
          const rect = this.canvas.getBoundingClientRect();
          this.photocard.x = 450;
          this.photocard.y = 470;
          this.photocard.rotation = -15 * Math.PI / 180;
          this.photocard.scale = Math.min(rect.width, rect.height) / (img.width * 3);
          this.render();
          res();
        };
        img.onerror = rej;
        img.src = e.target!.result as string;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  private async loadPhotocardGif(file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const gif = await this.parseGif(buf);
    this.photocardGif = { isGif: true, frames: gif.frames, delays: gif.delays, currentFrame: 0, lastFrameTime: performance.now(), animationFrame: null };
    this.photocardImage = gif.frames[0];
    this.originalPhotocardImage = null;
    this.originalPhotocardFile = null;
    this.frameMode = false;
    this.isPlaceholder = false;
    this.canvas.classList.remove("placeholder-active");
    this.canvas.style.cursor = "grab";
    this.photocard.x = 450;
    this.photocard.y = 470;
    this.photocard.rotation = -15 * Math.PI / 180;
    const rect = this.canvas.getBoundingClientRect();
    this.photocard.scale = Math.min(rect.width, rect.height) / (gif.frames[0].width * 1.5);
    this.startPhotocardGifAnimation();
    this.render();
  }

  private async loadPhotocardVideo(file: File): Promise<void> {
    return new Promise((res, rej) => {
      const video = document.createElement("video");
      video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = false;
      const url = URL.createObjectURL(file);
      let init = false;
      video.onloadedmetadata = () => { this.photocardVideo.isVideo = true; this.photocardVideo.element = video; this.photocardVideo.originalFile = file; this.photocardGif.isGif = false; this.isPlaceholder = false; video.currentTime = 0; };
      video.onseeked = () => {
        if (init) return; init = true;
        this.photocardImage = video;
        this.originalPhotocardImage = null;
        this.originalPhotocardFile = null;
        this.frameMode = false;
        this.canvas.classList.remove("placeholder-active");
        this.canvas.style.cursor = "grab";
        this.photocard.x = 450;
        this.photocard.y = 470;
        this.photocard.rotation = -15 * Math.PI / 180;
        const rect = this.canvas.getBoundingClientRect();
        this.photocard.scale = Math.min(rect.width, rect.height) / (video.videoWidth * 1.5);
        video.play().then(() => { this.startPhotocardVideoAnimation(); this.render(); res(); }).catch(rej);
      };
      video.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Failed to load video")); };
      video.src = url;
    });
  }

  // ── GIF parsing ─────────────────────────────────────────────────────────────

  private async parseGif(buf: ArrayBuffer): Promise<{ frames: HTMLImageElement[]; delays: number[] }> {
    // Try gifuct-js first
    try {
      const raw = parseGIF(buf);
      const frames = decompressFrames(raw, true);
      if (frames.length > 0) return this.processGifuctFrames(frames);
    } catch {
      // fall through to omggif
    }

    // Fallback: omggif
    try {
      const reader = new GifReader(new Uint8Array(buf));
      return this.processOmggifFrames(reader);
    } catch {
      throw new Error("Could not parse GIF — no compatible library available");
    }
  }

  private processGifuctFrames(frames: ParsedFrame[]): Promise<{ frames: HTMLImageElement[]; delays: number[] }> {
    return new Promise((res, rej) => {
      if (!frames.length) return rej(new Error("GIF has no frames"));
      const w = frames[0].dims.width;
      const h = frames[0].dims.height;
      const tmp = document.createElement("canvas");
      tmp.width = w; tmp.height = h;
      const tmpCtx = tmp.getContext("2d")!;
      const images: HTMLImageElement[] = [];
      const delays: number[] = [];
      let loaded = 0;
      frames.forEach((frame, i) => {
        const id = tmpCtx.createImageData(frame.dims.width, frame.dims.height);
        id.data.set(frame.patch);
        tmpCtx.putImageData(id, frame.dims.left, frame.dims.top);
        const img = new Image();
        img.onload = () => { if (++loaded === frames.length) res({ frames: images, delays }); };
        img.onerror = () => rej(new Error(`Failed frame ${i}`));
        img.src = tmp.toDataURL("image/png");
        images[i] = img;
        delays[i] = (frame.delay ?? 10) * 10;
      });
    });
  }

  private processOmggifFrames(reader: GifReader): Promise<{ frames: HTMLImageElement[]; delays: number[] }> {
    return new Promise((res, rej) => {
      const n = reader.numFrames();
      const tmp = document.createElement("canvas");
      tmp.width = reader.width; tmp.height = reader.height;
      const tmpCtx = tmp.getContext("2d")!;
      const images: HTMLImageElement[] = [];
      const delays: number[] = [];
      let loaded = 0;
      for (let i = 0; i < n; i++) {
        const info = reader.frameInfo(i);
        const pixels = new Uint8ClampedArray(reader.width * reader.height * 4);
        reader.decodeAndBlitFrameRGBA(i, pixels);
        const id = tmpCtx.createImageData(reader.width, reader.height);
        id.data.set(pixels);
        tmpCtx.putImageData(id, 0, 0);
        const img = new Image();
        img.onload = () => { if (++loaded === n) res({ frames: images, delays }); };
        img.onerror = () => rej(new Error(`Failed frame ${i}`));
        img.src = tmp.toDataURL("image/png");
        images[i] = img;
        delays[i] = (info.delay ?? 10) * 10;
      }
    });
  }

  // ── GIF / Video animation loops ─────────────────────────────────────────────

  private startPhotocardGifAnimation() {
    const animate = (t: number) => {
      if (!this.photocardGif.isGif) return;
      if (t - this.photocardGif.lastFrameTime >= this.photocardGif.delays[this.photocardGif.currentFrame]) {
        this.photocardGif.currentFrame = (this.photocardGif.currentFrame + 1) % this.photocardGif.frames.length;
        this.photocardImage = this.photocardGif.frames[this.photocardGif.currentFrame];
        this.photocardGif.lastFrameTime = t;
        this.render();
      }
      this.photocardGif.animationFrame = requestAnimationFrame(animate);
    };
    this.photocardGif.animationFrame = requestAnimationFrame(animate);
  }

  private startBackgroundGifAnimation() {
    const animate = (t: number) => {
      if (!this.backgroundGif.isGif) return;
      if (t - this.backgroundGif.lastFrameTime >= this.backgroundGif.delays[this.backgroundGif.currentFrame]) {
        this.backgroundGif.currentFrame = (this.backgroundGif.currentFrame + 1) % this.backgroundGif.frames.length;
        this.backgroundImage = this.backgroundGif.frames[this.backgroundGif.currentFrame];
        this.backgroundGif.lastFrameTime = t;
        this.render();
      }
      this.backgroundGif.animationFrame = requestAnimationFrame(animate);
    };
    this.backgroundGif.animationFrame = requestAnimationFrame(animate);
  }

  private stopGifAnim(state: GifState) {
    if (state.animationFrame) { cancelAnimationFrame(state.animationFrame); state.animationFrame = null; }
  }

  private startPhotocardVideoAnimation() {
    const animate = () => { if (!this.photocardVideo.isVideo) return; this.render(); this.photocardVideo.animationFrame = requestAnimationFrame(animate); };
    this.photocardVideo.animationFrame = requestAnimationFrame(animate);
  }

  private startBackgroundVideoAnimation() {
    const animate = () => { if (!this.backgroundVideo.isVideo) return; this.render(); this.backgroundVideo.animationFrame = requestAnimationFrame(animate); };
    this.backgroundVideo.animationFrame = requestAnimationFrame(animate);
  }

  private stopVideoAnim(state: VideoState) {
    if (state.animationFrame) { cancelAnimationFrame(state.animationFrame); state.animationFrame = null; }
    state.element?.pause();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    this.ctx.clearRect(0, 0, w, h);

    if (this.camera.active && this.camera.video) this.drawCameraFeed(w, h);
    else if (this.backgroundImage) this.drawBackground(w, h);

    if (this.photocardImage && this.photocard.layer === "back") this.drawPhotocard();
    this.borderManager?.drawBorder(this.ctx, w, h);
    if (this.photocardImage && this.photocard.layer === "front") this.drawPhotocard();
    this.drawCropOverlay(w, h);
  }

  private drawCameraFeed(w: number, h: number) {
    const video = this.camera.video!;
    const vr = video.videoWidth / video.videoHeight;
    const cr = w / h;
    let bw: number, bh: number;
    if (vr > cr) { bh = h; bw = h * vr; } else { bw = w; bh = w / vr; }
    this.ctx.save();
    this.ctx.translate(w / 2 + this.background.x, h / 2 + this.background.y);
    this.ctx.rotate((this.background.rotation * Math.PI) / 180);
    this.ctx.scale(this.background.scale * (this.background.flipH ? -1 : 1), this.background.scale * (this.background.flipV ? -1 : 1));
    this.ctx.drawImage(video, -bw / 2, -bh / 2, bw, bh);
    this.ctx.restore();
  }

  private drawBackground(w: number, h: number) {
    const img = this.backgroundImage!;
    const iw = (img as HTMLVideoElement).videoWidth ?? (img as HTMLImageElement).width;
    const ih = (img as HTMLVideoElement).videoHeight ?? (img as HTMLImageElement).height;
    const ir = iw / ih;
    const cr = w / h;
    let bw: number, bh: number;
    if (ir > cr) { bh = h; bw = h * ir; } else { bw = w; bh = w / ir; }
    this.ctx.save();
    this.ctx.translate(w / 2 + this.background.x, h / 2 + this.background.y);
    this.ctx.rotate((this.background.rotation * Math.PI) / 180);
    this.ctx.scale(this.background.scale * (this.background.flipH ? -1 : 1), this.background.scale * (this.background.flipV ? -1 : 1));
    this.ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    this.ctx.restore();
  }

  private drawPhotocard() {
    this.ctx.save();
    this.ctx.translate(this.photocard.x, this.photocard.y);
    this.ctx.rotate(this.photocard.rotation);
    this.ctx.scale(this.photocard.scale * (this.photocard.flipH ? -1 : 1), this.photocard.scale * (this.photocard.flipV ? -1 : 1));

    const img = this.photocardImage!;
    const w = (img as HTMLVideoElement).videoWidth ?? (img as HTMLImageElement).width;
    const h = (img as HTMLVideoElement).videoHeight ?? (img as HTMLImageElement).height;
    const cfg = ToploaderConfig;

    if (this.frameMode) {
      this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else if (this.photocard.showToploader) {
      const { sideGap, topGap, bottomGap, recessShadow } = cfg.photocardInset;
      const iw = w - sideGap * 2;
      const ih = h - topGap - bottomGap;
      const ix = -w / 2 + sideGap;
      const iy = -h / 2 + topGap;
      this.ctx.save();
      this.ctx.shadowColor = `rgba(0,0,0,${recessShadow.opacity})`;
      this.ctx.shadowBlur = recessShadow.blur;
      this.ctx.shadowOffsetY = recessShadow.offsetY;
      this.ctx.fillStyle = "#000";
      const sr = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(ix + sr, iy);
      this.ctx.lineTo(ix + iw - sr, iy);
      this.ctx.arcTo(ix + iw, iy, ix + iw, iy + sr, sr);
      this.ctx.lineTo(ix + iw, iy + ih - sr);
      this.ctx.arcTo(ix + iw, iy + ih, ix + iw - sr, iy + ih, sr);
      this.ctx.lineTo(ix + sr, iy + ih);
      this.ctx.arcTo(ix, iy + ih, ix, iy + ih - sr, sr);
      this.ctx.lineTo(ix, iy + sr);
      this.ctx.arcTo(ix, iy, ix + sr, iy, sr);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(ix + sr, iy);
      this.ctx.lineTo(ix + iw - sr, iy);
      this.ctx.arcTo(ix + iw, iy, ix + iw, iy + sr, sr);
      this.ctx.lineTo(ix + iw, iy + ih - sr);
      this.ctx.arcTo(ix + iw, iy + ih, ix + iw - sr, iy + ih, sr);
      this.ctx.lineTo(ix + sr, iy + ih);
      this.ctx.arcTo(ix, iy + ih, ix, iy + ih - sr, sr);
      this.ctx.lineTo(ix, iy + sr);
      this.ctx.arcTo(ix, iy, ix + sr, iy, sr);
      this.ctx.closePath();
      this.ctx.clip();
      this.ctx.drawImage(img, ix, iy, iw, ih);
      this.ctx.restore();
      this.drawToploader(w, h);
    } else {
      this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
    this.ctx.restore();
  }

  private drawToploader(width: number, height: number) {
    const cfg = ToploaderConfig;
    const overlap = cfg.dimensions.sideOverlap;
    const bottomOverlap = cfg.dimensions.bottomOverlap;
    const tW = width + overlap * 2;
    const tH = height + overlap + bottomOverlap;
    const dimChanged = this.toploaderGradientCache.cachedWidth !== width || this.toploaderGradientCache.cachedHeight !== height;
    const x = -(tW / 2);
    const y = -(height / 2) - overlap;
    const tr = cfg.corners.topRadius;
    const br = cfg.corners.bottomRadius;
    const ftL = cfg.frame.leftThickness;
    const ftR = cfg.frame.rightThickness;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y + cfg.clipping.topClip, tW, tH - cfg.clipping.topClip);
    this.ctx.clip();

    const rr = (rx: number, ry: number, rw: number, rh: number, rt: number, rb: number) => {
      this.ctx.beginPath();
      this.ctx.moveTo(rx + rt, ry);
      this.ctx.lineTo(rx + rw - rt, ry);
      this.ctx.arcTo(rx + rw, ry, rx + rw, ry + rt, rt);
      this.ctx.lineTo(rx + rw, ry + rh - rb);
      this.ctx.arcTo(rx + rw, ry + rh, rx + rw - rb, ry + rh, rb);
      this.ctx.lineTo(rx + rb, ry + rh);
      this.ctx.arcTo(rx, ry + rh, rx, ry + rh - rb, rb);
      this.ctx.lineTo(rx, ry + rt);
      this.ctx.arcTo(rx, ry, rx + rt, ry, rt);
      this.ctx.closePath();
    };

    // West border
    const tcs = tr * cfg.curves.topCurveStartPercent;
    this.ctx.beginPath();
    this.ctx.moveTo(x + tcs, y);
    this.ctx.arcTo(x, y, x, y + tr, tr);
    this.ctx.lineTo(x, y + tH - br);
    this.ctx.arcTo(x, y + tH, x + br, y + tH, br);
    this.ctx.lineTo(x + ftL + (br - ftL), y + tH - ftL);
    this.ctx.arcTo(x + ftL, y + tH - ftL, x + ftL, y + tH - ftL - (br - ftL), br - ftL);
    this.ctx.lineTo(x + ftL, y + ftL + (tr - ftL));
    this.ctx.arcTo(x + ftL, y + ftL, x + ftL + (tr - ftL) * cfg.curves.topCurveStartPercent, y + ftL, tr - ftL);
    this.ctx.lineTo(x + tcs, y);
    this.ctx.closePath();
    if (dimChanged) {
      const g = this.ctx.createLinearGradient(x, y, x + ftL * cfg.borders.west.widthMultiplier * cfg.borders.west.scaleFactor, y);
      g.addColorStop(0, `rgba(255,255,255,${cfg.borders.west.startOpacity})`);
      g.addColorStop(1, `rgba(255,255,255,${cfg.borders.west.endOpacity})`);
      this.toploaderGradientCache.westGradient = g;
    }
    this.ctx.fillStyle = this.toploaderGradientCache.westGradient!;
    this.ctx.fill();

    // East border
    const tce = tW - tr * cfg.curves.topCurveStartPercent;
    this.ctx.beginPath();
    this.ctx.moveTo(x + tce, y);
    this.ctx.arcTo(x + tW, y, x + tW, y + tr, tr);
    this.ctx.lineTo(x + tW, y + tH - br);
    this.ctx.arcTo(x + tW, y + tH, x + tW - br, y + tH, br);
    this.ctx.lineTo(x + tW - ftR * cfg.borders.east.scaleFactor - (br - ftR * cfg.borders.east.scaleFactor), y + tH - ftR * cfg.borders.east.scaleFactor);
    this.ctx.arcTo(x + tW - ftR * cfg.borders.east.scaleFactor, y + tH - ftR * cfg.borders.east.scaleFactor, x + tW - ftR * cfg.borders.east.scaleFactor, y + tH - ftR * cfg.borders.east.scaleFactor - (br - ftR * cfg.borders.east.scaleFactor), br - ftR * cfg.borders.east.scaleFactor);
    this.ctx.lineTo(x + tW - ftR * cfg.borders.east.scaleFactor, y + ftR * cfg.borders.east.scaleFactor + (tr - ftR * cfg.borders.east.scaleFactor));
    this.ctx.arcTo(x + tW - ftR * cfg.borders.east.scaleFactor, y + ftR * cfg.borders.east.scaleFactor, x + tW - ftR * cfg.borders.east.scaleFactor - (tr - ftR * cfg.borders.east.scaleFactor) * cfg.curves.topCurveStartPercent, y + ftR * cfg.borders.east.scaleFactor, tr - ftR * cfg.borders.east.scaleFactor);
    this.ctx.lineTo(x + tce, y);
    this.ctx.closePath();
    if (dimChanged) {
      const g = this.ctx.createLinearGradient(x + tW, y, x + tW - ftR * cfg.borders.east.widthMultiplier * cfg.borders.east.scaleFactor, y);
      g.addColorStop(0, `rgba(255,255,255,${cfg.borders.east.startOpacity})`);
      g.addColorStop(1, `rgba(255,255,255,${cfg.borders.east.endOpacity})`);
      this.toploaderGradientCache.eastGradient = g;
    }
    this.ctx.fillStyle = this.toploaderGradientCache.eastGradient!;
    this.ctx.fill();

    // South border
    const sbs = x + br;
    const sbe = x + tW - br;
    const ftB = ftL;
    this.ctx.beginPath();
    this.ctx.moveTo(sbs, y + tH);
    this.ctx.lineTo(sbe, y + tH);
    this.ctx.lineTo(sbe, y + tH - ftB);
    this.ctx.lineTo(sbs, y + tH - ftB);
    this.ctx.closePath();
    if (dimChanged) {
      const g = this.ctx.createLinearGradient(sbs, y + tH, sbe, y + tH);
      g.addColorStop(0, `rgba(255,255,255,${cfg.borders.south.edgeOpacity})`);
      g.addColorStop(0.5, `rgba(255,255,255,${cfg.borders.south.centerOpacity})`);
      g.addColorStop(1, `rgba(255,255,255,${cfg.borders.south.edgeOpacity})`);
      this.toploaderGradientCache.southGradient = g;
    }
    this.ctx.fillStyle = this.toploaderGradientCache.southGradient!;
    this.ctx.fill();

    // Base overlay
    rr(x, y, tW, tH, tr, br);
    this.ctx.fillStyle = `rgba(255,255,255,${cfg.overlay.baseOpacity})`;
    this.ctx.fill();

    // Inner area tint
    const iX = x + ftL, iY = y + ftL, iW = tW - ftL - ftR, iH = tH - ftL - ftB;
    rr(iX, iY, iW, iH, tr - ftL, br - ftL);
    const { innerTint: it } = cfg.overlay;
    this.ctx.fillStyle = `rgba(${it.red},${it.green},${it.blue},${it.opacity})`;
    this.ctx.fill();
    const { innerEdge: ie } = cfg.overlay;
    this.ctx.strokeStyle = `rgba(${ie.red},${ie.green},${ie.blue},${ie.opacity})`;
    this.ctx.lineWidth = ie.lineWidth;
    this.ctx.stroke();

    // Top highlight
    const thGrad = this.ctx.createLinearGradient(iX, iY, iX, iY + iH * cfg.highlights.top.heightPercent);
    const ht = cfg.highlights.top;
    thGrad.addColorStop(0, `rgba(255,255,255,${ht.startOpacity})`);
    thGrad.addColorStop(0.2, `rgba(255,255,255,${ht.middleOpacity})`);
    thGrad.addColorStop(1, `rgba(255,255,255,${ht.endOpacity})`);
    rr(iX, iY, iW, iH * ht.heightPercent, tr - ftL, 0);
    this.ctx.fillStyle = thGrad;
    this.ctx.fill();

    // Gloss streaks
    const gs = cfg.glossStreak;
    this.ctx.save();
    rr(iX, iY, iW, iH, tr - ftL, br - ftL);
    this.ctx.clip();
    const drawStreak = (wf: number, pos: number, peak: number) => {
      const sw = iW * wf;
      const cx2 = iX + iW / 2;
      const cy2 = iY + iH * pos;
      const ar = (gs.angle * Math.PI) / 180;
      this.ctx.save();
      this.ctx.translate(cx2, cy2);
      this.ctx.rotate(ar);
      const g = this.ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.4, `rgba(255,255,255,${peak * 0.5})`);
      g.addColorStop(0.5, `rgba(255,255,255,${peak})`);
      g.addColorStop(0.6, `rgba(255,255,255,${peak * 0.5})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      this.ctx.fillStyle = g;
      const ls = Math.hypot(iW, iH);
      this.ctx.fillRect(-sw / 2, -ls, sw, ls * 2);
      this.ctx.restore();
    };
    drawStreak(gs.widthFraction, gs.position, gs.peakOpacity);
    if (gs.secondary) drawStreak(gs.secondary.widthFraction, gs.secondary.position, gs.secondary.peakOpacity);
    this.ctx.restore();

    // Inner vignette
    const iv = cfg.innerVignette;
    this.ctx.save();
    rr(iX, iY, iW, iH, tr - ftL, br - ftL);
    this.ctx.clip();
    const vcx = iX + iW / 2, vcy = iY + iH / 2, vr2 = Math.hypot(iW, iH) / 2;
    const vig = this.ctx.createRadialGradient(vcx, vcy, vr2 * 0.55, vcx, vcy, vr2);
    vig.addColorStop(0, `rgba(0,0,0,${iv.centerOpacity})`);
    vig.addColorStop(1, `rgba(0,0,0,${iv.cornerOpacity})`);
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(iX, iY, iW, iH);
    this.ctx.restore();

    // Inner shadows (N/W/E/S)
    const lsw = overlap - ftL;
    const rsw = overlap - ftR;
    const bsh = bottomOverlap - ftB;
    const tsh = overlap - ftL;
    const ri = cfg.frame.rightInset;
    const stcr = tr - ftL;
    const sbcr = br - ftL;

    const rsp = (sx: number, sy: number, sw: number, sh: number, rtl: number, rtr: number, rbl: number, rbr: number) => {
      this.ctx.beginPath();
      this.ctx.moveTo(sx + rtl, sy);
      this.ctx.lineTo(sx + sw - rtr, sy);
      if (rtr > 0) this.ctx.arcTo(sx + sw, sy, sx + sw, sy + rtr, rtr);
      this.ctx.lineTo(sx + sw, sy + sh - rbr);
      if (rbr > 0) this.ctx.arcTo(sx + sw, sy + sh, sx + sw - rbr, sy + sh, rbr);
      this.ctx.lineTo(sx + rbl, sy + sh);
      if (rbl > 0) this.ctx.arcTo(sx, sy + sh, sx, sy + sh - rbl, rbl);
      this.ctx.lineTo(sx, sy + rtl);
      if (rtl > 0) this.ctx.arcTo(sx, sy, sx + rtl, sy, rtl);
      this.ctx.closePath();
    };

    const topG = this.ctx.createLinearGradient(x, y + ftL, x, y + ftL + tsh);
    topG.addColorStop(0, `rgba(0,0,0,${cfg.shadows.north.startOpacity})`);
    topG.addColorStop(1, `rgba(0,0,0,${cfg.shadows.north.endOpacity})`);
    this.ctx.fillStyle = topG;
    rsp(x + ftL, y + ftL, tW - ftL - ftR, tsh, stcr, stcr, 0, 0);
    this.ctx.fill();

    const leftG = this.ctx.createLinearGradient(x + ftL, y, x + ftL + lsw, y);
    leftG.addColorStop(0, `rgba(0,0,0,${cfg.shadows.west.startOpacity})`);
    leftG.addColorStop(1, `rgba(0,0,0,${cfg.shadows.west.endOpacity})`);
    this.ctx.fillStyle = leftG;
    rsp(x + ftL, y + ftL, lsw, tH - ftL - ftB, stcr, 0, sbcr, 0);
    this.ctx.fill();

    const rightG = this.ctx.createLinearGradient(x + tW - ftR - ri, y, x + tW - ftR - rsw - ri, y);
    rightG.addColorStop(0, `rgba(0,0,0,${cfg.shadows.east.startOpacity})`);
    rightG.addColorStop(1, `rgba(0,0,0,${cfg.shadows.east.endOpacity})`);
    this.ctx.fillStyle = rightG;
    rsp(x + tW - ftR - rsw - ri, y + ftL, rsw, tH - ftL - ftB, 0, stcr, 0, sbcr);
    this.ctx.fill();

    const botG = this.ctx.createLinearGradient(x, y + tH - ftB - bsh, x, y + tH - ftB);
    botG.addColorStop(0, `rgba(0,0,0,${cfg.shadows.south.startOpacity})`);
    botG.addColorStop(1, `rgba(0,0,0,${cfg.shadows.south.endOpacity})`);
    this.ctx.fillStyle = botG;
    rsp(x + ftL, y + tH - ftB - bsh, tW - ftL - ftR, bsh, 0, 0, sbcr, sbcr);
    this.ctx.fill();

    // Shading lines
    const sl = cfg.shadingLine;
    this.ctx.strokeStyle = `rgba(${sl.red},${sl.green},${sl.blue},${sl.opacity})`;
    const tlX = x + ftL, trX = x + tW - ftR * cfg.borders.east.scaleFactor, tlY = y + ftL, tbY = y + tH - ftB;
    this.ctx.lineWidth = ftL * sl.widthReduction;
    this.ctx.beginPath(); this.ctx.moveTo(tlX, tlY + stcr); this.ctx.lineTo(tlX, tbY - sbcr); this.ctx.stroke();
    this.ctx.lineWidth = ftB * sl.widthReduction;
    this.ctx.beginPath(); this.ctx.moveTo(tlX + sbcr, tbY); this.ctx.lineTo(trX - sbcr, tbY); this.ctx.stroke();
    this.ctx.lineWidth = ftR * cfg.borders.east.scaleFactor * sl.widthReduction;
    this.ctx.beginPath(); this.ctx.moveTo(trX, tlY + stcr); this.ctx.lineTo(trX, tbY - sbcr); this.ctx.stroke();

    this.toploaderGradientCache.cachedWidth = width;
    this.toploaderGradientCache.cachedHeight = height;
    this.ctx.restore();
  }

  private drawCropOverlay(w: number, h: number) {
    if (!this.crop.enabled) return;
    const { x, y, width: cw, height: ch } = this.crop.bounds;
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0,0,0,0.6)";
    if (y > 0) this.ctx.fillRect(0, 0, w, y);
    if (y + ch < h) this.ctx.fillRect(0, y + ch, w, h - y - ch);
    if (x > 0) this.ctx.fillRect(0, y, x, ch);
    if (x + cw < w) this.ctx.fillRect(x + cw, y, w - x - cw, ch);
    this.ctx.strokeStyle = "rgba(255,255,255,0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, cw, ch);
    const ml = Math.min(20, cw / 5, ch / 5);
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = "rgba(199,182,249,1)";
    [[x, y + ml, x, y, x + ml, y], [x + cw - ml, y, x + cw, y, x + cw, y + ml], [x, y + ch - ml, x, y + ch, x + ml, y + ch], [x + cw - ml, y + ch, x + cw, y + ch, x + cw, y + ch - ml]].forEach(([x1, y1, x2, y2, x3, y3]) => {
      this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.lineTo(x3, y3); this.ctx.stroke();
    });
    this.ctx.restore();
  }

  // ── Transform operations ───────────────────────────────────────────────────

  updateBackground(prop: keyof BackgroundTransform, value: number) {
    if (!this.backgroundImage) return;
    (this.background as unknown as Record<string, unknown>)[prop] = value;
    this.render();
  }

  flipBackgroundHorizontal() { if (!this.backgroundImage) return; this.background.flipH = !this.background.flipH; this.render(); }
  flipBackgroundVertical() { if (!this.backgroundImage) return; this.background.flipV = !this.background.flipV; this.render(); }
  resetBackground() {
    if (!this.backgroundImage) return;
    this.background = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
    this.render();
  }

  updatePhotocard(prop: string, value: number) {
    if (!this.photocardImage) return;
    (this.photocard as unknown as Record<string, unknown>)[prop] = value;
    this.render();
  }

  resetPhotocard() {
    if (!this.photocardImage) return;
    const rect = this.canvas.getBoundingClientRect();
    const iw = (this.photocardImage as HTMLVideoElement).videoWidth ?? (this.photocardImage as HTMLImageElement).width;
    this.photocard = { x: 450, y: 470, scale: Math.min(rect.width, rect.height) / (iw * 3), rotation: -15 * Math.PI / 180, flipH: false, flipV: false, layer: this.photocard.layer, showToploader: this.photocard.showToploader };
    if (this.photocardVideo.isVideo && this.photocardVideo.element) this.photocardVideo.element.play().catch(() => {});
    this.render();
  }

  async createFrameFromPhotocard(): Promise<void> {
    if (!this.originalPhotocardImage || !this.originalPhotocardFile || this.isPlaceholder) {
      throw new Error("Frame extraction needs a still image photocard");
    }

    const result = await this.removeBackground(this.originalPhotocardFile);
    this.photocardImage = result;
    this.frameMode = true;
    this.photocard.showToploader = false;

    const rect = this.canvas.getBoundingClientRect();
    this.photocard.x = rect.width / 2;
    this.photocard.y = rect.height / 2;
    this.photocard.rotation = 0;
    this.photocard.scale = Math.min(rect.width / result.width, rect.height / result.height) * 0.78;
    this.render();
  }

  restorePhotocardFrameSource() {
    if (!this.originalPhotocardImage) return;
    this.photocardImage = this.originalPhotocardImage;
    this.frameMode = false;
    this.photocard.showToploader = true;
    const rect = this.canvas.getBoundingClientRect();
    this.photocard.x = 450;
    this.photocard.y = 470;
    this.photocard.rotation = -15 * Math.PI / 180;
    this.photocard.scale = Math.min(rect.width, rect.height) / (this.originalPhotocardImage.width * 3);
    this.render();
  }

  private async removeBackground(file: File): Promise<HTMLImageElement> {
    const body = new FormData();
    body.append("image", file, file.name || "fco.png");

    const response = await fetch("/api/proofshot/remove-bg", {
      method: "POST",
      body,
    });

    if (!response.ok) {
      let message = "Failed to remove background";
      try {
        message = (await response.json()).error ?? message;
      } catch {
        // fall through with generic message
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const image = await this.loadImageFromUrl(url);
      return await this.cropTransparentPadding(image);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const out = new Image();
      out.onload = () => resolve(out);
      out.onerror = reject;
      out.src = url;
    });
  }

  private cropTransparentPadding(img: HTMLImageElement): Promise<HTMLImageElement> {
    const source = document.createElement("canvas");
    source.width = img.naturalWidth || img.width;
    source.height = img.naturalHeight || img.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true })!;
    sourceCtx.drawImage(img, 0, 0, source.width, source.height);

    const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return this.loadImageFromUrl(source.toDataURL("image/png"));

    const pad = Math.round(Math.max(width, height) * 0.035);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const output = document.createElement("canvas");
    output.width = maxX - minX + 1;
    output.height = maxY - minY + 1;
    output.getContext("2d")!.drawImage(source, minX, minY, output.width, output.height, 0, 0, output.width, output.height);

    return this.loadImageFromUrl(output.toDataURL("image/png"));
  }

  flipHorizontal() { if (!this.photocardImage) return; this.photocard.flipH = !this.photocard.flipH; this.render(); }
  flipVertical() { if (!this.photocardImage) return; this.photocard.flipV = !this.photocard.flipV; this.render(); }
  rotateLeft() { if (!this.photocardImage) return; this.photocard.rotation -= Math.PI / 2; this.render(); }
  rotateRight() { if (!this.photocardImage) return; this.photocard.rotation += Math.PI / 2; this.render(); }
  toggleToploader(show: boolean) {
    if (show) this.frameMode = false;
    this.photocard.showToploader = show;
    this.render();
  }
  setEditMode(mode: EditMode) { this.editMode = mode; }

  reset() {
    this.stopGifAnim(this.photocardGif);
    this.stopGifAnim(this.backgroundGif);
    this.stopVideoAnim(this.photocardVideo);
    this.stopVideoAnim(this.backgroundVideo);
    if (this.photocardVideo.element?.src?.startsWith("blob:")) URL.revokeObjectURL(this.photocardVideo.element.src);
    if (this.backgroundVideo.element?.src?.startsWith("blob:")) URL.revokeObjectURL(this.backgroundVideo.element.src);
    this.backgroundImage = null;
    this.photocardImage = null;
    this.originalPhotocardImage = null;
    this.originalPhotocardFile = null;
    this.frameMode = false;
    this.isPlaceholder = false;
    this.photocardGif = this.freshGifState();
    this.backgroundGif = this.freshGifState();
    this.photocardVideo = this.freshVideoState();
    this.backgroundVideo = this.freshVideoState();
    this.background = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
    this.photocard = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false, layer: "front", showToploader: true };
    this.loadPlaceholderPhotocard();
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  hasGifAnimation() { return this.photocardGif.isGif || this.backgroundGif.isGif; }
  hasVideo() { return this.photocardVideo.isVideo || this.backgroundVideo.isVideo; }

  exportImage(asGif = false): Promise<Blob> {
    if (asGif && this.hasGifAnimation()) return this.exportAsGif();
    return new Promise((res, rej) => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const exp = document.createElement("canvas");
        exp.width = this.canvas.width;
        exp.height = this.canvas.height;
        exp.getContext("2d")!.drawImage(this.canvas, 0, 0);
        exp.toBlob((b) => b ? res(b) : rej(new Error("Export failed")), "image/png");
      } catch (e) { rej(e); }
    });
  }

  private async exportAsGif(): Promise<Blob> {
    const GIF = (window as unknown as Record<string, unknown>).GIF as new (opts: Record<string, unknown>) => {
      addFrame(canvas: HTMLCanvasElement, opts: Record<string, unknown>): void;
      on(event: string, cb: (data: unknown) => void): void;
      render(): void;
    };
    if (!GIF) throw new Error("gif.js not loaded");

    const pcFrames = this.photocardGif.isGif ? this.photocardGif.frames.length : 1;
    const bgFrames = this.backgroundGif.isGif ? this.backgroundGif.frames.length : 1;
    const total = Math.max(pcFrames, bgFrames);
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    let workerUrl: string | undefined;
    try {
      const r = await fetch("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js");
      workerUrl = URL.createObjectURL(await r.blob());
    } catch {}

    const gif = new GIF({ workers: workerUrl ? 2 : 0, quality: 10, width: w, height: h, workerScript: workerUrl });

    for (let i = 0; i < total; i++) {
      if (this.photocardGif.isGif) this.photocardImage = this.photocardGif.frames[i % pcFrames];
      if (this.backgroundGif.isGif) this.backgroundImage = this.backgroundGif.frames[i % bgFrames];
      this.render();
      const delay = this.photocardGif.isGif && this.backgroundGif.isGif
        ? Math.max(this.photocardGif.delays[i % pcFrames], this.backgroundGif.delays[i % bgFrames])
        : this.photocardGif.isGif ? this.photocardGif.delays[i % pcFrames]
        : this.backgroundGif.isGif ? this.backgroundGif.delays[i % bgFrames] : 100;
      gif.addFrame(this.canvas, { copy: true, delay });
    }

    return new Promise((res, rej) => {
      gif.on("finished", (blob) => { if (workerUrl) URL.revokeObjectURL(workerUrl!); res(blob as Blob); });
      gif.on("error", (e) => { if (workerUrl) URL.revokeObjectURL(workerUrl!); rej(e); });
      gif.render();
    });
  }

  async exportAsVideo(duration?: number): Promise<ExportVideoResult> {
    const dur = duration ?? ((this.photocardVideo.isVideo && this.photocardVideo.element?.duration) || (this.backgroundVideo.isVideo && this.backgroundVideo.element?.duration) || 10);
    const vEl = this.photocardVideo.isVideo ? this.photocardVideo.element : this.backgroundVideo.isVideo ? this.backgroundVideo.element : null;
    const ew = vEl?.videoWidth ?? this.canvas.width;
    const eh = vEl?.videoHeight ?? this.canvas.height;

    const exp = document.createElement("canvas");
    exp.width = ew; exp.height = eh;
    const expCtx = exp.getContext("2d")!;
    expCtx.imageSmoothingEnabled = true;
    expCtx.imageSmoothingQuality = "high";

    const stream = exp.captureStream(30);
    const mimeTypes = [
      { type: "video/mp4", ext: "mp4" }, { type: "video/mp4;codecs=h264", ext: "mp4" },
      { type: "video/webm;codecs=vp9", ext: "webm" }, { type: "video/webm;codecs=vp8", ext: "webm" }, { type: "video/webm", ext: "webm" }
    ];
    const fmt = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m.type)) ?? { type: "video/webm", ext: "webm" };
    const recorder = new MediaRecorder(stream, { mimeType: fmt.type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const dpr = window.devicePixelRatio || 1;
    const origW = this.canvas.width;
    const origH = this.canvas.height;
    let animId: number;

    const renderFrame = () => {
      expCtx.clearRect(0, 0, ew, eh);
      if (this.backgroundImage) {
        const iw2 = (this.backgroundImage as HTMLVideoElement).videoWidth ?? (this.backgroundImage as HTMLImageElement).width;
        const ih2 = (this.backgroundImage as HTMLVideoElement).videoHeight ?? (this.backgroundImage as HTMLImageElement).height;
        const ir = iw2 / ih2; const cr = ew / eh;
        let bw: number, bh: number, bx: number, by: number;
        if (ir > cr) { bh = eh; bw = bh * ir; bx = (ew - bw) / 2; by = 0; } else { bw = ew; bh = bw / ir; bx = 0; by = (eh - bh) / 2; }
        expCtx.drawImage(this.backgroundImage, bx, by, bw, bh);
      }
      if (this.photocardImage) {
        const pw = (this.photocardImage as HTMLVideoElement).videoWidth ?? (this.photocardImage as HTMLImageElement).width;
        const ph = (this.photocardImage as HTMLVideoElement).videoHeight ?? (this.photocardImage as HTMLImageElement).height;
        const sx = ew / (origW / dpr); const sy = eh / (origH / dpr);
        const sc = Math.min(sx, sy);
        const sps = this.photocard.scale * sc;
        const sw = pw * sps; const sh = ph * sps;
        const spx = this.photocard.x * sx; const spy = this.photocard.y * sy;
        expCtx.save();
        expCtx.translate(spx, spy);
        expCtx.rotate(this.photocard.rotation);
        if (this.photocard.showToploader) {
          const cfg = ToploaderConfig;
          const sg = cfg.photocardInset.sideGap * sps;
          const tg = cfg.photocardInset.topGap * sps;
          const bg = cfg.photocardInset.bottomGap * sps;
          expCtx.save();
          expCtx.shadowColor = `rgba(0,0,0,${cfg.photocardInset.recessShadow.opacity})`;
          expCtx.shadowBlur = cfg.photocardInset.recessShadow.blur * sps;
          expCtx.shadowOffsetY = cfg.photocardInset.recessShadow.offsetY * sps;
          expCtx.fillStyle = "#000";
          expCtx.fillRect(-sw / 2 + sg, -sh / 2 + tg, sw - sg * 2, sh - tg - bg);
          expCtx.restore();
          expCtx.drawImage(this.photocardImage, -sw / 2 + sg, -sh / 2 + tg, sw - sg * 2, sh - tg - bg);
        } else {
          expCtx.drawImage(this.photocardImage, -sw / 2, -sh / 2, sw, sh);
        }
        expCtx.restore();
        if (this.photocard.showToploader) {
          const origCtx = this.ctx;
          this.ctx = expCtx;
          expCtx.save();
          expCtx.translate(this.photocard.x * sx, this.photocard.y * sy);
          expCtx.rotate(this.photocard.rotation);
          expCtx.scale(sps * (this.photocard.flipH ? -1 : 1), sps * (this.photocard.flipV ? -1 : 1));
          this.drawToploader(pw, ph);
          expCtx.restore();
          this.ctx = origCtx;
        }
      }
      animId = requestAnimationFrame(renderFrame);
    };

    return new Promise((res, rej) => {
      recorder.onstop = () => { cancelAnimationFrame(animId); res({ blob: new Blob(chunks, { type: fmt.type }), mimeType: fmt.type, extension: fmt.ext }); };
      recorder.onerror = (e) => { cancelAnimationFrame(animId); rej(e); };
      renderFrame();
      recorder.start();
      setTimeout(() => { recorder.stop(); stream.getTracks().forEach((t) => t.stop()); }, (dur as number) * 1000);
    });
  }
}
