"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { toast } from "sonner";
import {
  Camera, CreditCard, Image, ImagePlus, BadgePlus, RefreshCw, FlipHorizontal,
  FlipVertical, Move, ChevronDown, Check, Video, ZoomIn, ZoomOut, RotateCcw,
  Edit, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CanvasManager } from "../_lib/canvas-manager";
import { BorderManager } from "../_lib/border-manager";
import type { AspectRatio, EditMode } from "../_lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────
interface SliderState {
  x: number; y: number; scale: number; rotation: number;
}

const DEFAULT_BG: SliderState = { x: 0, y: 0, scale: 1, rotation: 0 };
const DEFAULT_PC: SliderState = { x: 0, y: 0, scale: 1, rotation: 0 };

// ── Slider component ───────────────────────────────────────────────────────────
function ControlSlider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-border cursor-pointer accent-primary"
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProofshotEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const pcFileRef = useRef<HTMLInputElement>(null);
  const managerRef = useRef<CanvasManager | null>(null);
  const isMobileRef = useRef(false);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const tabsPillRef = useRef<HTMLSpanElement>(null);
  const tabsFirstPaint = useRef(true);
  const canvasTabsBarRef = useRef<HTMLDivElement>(null);
  const canvasTabsPillRef = useRef<HTMLSpanElement>(null);
  const canvasTabsFirstPaint = useRef(true);
  const aspectMenuContainerRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState<EditMode>("photocard");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showMobileHome, setShowMobileHome] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading…");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showCameraControls, setShowCameraControls] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(false);
  const [cameraAspectRatio, setCameraAspectRatio] = useState<AspectRatio>("3:4");
  const [cameraZoom, setCameraZoomState] = useState(1);
  const [showToploader, setShowToploader] = useState(true);
  const [bgSliders, setBgSliders] = useState<SliderState>(DEFAULT_BG);
  const [pcSliders, setPcSliders] = useState<SliderState>(DEFAULT_PC);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<AspectRatio>("3:4");

  const isAndroid = () => /Android/i.test(navigator.userAgent);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    isMobileRef.current = window.innerWidth <= 767;
    if (isMobileRef.current) setShowMobileHome(true);

    const mgr = new CanvasManager();
    const bm = new BorderManager();
    mgr.borderManager = bm;
    mgr.init(canvasRef.current, () => triggerPhotocardUpload());
    managerRef.current = mgr;

    const visitedKey = "proofshot-visited";
    if (!localStorage.getItem(visitedKey)) {
      setTimeout(() => {
        toast.info("Welcome to Proofshot! Upload a background to get started.");
        localStorage.setItem(visitedKey, "true");
      }, 500);
    }

    return () => {
      mgr.stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mgr = managerRef.current;
      if (!mgr) return;
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); }
      if (e.key === "r" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleReset(); }
      if (e.key === "h") mgr.flipHorizontal();
      if (e.key === "v") mgr.flipVertical();
      if (e.key === "[") mgr.rotateLeft();
      if (e.key === "]") mgr.rotateRight();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const loading = (msg: string) => { setIsLoading(true); setLoadingMessage(msg); };
  const doneLoading = () => setIsLoading(false);

  const syncBgSliders = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    setBgSliders({ x: mgr.background.x, y: mgr.background.y, scale: mgr.background.scale, rotation: mgr.background.rotation });
  }, []);

  const syncPcSliders = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    setPcSliders({ x: mgr.photocard.x, y: mgr.photocard.y, scale: mgr.photocard.scale, rotation: (mgr.photocard.rotation * 180) / Math.PI });
  }, []);

  const moveTabsPill = useCallback((animate: boolean) => {
    const bar = tabsBarRef.current;
    const pill = tabsPillRef.current;
    if (!bar || !pill) return;
    const activeTab = bar.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!activeTab) return;
    if (!animate) {
      pill.style.transition = "none";
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      pill.style.width = `${activeTab.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = "";
    } else {
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      pill.style.width = `${activeTab.offsetWidth}px`;
    }
  }, []);

  const moveCanvasTabsPill = useCallback((animate: boolean) => {
    const bar = canvasTabsBarRef.current;
    const pill = canvasTabsPillRef.current;
    if (!bar || !pill) return;
    const activeTab = bar.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!activeTab) return;
    if (!animate) {
      pill.style.transition = "none";
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      pill.style.width = `${activeTab.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = "";
    } else {
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      pill.style.width = `${activeTab.offsetWidth}px`;
    }
  }, []);

  // Tabs pill position
  useLayoutEffect(() => {
    if (tabsFirstPaint.current) {
      tabsFirstPaint.current = false;
      moveTabsPill(false);
    } else {
      moveTabsPill(true);
    }
  }, [editMode, moveTabsPill]);

  useLayoutEffect(() => {
    if (canvasTabsFirstPaint.current) {
      canvasTabsFirstPaint.current = false;
      moveCanvasTabsPill(false);
    } else {
      moveCanvasTabsPill(true);
    }
  }, [editMode, moveCanvasTabsPill]);

  useEffect(() => {
    const handler = () => { moveTabsPill(false); moveCanvasTabsPill(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [moveTabsPill, moveCanvasTabsPill]);

  // Close aspect menu on outside click
  useEffect(() => {
    if (!aspectMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (aspectMenuContainerRef.current && !aspectMenuContainerRef.current.contains(e.target as Node)) {
        setAspectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aspectMenuOpen]);

  const triggerPhotocardUpload = useCallback(() => {
    pcFileRef.current?.click();
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Edit mode ─────────────────────────────────────────────────────────────────
  const handleEditModeChange = (mode: EditMode) => {
    setEditMode(mode);
    managerRef.current?.setEditMode(mode);
  };

  // ── Aspect ratio ──────────────────────────────────────────────────────────────
  const applyCanvasAspectRatio = (ratio: AspectRatio) => {
    setCanvasAspectRatio(ratio);
    setCameraAspectRatio(ratio);
    const container = containerRef.current;
    if (!container) return;
    container.classList.remove("aspect-3-4", "aspect-9-16", "aspect-1-1");
    container.classList.remove("preview-mode");
    if (ratio === "3:4") container.classList.add("aspect-3-4");
    else if (ratio === "9:16") container.classList.add("aspect-9-16");
    else container.classList.add("aspect-1-1");
    setTimeout(() => { managerRef.current?.resizeCanvas(); syncBgSliders(); syncPcSliders(); }, 100);
  };

  // ── Background upload ─────────────────────────────────────────────────────────
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Please select a valid image or video file"); return;
    }
    try {
      loading("Loading background…");
      const mgr = managerRef.current!;
      if (mgr.camera.active) {
        mgr.stopCamera();
        exitCameraMode();
      }
      await mgr.loadBackground(file);
      syncBgSliders();
      setTimeout(() => mgr.resizeCanvas(), 100);
      if (isMobileRef.current) setShowActionButtons(true);
      toast.success("Background loaded");
    } catch {
      toast.error("Failed to load background");
    } finally {
      doneLoading();
      e.target.value = "";
    }
  };

  // ── Photocard upload ──────────────────────────────────────────────────────────
  const handlePcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Please select a valid image or video file"); return;
    }
    try {
      loading("Loading photocard…");
      await managerRef.current!.loadPhotocard(file);
      syncPcSliders();
      toast.success("Photocard loaded");
    } catch {
      toast.error("Failed to load photocard");
    } finally {
      doneLoading();
      e.target.value = "";
    }
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────────
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) { toast.error("Please drop image or video files"); return; }
    const mgr = managerRef.current!;
    if (files[0]) { await mgr.loadBackground(files[0]); syncBgSliders(); }
    if (files[1]) { await mgr.loadPhotocard(files[1]); syncPcSliders(); }
  };

  // ── Camera ────────────────────────────────────────────────────────────────────
  const exitCameraMode = () => {
    const container = containerRef.current;
    if (!container) return;
    container.classList.remove("camera-active");
    container.classList.remove("preview-mode");
    const canvas = canvasRef.current;
    if (canvas) { canvas.style.width = ""; canvas.style.height = ""; }
    setIsCameraActive(false);
    setShowCameraControls(false);
  };

  const initCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera not supported on this device"); return false;
    }
    if (!videoRef.current) return false;
    try {
      loading("Starting camera…");
      await managerRef.current!.startCamera(videoRef.current);
      setIsCameraActive(true);
      setShowCameraControls(true);
      const container = containerRef.current!;
      container.classList.add("camera-active");
      applyAspectRatioClass(container, cameraAspectRatio);
      setTimeout(() => {
        managerRef.current?.resizeCanvas();
        managerRef.current?.resetPhotocard();
        syncPcSliders();
      }, 100);
      // toolbar is always hidden on mobile — nothing to collapse
      doneLoading();
      return true;
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError")
        toast.error("Camera permission denied.");
      else if (name === "NotFoundError")
        toast.error("No camera found on this device.");
      else toast.error("Failed to access camera");
      doneLoading();
      return false;
    }
  };

  const applyAspectRatioClass = (container: HTMLDivElement, ratio: AspectRatio) => {
    container.classList.remove("aspect-3-4", "aspect-9-16", "aspect-1-1");
    if (ratio === "3:4") container.classList.add("aspect-3-4");
    else if (ratio === "9:16") container.classList.add("aspect-9-16");
    else container.classList.add("aspect-1-1");
  };

  const handleLaunchCamera = async () => {
    setShowMobileHome(false);
    await initCamera();
  };

  const handleCameraCapture = () => {
    const mgr = managerRef.current!;
    setCanvasAspectRatio(cameraAspectRatio);
    mgr.captureFrame();
    setShowCameraControls(false);
    setIsCameraActive(false);
    const container = containerRef.current!;
    container.classList.remove("camera-active");
    container.classList.add("preview-mode");
    applyAspectRatioClass(container, cameraAspectRatio);
    container.style.position = "relative";
    container.style.top = "auto"; container.style.left = "auto"; container.style.zIndex = "auto";
    container.style.width = ""; container.style.height = "";
    container.style.maxWidth = isMobileRef.current ? "100vw" : "800px";
    container.style.maxHeight = isMobileRef.current ? "calc(100vh - 180px)" : "none";
    setTimeout(() => {
      if (canvasRef.current) { canvasRef.current.style.width = ""; canvasRef.current.style.height = ""; }
      mgr.resizeCanvas();
      setTimeout(() => {
        if (isMobileRef.current) window.scrollTo({ top: 0, behavior: "smooth" });
      }, 150);
    }, 100);
    setShowActionButtons(true);
    showFlash();
    toast.success("Photo captured!");
  };

  const showFlash = () => {
    const flash = document.createElement("div");
    Object.assign(flash.style, { position: "fixed", inset: "0", background: "white", zIndex: "9999", pointerEvents: "none", animation: "none", opacity: "1", transition: "opacity 0.3s" });
    document.body.appendChild(flash);
    requestAnimationFrame(() => { flash.style.opacity = "0"; setTimeout(() => document.body.removeChild(flash), 300); });
  };

  const handleCameraAspectToggle = () => {
    const ratios: AspectRatio[] = ["3:4", "9:16", "1:1"];
    const next = ratios[(ratios.indexOf(cameraAspectRatio) + 1) % ratios.length];
    setCameraAspectRatio(next);
    const container = containerRef.current!;
    applyAspectRatioClass(container, next);
    setTimeout(() => managerRef.current?.resizeCanvas(), 100);
  };

  const handleCameraZoomIn = () => {
    const newZ = Math.min(10, cameraZoom + 0.5);
    setCameraZoomState(newZ);
    managerRef.current?.setCameraZoom(newZ);
  };

  const handleCameraZoomOut = () => {
    const newZ = Math.max(1, cameraZoom - 0.5);
    setCameraZoomState(newZ);
    managerRef.current?.setCameraZoom(newZ);
  };

  const handleCameraDiscard = async () => {
    setShowActionButtons(false);
    managerRef.current!.backgroundImage = null;
    if (isMobileRef.current) {
      setShowMobileHome(true);
      managerRef.current!.render();
    } else {
      const started = await initCamera();
      if (!started) toast.info("Ready for new proofshot");
    }
  };

  const handleCameraSave = () => handleSave();

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (!confirm("Reset the canvas? This will clear all images.")) return;
    managerRef.current?.reset();
    syncBgSliders();
    syncPcSliders();
    toast.success("Canvas reset");
  };

  // ── Save/export ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const mgr = managerRef.current!;
    if (!mgr.backgroundImage) { toast.error("Please add a background image before saving"); return; }
    const hasVideo = mgr.hasVideo();
    const hasGif = mgr.hasGifAnimation();
    const asVideo = hasVideo;
    const asGif = !hasVideo && hasGif;
    loading(asVideo ? "Generating video…" : asGif ? "Generating animated GIF…" : "Exporting…");
    try {
      let blob: Blob, mimeType: string, ext: string;
      if (asVideo) {
        const r = await mgr.exportAsVideo();
        blob = r.blob; mimeType = r.mimeType; ext = r.extension;
      } else if (asGif) {
        blob = await mgr.exportImage(true); mimeType = "image/gif"; ext = "gif";
      } else {
        blob = await mgr.exportImage(false); mimeType = "image/png"; ext = "png";
      }
      const filename = `proofshot-${Date.now()}.${ext}`;
      const isMobile = isMobileRef.current;
      if (isMobile && !isAndroid() && !asVideo) {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: "Proofshot", text: "Check out my proofshot!" }); toast.success("Shared!"); }
          catch (se: unknown) { if ((se as { name?: string }).name !== "AbortError") { downloadBlob(blob, filename); toast.success("Saved!"); } }
        } else { downloadBlob(blob, filename); toast.success("Saved!"); }
      } else {
        downloadBlob(blob, filename);
        toast.success(asVideo ? "Video saved!" : asGif ? "Animated GIF saved!" : "Proofshot saved!");
      }
      setShowSaveModal(true);
    } catch {
      toast.error("Failed to save proofshot");
    } finally {
      doneLoading();
    }
  };

  const handleSaveAsVideo = async () => {
    const mgr = managerRef.current!;
    if (!mgr.backgroundImage) { toast.error("Please add a background image before saving"); return; }
    loading("Generating video…");
    try {
      const r = await mgr.exportAsVideo();
      downloadBlob(r.blob, `proofshot-${Date.now()}.${r.extension}`);
      toast.success("Video saved!");
      setShowSaveModal(true);
    } catch {
      toast.error("Failed to save video");
    } finally {
      doneLoading();
    }
  };

  const handleKeepEditing = () => setShowSaveModal(false);

  const handleDiscardImage = async () => {
    setShowSaveModal(false);
    setShowActionButtons(false);
    managerRef.current!.backgroundImage = null;
    if (isMobileRef.current) {
      setShowMobileHome(true);
      managerRef.current!.render();
    } else {
      const started = await initCamera();
      if (!started) { managerRef.current!.render(); toast.info("Ready for new proofshot"); }
    }
  };

  // ── Photocard controls ────────────────────────────────────────────────────────
  const handlePcReset = () => {
    managerRef.current?.resetPhotocard();
    syncPcSliders();
  };

  // ── Toploader ─────────────────────────────────────────────────────────────────
  const handleToploaderToggle = (v: boolean) => {
    setShowToploader(v);
    managerRef.current?.toggleToploader(v);
  };

  // ── Modal open/close state for canvas ─────────────────────────────────────────
  useEffect(() => {
    managerRef.current?.setModalOpen(showSaveModal);
  }, [showSaveModal]);

  // ── Aspect ratio classes ──────────────────────────────────────────────────────
  const containerClasses = cn(
    "relative bg-[#1a1a1a] rounded-lg border border-border overflow-hidden mx-auto touch-none select-none",
    {
      "w-[600px] h-[800px] max-w-full": canvasAspectRatio === "3:4" && !isCameraActive,
      "w-[450px] h-[800px] max-w-full": canvasAspectRatio === "9:16" && !isCameraActive,
      "w-[600px] h-[600px] max-w-full": canvasAspectRatio === "1:1" && !isCameraActive,
    }
  );

  return (
    <>
      {/* External scripts for GIF export */}
      <Script src="https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js" strategy="lazyOnload" />

      {/* Hidden inputs */}
      <input ref={bgFileRef} type="file" accept="image/*,image/gif,video/*" className="hidden" onChange={handleBgUpload} />
      <input ref={pcFileRef} type="file" accept="image/*,image/gif,video/*" className="hidden" onChange={handlePcUpload} />
      {/* Hidden camera video */}
      <video ref={videoRef} autoPlay playsInline className="hidden" />

      <div className="flex flex-col md:flex-row h-full overflow-hidden gap-4">

        {/* ── Canvas section ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto md:overflow-visible">

          {/* Mobile home — fixed overlay, same as original `position:fixed; inset:0; z-index:999` */}
          {showMobileHome && (
            <div className="fixed inset-0 z-[999] bg-background flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-6 text-center max-w-sm w-full">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3">Ready to Create?</h2>
                  <p className="text-muted-foreground text-lg">Take a photo of your photocard with your camera</p>
                </div>
                <button
                  onClick={handleLaunchCamera}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-lg text-lg font-bold hover:bg-primary/90 transition-colors min-w-[200px] justify-center shadow-lg"
                >
                  <Camera className="w-6 h-6" />
                  Launch Camera
                </button>
              </div>
            </div>
          )}

          {/* Canvas container */}
          <div
            ref={containerRef}
            className={containerClasses}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <canvas
              ref={canvasRef}
              className="block cursor-grab active:cursor-grabbing transition-opacity"
            />

            {/* Edit mode toggle (visible when not in camera) */}
            {!isCameraActive && (
              <div
                ref={canvasTabsBarRef}
                className="t-tabs canvas-tabs absolute top-3 left-1/2 -translate-x-1/2 z-10"
                role="tablist"
              >
                <span ref={canvasTabsPillRef} className="t-tabs-pill" aria-hidden="true" />
                {(["photocard", "background"] as EditMode[]).map((mode) => (
                  <button
                    key={mode}
                    role="tab"
                    onClick={() => handleEditModeChange(mode)}
                    aria-selected={editMode === mode}
                    className="t-tab flex items-center gap-1.5 text-xs font-medium"
                  >
                    {mode === "photocard" ? <CreditCard className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                    {mode === "photocard" ? "Photocard" : "Background"}
                  </button>
                ))}
              </div>
            )}

            {/* Camera controls overlay — iOS-style, anchored to bottom (matches original) */}
            {isCameraActive && showCameraControls && (
              <>
                {/* Bottom-center control column: reset / shutter / aspect + zoom */}
                <div
                  className="fixed bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center w-full max-w-[75vh] px-3 z-[1001] pointer-events-none"
                  style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between w-full mb-3 pointer-events-auto">
                    <button
                      onClick={() => { managerRef.current?.resetPhotocard(); syncPcSliders(); toast.success("Photocard reset"); }}
                      className="flex items-center gap-1.5 bg-[rgba(100,100,100,0.7)] text-white px-3 h-11 rounded-md text-sm font-semibold backdrop-blur-sm active:scale-95 transition-transform"
                    >
                      <RefreshCw className="w-4 h-4" /> Reset
                    </button>
                    <button
                      onClick={handleCameraCapture}
                      className="w-[70px] h-[70px] rounded-full border-[3px] border-white/95 bg-transparent flex items-center justify-center active:scale-[0.88] transition-transform shrink-0"
                      style={{ boxShadow: "0 0 0 6px rgba(255,255,255,0.2), 0 6px 12px rgba(0,0,0,0.4)" }}
                      aria-label="Capture"
                    >
                      <div className="w-[54px] h-[54px] rounded-full bg-white" />
                    </button>
                    <button
                      onClick={handleCameraAspectToggle}
                      className="bg-[rgba(100,100,100,0.7)] text-white px-3 h-11 min-w-[50px] rounded-md text-sm font-semibold font-mono backdrop-blur-sm active:scale-95 transition-transform"
                    >
                      {cameraAspectRatio}
                    </button>
                  </div>

                  {/* Zoom controls */}
                  <div className="flex items-center justify-center gap-2 mt-1 mb-1 pointer-events-auto">
                    <button onClick={handleCameraZoomOut} className="w-8 h-8 flex items-center justify-center text-white active:scale-90 transition-transform">
                      <ZoomOut className="w-5 h-5" />
                    </button>
                    <input
                      type="range" min={1} max={10} step={0.1} value={cameraZoom}
                      onChange={(e) => { const v = parseFloat(e.target.value); setCameraZoomState(v); managerRef.current?.setCameraZoom(v); }}
                      className="w-[100px] accent-white"
                    />
                    <button onClick={handleCameraZoomIn} className="w-8 h-8 flex items-center justify-center text-white active:scale-90 transition-transform">
                      <ZoomIn className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Bottom-left: upload background */}
                <button
                  onClick={() => bgFileRef.current?.click()}
                  className="fixed bottom-6 left-6 w-[50px] h-[50px] rounded-full bg-black/60 border border-white/30 text-white flex items-center justify-center backdrop-blur-sm active:scale-90 active:bg-black/80 transition-transform z-[1002]"
                  aria-label="Upload background"
                >
                  <Image className="w-6 h-6" />
                </button>
                {/* Bottom-right: change objekt photocard */}
                <button
                  onClick={triggerPhotocardUpload}
                  className="fixed bottom-6 right-6 w-[50px] h-[50px] rounded-full bg-black/60 border border-white/30 text-white flex items-center justify-center backdrop-blur-sm active:scale-90 active:bg-black/80 transition-transform z-[1002]"
                  aria-label="Change objekt image"
                >
                  <BadgePlus className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Camera action buttons (after capture) */}
          {showActionButtons && (
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleCameraDiscard}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium"
              >
                <RotateCcw className="w-4 h-4" /> Retake
              </button>
              <button
                onClick={handleCameraSave}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                <Check className="w-4 h-4" /> Save
              </button>
            </div>
          )}
        </div>

        {/* ── Toolbar — hidden on mobile, visible on desktop (matches original display:none !important) */}
        <div className="hidden md:flex md:w-80 flex-shrink-0 bg-[#1a1a1a] border border-border rounded-lg flex-col overflow-hidden md:max-h-full md:overflow-y-auto sticky top-0">
          <div className="flex flex-col gap-5 p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Proofshot</p>
                <h2 className="text-base font-semibold">Adjust layers</h2>
              </div>
              {/* Aspect ratio selector */}
              <div ref={aspectMenuContainerRef} className="relative">
                <button
                  onClick={() => setAspectMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80"
                >
                  <span>{canvasAspectRatio}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {aspectMenuOpen && (
                  <div className="aspect-dd-open absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden min-w-20">
                    {(["3:4", "9:16", "1:1"] as AspectRatio[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => { applyCanvasAspectRatio(r); setAspectMenuOpen(false); }}
                        className={cn("w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent", canvasAspectRatio === r && "bg-accent")}
                      >
                        <span>{r}</span>
                        {canvasAspectRatio === r && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Layer tabs */}
            <div ref={tabsBarRef} className="t-tabs proofshot-tabs flex gap-1 bg-secondary/50 p-1 rounded-lg">
              <span ref={tabsPillRef} className="t-tabs-pill" aria-hidden="true" />
              {(["photocard", "background"] as EditMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleEditModeChange(mode)}
                  aria-selected={editMode === mode}
                  className="t-tab flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium"
                >
                  {mode === "photocard" ? <CreditCard className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                  {mode === "photocard" ? "Photocard" : "Background"}
                </button>
              ))}
            </div>

            {/* Add Media */}
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-2.5">Add Media</p>
              <div className="flex gap-2">
                <button onClick={() => bgFileRef.current?.click()} className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg bg-secondary hover:bg-secondary/80">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-sm">Background</span>
                </button>
                <button onClick={() => initCamera()} className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg bg-secondary hover:bg-secondary/80 md:hidden">
                  <Camera className="w-5 h-5" />
                  <span className="text-sm">Camera</span>
                </button>
                <button onClick={triggerPhotocardUpload} className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg bg-secondary hover:bg-secondary/80">
                  <BadgePlus className="w-5 h-5" />
                  <span className="text-sm">Photocard</span>
                </button>
              </div>
            </div>

            {/* Background controls */}
            {editMode === "background" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Background</p>
                <ControlSlider label="Position X" value={bgSliders.x} min={-500} max={500} step={1} display={Math.round(bgSliders.x).toString()} onChange={(v) => { setBgSliders((s) => ({ ...s, x: v })); managerRef.current?.updateBackground("x", v); }} />
                <ControlSlider label="Position Y" value={bgSliders.y} min={-500} max={500} step={1} display={Math.round(bgSliders.y).toString()} onChange={(v) => { setBgSliders((s) => ({ ...s, y: v })); managerRef.current?.updateBackground("y", v); }} />
                <ControlSlider label="Scale" value={bgSliders.scale} min={0.1} max={3} step={0.01} display={bgSliders.scale.toFixed(2)} onChange={(v) => { setBgSliders((s) => ({ ...s, scale: v })); managerRef.current?.updateBackground("scale", v); }} />
                <ControlSlider label="Rotation" value={bgSliders.rotation} min={-180} max={180} step={1} display={Math.round(bgSliders.rotation) + "°"} onChange={(v) => { setBgSliders((s) => ({ ...s, rotation: v })); managerRef.current?.updateBackground("rotation", v); }} />
                <div className="flex gap-2">
                  <button onClick={() => managerRef.current?.flipBackgroundHorizontal()} className="flex-1 flex items-center justify-center gap-1 p-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-sm">
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                  <button onClick={() => managerRef.current?.flipBackgroundVertical()} className="flex-1 flex items-center justify-center gap-1 p-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-sm">
                    <FlipVertical className="w-4 h-4" />
                  </button>
                  <button onClick={() => { managerRef.current?.resetBackground(); syncBgSliders(); }} className="flex-1 flex items-center justify-center gap-1 p-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-sm">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Photocard controls */}
            {editMode === "photocard" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Photocard</p>
                <ControlSlider label="Position X" value={pcSliders.x} min={0} max={1000} step={1} display={Math.round(pcSliders.x).toString()} onChange={(v) => { setPcSliders((s) => ({ ...s, x: v })); managerRef.current?.updatePhotocard("x", v); }} />
                <ControlSlider label="Position Y" value={pcSliders.y} min={0} max={1000} step={1} display={Math.round(pcSliders.y).toString()} onChange={(v) => { setPcSliders((s) => ({ ...s, y: v })); managerRef.current?.updatePhotocard("y", v); }} />
                <ControlSlider label="Scale" value={pcSliders.scale} min={0.1} max={5} step={0.01} display={pcSliders.scale.toFixed(2)} onChange={(v) => { setPcSliders((s) => ({ ...s, scale: v })); managerRef.current?.updatePhotocard("scale", v); }} />
                <ControlSlider label="Rotation" value={pcSliders.rotation} min={-180} max={180} step={1} display={Math.round(pcSliders.rotation) + "°"} onChange={(v) => { setPcSliders((s) => ({ ...s, rotation: v })); managerRef.current?.updatePhotocard("rotation", (v * Math.PI) / 180); }} />
                <div className="flex items-center gap-2">
                  <Switch id="toploader" checked={showToploader} onCheckedChange={handleToploaderToggle} />
                  <Label htmlFor="toploader" className="text-base">Show Toploader</Label>
                </div>
                <div className="flex gap-2">
                  <button onClick={handlePcReset} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-sm">
                    <RefreshCw className="w-4 h-4" /> Reset
                  </button>
                  <button onClick={handlePcReset} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-md bg-secondary hover:bg-secondary/80 text-sm">
                    <Move className="w-4 h-4" /> Position
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <button onClick={handleReset} className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium">
                <RefreshCw className="w-4 h-4" /> Reset Canvas
              </button>
              <button
                onClick={handleSave}
                className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold"
              >
                Save
              </button>
              <button onClick={handleSaveAsVideo} className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium">
                <Video className="w-4 h-4" /> Save as Video
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="t-shimmer loading-shimmer font-semibold" data-text={loadingMessage}>{loadingMessage}</span>
          </div>
        </div>
      )}

      {/* Save confirmation dialog */}
      <Dialog open={showSaveModal} onOpenChange={(o) => { setShowSaveModal(o); managerRef.current?.setModalOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>What&apos;s Next?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <button onClick={handleKeepEditing} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              <Edit className="w-4 h-4" /> Keep Editing
            </button>
            <button onClick={handleDiscardImage} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium">
              <Trash2 className="w-4 h-4" /> Discard Image
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        /* ── transitions-dev variables ── */
        :root {
          --tabs-dur: 200ms;
          --tabs-ease: cubic-bezier(0.22, 1, 0.36, 1);
          --shimmer-dur: 2000ms;
          --shimmer-band: 400%;
          --shimmer-ease: linear;
        }
        /* ── Aspect ratio dropdown open animation ── */
        @keyframes aspect-dd-in {
          from { transform: scale(0.97); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        .aspect-dd-open {
          transform-origin: top right;
          animation: aspect-dd-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .aspect-dd-open { animation: none !important; }
        }
        /* ── Tabs sliding ── */
        .t-tabs {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border-radius: 48px;
        }
        .t-tab {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          height: 30px;
          padding: 4px 12px;
          color: var(--tabs-text-muted);
          cursor: pointer;
          border-radius: 48px;
          z-index: 1;
          transition: color var(--tabs-dur) var(--tabs-ease);
        }
        .t-tab:not([aria-selected="true"]):hover,
        .t-tab[aria-selected="true"] { color: var(--tabs-text-active); }
        .t-tabs-pill {
          position: absolute;
          top: 3px;
          left: 0;
          height: 30px;
          width: 0;
          background: var(--tabs-pill-bg);
          border-radius: 48px;
          transform: translateX(0);
          transition:
            transform var(--tabs-dur) var(--tabs-ease),
            width     var(--tabs-dur) var(--tabs-ease);
          will-change: transform, width;
          z-index: 0;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .t-tabs-pill, .t-tab { transition: none !important; }
        }
        /* ── Canvas overlay tabs ── */
        .canvas-tabs.t-tabs {
          position: absolute;
          border-radius: 0.5rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px);
          padding: 3px;
          gap: 3px;
        }
        .canvas-tabs .t-tabs-pill {
          --tabs-pill-bg: #ffffff;
          top: 3px;
          height: calc(100% - 6px);
          border-radius: 6px;
        }
        .canvas-tabs .t-tab {
          --tabs-text-muted: rgba(255, 255, 255, 0.55);
          --tabs-text-active: #1a1a1a;
          height: auto;
          padding: 4px 10px;
          border-radius: 6px;
        }
        /* ── Proofshot tabs overrides ── */
        .proofshot-tabs.t-tabs {
          display: flex;
          border-radius: 0.5rem;
          background: transparent;
          padding: 4px;
          gap: 4px;
        }
        .proofshot-tabs .t-tabs-pill {
          --tabs-pill-bg: var(--background);
          top: 4px;
          height: calc(100% - 8px);
          border-radius: 0.375rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        }
        .proofshot-tabs .t-tab {
          --tabs-text-muted: var(--muted-foreground);
          --tabs-text-active: var(--foreground);
          height: auto;
          padding: 6px 0;
          border-radius: 0.375rem;
        }
        /* ── Shimmer text ── */
        .t-shimmer {
          position: relative;
          display: inline-block;
          color: var(--shimmer-base);
        }
        .t-shimmer::before {
          content: attr(data-text);
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: linear-gradient(
            90deg,
            transparent 0%, transparent 40%,
            var(--shimmer-highlight) 50%,
            transparent 60%, transparent 100%
          );
          background-size: var(--shimmer-band) 100%;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: t-shimmer var(--shimmer-dur) var(--shimmer-ease) infinite;
        }
        @keyframes t-shimmer {
          0%   { background-position: 100% 0; }
          100% { background-position: 0% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .t-shimmer::before { animation: none !important; }
        }
        /* Loading overlay shimmer colours */
        .loading-shimmer {
          --shimmer-base: rgba(255, 255, 255, 0.65);
          --shimmer-highlight: #ffffff;
        }
        /* ── canvas/camera ── */
        .aspect-3-4 { aspect-ratio: 3/4; }
        .aspect-9-16 { aspect-ratio: 9/16; }
        .aspect-1-1 { aspect-ratio: 1/1; }
        .camera-active {
          position: fixed !important;
          inset: 0 !important;
          z-index: 1000 !important;
          width: 100vw !important;
          height: 100dvh !important;
          max-width: none !important;
          max-height: none !important;
          aspect-ratio: unset !important;
          border-radius: 0 !important;
          margin: 0 !important;
          background: #000 !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: center !important;
        }
        .camera-active canvas {
          position: relative;
          width: auto !important;
          height: auto !important;
          max-width: 100vw;
          max-height: 100dvh;
        }
        .camera-active.aspect-3-4 canvas { aspect-ratio: 3/4; width: min(calc(100dvh * 0.75), 100vw) !important; height: auto !important; }
        .camera-active.aspect-9-16 canvas { aspect-ratio: 9/16; width: min(calc(100dvh * 0.5625), 100vw) !important; height: auto !important; }
        .camera-active.aspect-1-1 canvas { aspect-ratio: 1/1; width: min(100dvh, 100vw) !important; height: auto !important; }
        canvas.placeholder-active { animation: placeholderPulse 2s ease-in-out infinite; }
        @keyframes placeholderPulse { 0%,100% { opacity:1; } 50% { opacity:0.85; } }
      `}</style>
    </>
  );
}
