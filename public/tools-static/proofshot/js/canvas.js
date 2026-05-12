/**
 * canvas.js
 * Manages the HTML5 canvas, image composition, and touch gestures
 */

const CanvasManager = {
    canvas: null,
    ctx: null,
    backgroundImage: null,
    photocardImage: null,

    // GIF animation properties
    photocardGif: {
        isGif: false,
        frames: [],
        delays: [],
        currentFrame: 0,
        lastFrameTime: 0,
        animationFrame: null
    },

    backgroundGif: {
        isGif: false,
        frames: [],
        delays: [],
        currentFrame: 0,
        lastFrameTime: 0,
        animationFrame: null
    },

    // Video properties
    photocardVideo: {
        isVideo: false,
        element: null,
        originalFile: null,
        animationFrame: null
    },

    backgroundVideo: {
        isVideo: false,
        element: null,
        originalFile: null,
        animationFrame: null
    },

    // Camera properties
    camera: {
        active: false,
        stream: null,
        video: null,
        facingMode: 'environment', // 'user' for front, 'environment' for back
        animationFrame: null,
        currentZoom: 1, // Current zoom level
        minZoom: 1,
        maxZoom: 10,
        supportedZoomLevel: null // Will be set based on device capabilities
    },

    // Background transform properties
    background: {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false
    },

    // Photocard transform properties
    photocard: {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        layer: 'front', // 'front' or 'back'
        showToploader: true // toploader visibility
    },

    // Crop settings (for export)
    crop: {
        enabled: false,
        aspectRatio: null, // '4:3', '9:16', '1:1'
        bounds: { x: 0, y: 0, width: 0, height: 0 }
    },

    // Toploader gradient cache (to avoid recreating on every frame)
    toploaderGradientCache: {
        westGradient: null,
        eastGradient: null,
        southGradient: null,
        cachedWidth: null,
        cachedHeight: null
    },

    // Touch/gesture state
    gesture: {
        active: false,
        startDistance: 0,
        startAngle: 0,
        startScale: 1,
        startRotation: 0,
        lastX: 0,
        lastY: 0,
        pointers: []
    },

    // Animation state
    animation: {
        active: false,
        velocityX: 0,
        velocityY: 0
    },

    // Edit mode ('photocard' or 'background')
    editMode: 'photocard',

    /**
     * Initialize the canvas manager
     */
    init() {
        this.canvas = document.getElementById('proofshot-canvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d', { alpha: false });

        // Enable high-quality image rendering
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        this.resizeCanvas();
        this.attachEventListeners();

        // Load placeholder photocard
        this.loadPlaceholderPhotocard();

        // Initial render
        this.render();
    },

    /**
     * Resize canvas to match container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const isCameraActive = container.classList.contains('camera-active');
        const isPreviewMode = container.classList.contains('preview-mode');

        let canvasWidth, canvasHeight;

        if (isCameraActive) {
            // In camera mode, calculate dimensions based on aspect ratio
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            if (container.classList.contains('aspect-3-4')) {
                // 3:4 aspect ratio
                canvasWidth = Math.min(vh * 0.75, vw);
                canvasHeight = canvasWidth * (4/3);
            } else if (container.classList.contains('aspect-9-16')) {
                // 9:16 aspect ratio
                canvasWidth = Math.min(vh * 0.5625, vw);
                canvasHeight = canvasWidth * (16/9);
            } else if (container.classList.contains('aspect-1-1')) {
                // 1:1 aspect ratio
                canvasWidth = Math.min(vh, vw);
                canvasHeight = canvasWidth;
            } else {
                // Default to 3:4
                canvasWidth = Math.min(vh * 0.75, vw);
                canvasHeight = canvasWidth * (4/3);
            }
        } else if (isPreviewMode) {
            // Preview mode - keep current canvas dimensions to preserve resolution
            canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
            canvasHeight = this.canvas.height / (window.devicePixelRatio || 1);

            // Skip the normal resize logic and just update display
            this.updatePreviewDisplay();
            return;
        } else {
            // Normal mode - use container dimensions
            const rect = container.getBoundingClientRect();
            canvasWidth = rect.width;
            canvasHeight = rect.height;

            // Fallback to default size if container has no dimensions yet
            if (canvasWidth < 100 || canvasHeight < 100) {
                canvasWidth = 600;
                canvasHeight = 800;
            }
        }

        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = canvasWidth * dpr;
        this.canvas.height = canvasHeight * dpr;

        // Reset transform and scale context to match
        // (Setting canvas.width/height resets the context, so we need to reapply the scale)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to identity matrix
        this.ctx.scale(dpr, dpr);

        // Reapply high-quality rendering settings (reset when canvas size changes)
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        // Set display size (CSS handles positioning in camera mode)
        if (!isCameraActive) {
            this.canvas.style.width = canvasWidth + 'px';
            this.canvas.style.height = canvasHeight + 'px';

            // Also set container dimensions if they weren't set
            if (container.getBoundingClientRect().width < 100) {
                container.style.width = canvasWidth + 'px';
                container.style.height = canvasHeight + 'px';
            }
        }

        this.render();
    },

    /**
     * Update preview display to avoid scaling blur
     */
    updatePreviewDisplay() {
        const container = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;

        // Set canvas CSS dimensions to exactly match buffer (1:1 pixel mapping, no scaling)
        const bufferWidth = this.canvas.width / dpr;
        const bufferHeight = this.canvas.height / dpr;

        this.canvas.style.width = bufferWidth + 'px';
        this.canvas.style.height = bufferHeight + 'px';

        // Scale down the canvas if it's too large for the viewport
        const containerMaxWidth = 800; // From CSS max-width
        const containerWidth = container.getBoundingClientRect().width || containerMaxWidth;
        const maxWidth = Math.min(containerMaxWidth, containerWidth);

        if (bufferWidth > maxWidth) {
            const scale = maxWidth / bufferWidth;
            this.canvas.style.transform = `scale(${scale})`;
            this.canvas.style.transformOrigin = 'top left';

            // Adjust container height to account for scaling
            container.style.height = (bufferHeight * scale) + 'px';
        } else {
            this.canvas.style.transform = 'none';
            container.style.height = 'auto';
        }

        this.render();
    },

    /**
     * Attach event listeners for touch and mouse interactions
     */
    attachEventListeners() {
        // Resize observer
        window.addEventListener('resize', () => this.resizeCanvas());

        // Pointer events for unified touch/mouse handling
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));

        // Prevent default touch behaviors (but allow placeholder clicks)
        this.canvas.addEventListener('touchstart', (e) => {
            // If placeholder is tapped, check if it's on the photocard area
            if (this.isPlaceholder && e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                // If tap is on placeholder, don't prevent default yet
                // Let the pointer event handle it
                if (this.isPointOnPhotocard(x, y)) {
                    return;
                }
            }
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        // Add explicit click handler for mobile placeholder (as a fallback)
        this.canvas.addEventListener('click', (e) => {
            if (!this.photocardImage || !this.isPlaceholder) return;

            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.isPointOnPhotocard(x, y)) {
                e.preventDefault();
                e.stopPropagation();

                // Trigger upload
                const photocardFileInput = document.getElementById('photocard-file-input');
                if (photocardFileInput) {
                    photocardFileInput.click();
                }
            }
        });

        // Mouse wheel for zoom (desktop)
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    },

    /**
     * Handle pointer down (touch/mouse start)
     */
    handlePointerDown(e) {
        // Prevent interaction when modals are open
        if (document.querySelector('.modal.active')) return;

        // Allow interaction if either background or photocard exists
        if (!this.backgroundImage && !this.photocardImage) return;

        // If placeholder is clicked, trigger upload dialog
        if (this.isPlaceholder && this.gesture.pointers.length === 0) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check if click is on the photocard
            if (this.isPointOnPhotocard(x, y)) {
                // Add visual feedback
                const originalScale = this.photocard.scale;
                this.photocard.scale *= 0.95;
                this.render();

                // Trigger photocard upload with debounce (prevents double prompts on Android)
                if (window.UIManager) {
                    window.UIManager.triggerPhotocardFileInput();
                } else {
                    // Fallback if UIManager not available
                    const photocardFileInput = document.getElementById('photocard-file-input');
                    if (photocardFileInput) {
                        photocardFileInput.click();
                    }
                }

                // Reset scale after a brief moment
                setTimeout(() => {
                    this.photocard.scale = originalScale;
                    this.render();
                }, 150);

                // Prevent event from continuing to gesture handlers
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        this.gesture.pointers.push({
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY
        });

        if (this.gesture.pointers.length === 1) {
            // Single pointer - drag
            this.gesture.lastX = e.clientX;
            this.gesture.lastY = e.clientY;
        } else if (this.gesture.pointers.length === 2) {
            // Two pointers - pinch/zoom and rotate/drag
            const p1 = this.gesture.pointers[0];
            const p2 = this.gesture.pointers[1];

            // Calculate center point for two-finger drag
            const centerX = (p1.x + p2.x) / 2;
            const centerY = (p1.y + p2.y) / 2;
            this.gesture.lastCenterX = centerX;
            this.gesture.lastCenterY = centerY;

            this.gesture.startDistance = this.getDistance(p1, p2);
            this.gesture.startAngle = this.getAngle(p1, p2);

            if (this.editMode === 'background') {
                this.gesture.startScale = this.background.scale;
                this.gesture.startRotation = this.background.rotation;
            } else {
                this.gesture.startScale = this.photocard.scale;
                this.gesture.startRotation = this.photocard.rotation;
            }
        }

        this.gesture.active = true;
        this.animation.active = false;
    },

    /**
     * Handle pointer move (touch/mouse move)
     */
    handlePointerMove(e) {
        // Prevent interaction when modals are open
        if (document.querySelector('.modal.active')) return;

        // Update cursor if hovering over placeholder
        if (this.isPlaceholder && !this.gesture.active) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (this.isPointOnPhotocard(x, y)) {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.canvas.style.cursor = 'grab';
            }
        }

        if (!this.gesture.active) return;

        // Update pointer position
        const pointerIndex = this.gesture.pointers.findIndex(p => p.id === e.pointerId);
        if (pointerIndex !== -1) {
            this.gesture.pointers[pointerIndex].x = e.clientX;
            this.gesture.pointers[pointerIndex].y = e.clientY;
        }

        if (this.editMode === 'background' && this.backgroundImage) {
            // Background editing mode
            if (this.gesture.pointers.length === 1) {
                // Single pointer - drag background
                const dx = e.clientX - this.gesture.lastX;
                const dy = e.clientY - this.gesture.lastY;

                this.background.x += dx;
                this.background.y += dy;

                this.gesture.lastX = e.clientX;
                this.gesture.lastY = e.clientY;

                // Store velocity for inertia
                this.animation.velocityX = dx;
                this.animation.velocityY = dy;
            } else if (this.gesture.pointers.length === 2) {
                // Two pointers - pinch to zoom and drag to move
                const p1 = this.gesture.pointers[0];
                const p2 = this.gesture.pointers[1];

                // Calculate center point of the two pointers
                const centerX = (p1.x + p2.x) / 2;
                const centerY = (p1.y + p2.y) / 2;

                // Drag: move background based on center point movement
                if (this.gesture.lastCenterX !== undefined) {
                    const dx = centerX - this.gesture.lastCenterX;
                    const dy = centerY - this.gesture.lastCenterY;
                    this.background.x += dx;
                    this.background.y += dy;
                }

                this.gesture.lastCenterX = centerX;
                this.gesture.lastCenterY = centerY;

                // Pinch to zoom
                const distance = this.getDistance(p1, p2);
                const scaleChange = distance / this.gesture.startDistance;
                this.background.scale = Math.max(0.1, Math.min(3, this.gesture.startScale * scaleChange));
            }
        } else if (this.editMode === 'photocard' && this.photocardImage) {
            // Photocard editing mode (existing behavior)
            if (this.gesture.pointers.length === 1) {
                // Single pointer - drag
                const dx = e.clientX - this.gesture.lastX;
                const dy = e.clientY - this.gesture.lastY;

                this.photocard.x += dx;
                this.photocard.y += dy;

                this.gesture.lastX = e.clientX;
                this.gesture.lastY = e.clientY;

                // Store velocity for inertia
                this.animation.velocityX = dx;
                this.animation.velocityY = dy;
            } else if (this.gesture.pointers.length === 2) {
                // Two pointers - pinch and rotate
                const p1 = this.gesture.pointers[0];
                const p2 = this.gesture.pointers[1];

                // Pinch to zoom
                const distance = this.getDistance(p1, p2);
                const scaleChange = distance / this.gesture.startDistance;
                this.photocard.scale = Math.max(0.1, Math.min(5, this.gesture.startScale * scaleChange));

                // Rotate
                const angle = this.getAngle(p1, p2);
                const angleChange = angle - this.gesture.startAngle;
                this.photocard.rotation = this.gesture.startRotation + angleChange;
            }
        }

        this.render();
    },

    /**
     * Handle pointer up (touch/mouse end)
     */
    handlePointerUp(e) {
        // Remove pointer
        this.gesture.pointers = this.gesture.pointers.filter(p => p.id !== e.pointerId);

        if (this.gesture.pointers.length === 0) {
            this.gesture.active = false;

            // Reset center tracking
            this.gesture.lastCenterX = undefined;
            this.gesture.lastCenterY = undefined;

            // Start inertia animation if there's significant velocity
            if (Math.abs(this.animation.velocityX) > 1 || Math.abs(this.animation.velocityY) > 1) {
                this.startInertiaAnimation();
            }
        } else if (this.gesture.pointers.length === 1) {
            // Reset to single pointer drag
            const p = this.gesture.pointers[0];
            this.gesture.lastX = p.x;
            this.gesture.lastY = p.y;
            this.gesture.lastCenterX = undefined;
            this.gesture.lastCenterY = undefined;
        }
    },

    /**
     * Handle mouse wheel for zoom (desktop)
     */
    handleWheel(e) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.95 : 1.05;

        if (this.editMode === 'background' && this.backgroundImage) {
            // Zoom background
            this.background.scale = Math.max(0.1, Math.min(3, this.background.scale * delta));
        } else if (this.editMode === 'photocard' && this.photocardImage) {
            // Zoom photocard
            this.photocard.scale = Math.max(0.1, Math.min(5, this.photocard.scale * delta));
        }

        this.render();
    },

    /**
     * Start inertia animation
     */
    startInertiaAnimation() {
        this.animation.active = true;

        const animate = () => {
            if (!this.animation.active) return;

            // Apply velocity based on edit mode
            if (this.editMode === 'background' && this.backgroundImage) {
                this.background.x += this.animation.velocityX;
                this.background.y += this.animation.velocityY;
            } else if (this.editMode === 'photocard' && this.photocardImage) {
                this.photocard.x += this.animation.velocityX;
                this.photocard.y += this.animation.velocityY;
            }

            // Friction
            this.animation.velocityX *= 0.9;
            this.animation.velocityY *= 0.9;

            // Stop if velocity is negligible
            if (Math.abs(this.animation.velocityX) < 0.1 && Math.abs(this.animation.velocityY) < 0.1) {
                this.animation.active = false;
                return;
            }

            this.render();
            requestAnimationFrame(animate);
        };

        animate();
    },

    /**
     * Get distance between two points
     */
    getDistance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Get angle between two points
     */
    getAngle(p1, p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    },

    /**
     * Check if a point is on the photocard (for hit detection)
     */
    isPointOnPhotocard(x, y) {
        if (!this.photocardImage) return false;

        // Transform point to photocard's local coordinates
        const dx = x - this.photocard.x;
        const dy = y - this.photocard.y;

        // Rotate point by inverse rotation
        const cos = Math.cos(-this.photocard.rotation);
        const sin = Math.sin(-this.photocard.rotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        // Scale point
        const scaledX = localX / this.photocard.scale;
        const scaledY = localY / this.photocard.scale;

        // Check if within image bounds
        // Handle both image and video elements
        const width = this.photocardImage.videoWidth || this.photocardImage.width;
        const height = this.photocardImage.videoHeight || this.photocardImage.height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        return Math.abs(scaledX) <= halfWidth && Math.abs(scaledY) <= halfHeight;
    },

    /**
     * Start camera with specified facing mode
     */
    async startCamera() {
        try {
            // Get video element
            this.camera.video = document.getElementById('camera-video');

            if (!this.camera.video) {
                throw new Error('Camera video element not found');
            }

            // Request camera access
            const constraints = {
                video: {
                    facingMode: this.camera.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            this.camera.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.camera.video.srcObject = this.camera.stream;
            this.camera.active = true;

            // Wait for video to be ready
            await new Promise((resolve) => {
                this.camera.video.onloadedmetadata = () => {
                    resolve();
                };
            });

            // Start rendering camera frames
            this.renderCameraFrame();

            return true;
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw error;
        }
    },

    /**
     * Stop camera stream
     */
    stopCamera() {
        if (this.camera.stream) {
            this.camera.stream.getTracks().forEach(track => track.stop());
            this.camera.stream = null;
        }

        if (this.camera.animationFrame) {
            cancelAnimationFrame(this.camera.animationFrame);
            this.camera.animationFrame = null;
        }

        this.camera.active = false;
        this.camera.video = null;
        this.render();
    },

    /**
     * Flip camera between front and back
     */
    async flipCamera() {
        this.camera.facingMode = this.camera.facingMode === 'user' ? 'environment' : 'user';
        this.stopCamera();
        await this.startCamera();
    },

    /**
     * Set camera zoom level
     */
    setCameraZoom(zoomLevel) {
        if (!this.camera.stream || !this.camera.active) {
            console.warn('Camera is not active');
            return false;
        }

        // Clamp zoom level to valid range
        const clampedZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, zoomLevel));
        this.camera.currentZoom = clampedZoom;

        // Get video track from stream
        const videoTrack = this.camera.stream.getVideoTracks()[0];
        if (!videoTrack) {
            console.warn('No video track found');
            return false;
        }

        // Try to apply zoom using getCapabilities and applyConstraints
        try {
            // Check if getCapabilities is supported
            if (!videoTrack.getCapabilities) {
                console.warn('getCapabilities not supported on this device');
                return false;
            }

            const capabilities = videoTrack.getCapabilities();
            console.log('Camera capabilities:', capabilities);

            if (capabilities.zoom) {
                // Update min/max zoom based on device capabilities
                const zoomRange = capabilities.zoom;
                if (zoomRange.min && zoomRange.max) {
                    this.camera.minZoom = zoomRange.min;
                    this.camera.maxZoom = zoomRange.max;
                    console.log(`Zoom range: ${this.camera.minZoom} - ${this.camera.maxZoom}`);
                }

                // Clamp again with actual device limits
                const deviceClampedZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, clampedZoom));

                // Use zoom capability if available
                const zoomConstraint = {
                    advanced: [{ zoom: deviceClampedZoom }]
                };
                console.log('Applying zoom constraint:', zoomConstraint);

                return videoTrack.applyConstraints(zoomConstraint).then(() => {
                    console.log('Zoom applied successfully:', deviceClampedZoom);
                    return true;
                }).catch(err => {
                    console.error('Could not apply zoom constraint:', err);
                    return false;
                });
            } else {
                console.warn('Zoom capability not supported on this device');
                return false;
            }
        } catch (error) {
            console.error('Error setting camera zoom:', error);
            return false;
        }
    },

    /**
     * Increase camera zoom
     */
    increaseCameraZoom(step = 0.5) {
        const newZoom = this.camera.currentZoom + step;
        return this.setCameraZoom(newZoom);
    },

    /**
     * Decrease camera zoom
     */
    decreaseCameraZoom(step = 0.5) {
        const newZoom = this.camera.currentZoom - step;
        return this.setCameraZoom(newZoom);
    },

    /**
     * Get current camera zoom level
     */
    getCameraZoom() {
        return this.camera.currentZoom;
    },

    /**
     * Get camera zoom constraints
     */
    getCameraZoomConstraints() {
        if (!this.camera.stream) return { min: 1, max: 10 };

        const videoTrack = this.camera.stream.getVideoTracks()[0];
        if (!videoTrack) return { min: 1, max: 10 };

        try {
            const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};

            if (capabilities.zoom) {
                return {
                    min: capabilities.zoom.min || 1,
                    max: capabilities.zoom.max || 10
                };
            }
        } catch (error) {
            console.warn('Error getting zoom constraints:', error);
        }

        return { min: 1, max: 10 };
    },

    /**
     * Render camera frame to canvas
     */
    renderCameraFrame() {
        if (!this.camera.active || !this.camera.video) return;

        // Render the current frame
        this.render();

        // Schedule next frame
        this.camera.animationFrame = requestAnimationFrame(() => this.renderCameraFrame());
    },

    /**
     * Capture current camera frame as background
     */
    captureFrame() {
        if (!this.camera.active || !this.camera.video) return;

        // Create a canvas to capture the current frame
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = this.camera.video.videoWidth;
        captureCanvas.height = this.camera.video.videoHeight;
        const captureCtx = captureCanvas.getContext('2d');

        // Draw the video frame
        captureCtx.drawImage(this.camera.video, 0, 0);

        // Convert to image
        const img = new Image();
        img.onload = () => {
            this.backgroundImage = img;
            this.stopCamera();

            // If no real photocard has been uploaded, ensure placeholder is visible
            if (!this.photocardImage || this.isPlaceholder) {
                this.loadPlaceholderPhotocard();
            }
        };
        img.src = captureCanvas.toDataURL('image/png');
    },

    /**
     * Load background image
     */
    loadBackground(file) {
        return new Promise((resolve, reject) => {
            // Check if it's a video
            if (file.type.startsWith('video/')) {
                this.loadBackgroundVideo(file).then(resolve).catch(reject);
                return;
            }

            // Check if it's a GIF
            if (file.type === 'image/gif') {
                this.loadBackgroundGif(file).then(resolve).catch(reject);
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    this.backgroundGif.isGif = false;
                    this.backgroundVideo.isVideo = false;
                    this.render();
                    resolve();
                };
                img.onerror = reject;
                img.src = e.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Load background GIF and parse frames
     */
    async loadBackgroundGif(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const gif = await this.parseGif(arrayBuffer);

                    this.backgroundGif.isGif = true;
                    this.backgroundGif.frames = gif.frames;
                    this.backgroundGif.delays = gif.delays;
                    this.backgroundGif.currentFrame = 0;
                    this.backgroundGif.lastFrameTime = performance.now();

                    this.backgroundImage = gif.frames[0];
                    this.startBackgroundGifAnimation();
                    this.render();
                    resolve();
                } catch (error) {
                    console.error('Error parsing GIF:', error);
                    reject(error);
                }
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Load background video
     */
    async loadBackgroundVideo(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.autoplay = false;

            const url = URL.createObjectURL(file);
            let initialized = false;

            video.onloadedmetadata = () => {
                // Store the video element
                this.backgroundVideo.isVideo = true;
                this.backgroundVideo.element = video;
                this.backgroundVideo.originalFile = file;
                this.backgroundGif.isGif = false;

                // Create an image from the first frame for initial display
                video.currentTime = 0;
            };

            video.onseeked = () => {
                // Only initialize once to avoid issues on loop
                if (initialized) return;
                initialized = true;

                // Video is ready at first frame
                this.backgroundImage = video;

                // Start video playback and animation
                video.play().then(() => {
                    this.startBackgroundVideoAnimation();
                    this.render();
                    resolve();
                }).catch(reject);
            };

            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video'));
            };

            video.src = url;
        });
    },

    /**
     * Load placeholder photocard image
     */
    loadPlaceholderPhotocard() {
        // Create a placeholder SVG for the photocard
        const placeholderSvg = `
            <svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#c7b6f9;stop-opacity:0.25" />
                        <stop offset="100%" style="stop-color:#6dd5a0;stop-opacity:0.2" />
                    </linearGradient>
                </defs>
                <rect width="600" height="900" rx="30" fill="url(#cardGrad)" stroke="#c7b6f9" stroke-width="4" opacity="0.7" stroke-dasharray="20,10"/>

                <!-- Upload Icon -->
                <circle cx="300" cy="380" r="60" fill="#c7b6f9" opacity="0.2"/>
                <path d="M 300 340 L 300 400 M 280 360 L 300 340 L 320 360" stroke="#c7b6f9" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
                <rect x="270" y="400" width="60" height="8" rx="4" fill="#c7b6f9" opacity="0.8"/>

                <!-- Text -->
                <text x="300" y="480" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#c7b6f9" text-anchor="middle" opacity="0.9">Tap to Upload</text>
                <text x="300" y="520" font-family="Arial, sans-serif" font-size="28" fill="#a0aec0" text-anchor="middle" opacity="0.8">Your Photocard</text>
            </svg>
        `;

        const img = new Image();
        img.onload = () => {
            this.photocardImage = img;
            this.isPlaceholder = true;

            // Add placeholder-active class for animation
            this.canvas.classList.add('placeholder-active');

            // Center photocard on canvas
            const rect = this.canvas.getBoundingClientRect();
            this.photocard.x = rect.width / 2;
            this.photocard.y = rect.height / 2;
            this.photocard.scale = Math.min(rect.width, rect.height) / (img.width * 1.5);

            this.render();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(placeholderSvg);
    },

    /**
     * Load photocard image
     */
    loadPhotocard(file) {
        return new Promise((resolve, reject) => {
            // Check if it's a video
            if (file.type.startsWith('video/')) {
                this.loadPhotocardVideo(file).then(resolve).catch(reject);
                return;
            }

            // Check if it's a GIF
            if (file.type === 'image/gif') {
                this.loadPhotocardGif(file).then(resolve).catch(reject);
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.photocardImage = img;
                    this.isPlaceholder = false;
                    this.photocardGif.isGif = false;
                    this.photocardVideo.isVideo = false;

                    // Remove placeholder-active class
                    this.canvas.classList.remove('placeholder-active');

                    // Reset cursor to grab
                    this.canvas.style.cursor = 'grab';

                    // Center photocard on canvas
                    const rect = this.canvas.getBoundingClientRect();
                    this.photocard.x = rect.width / 2;
                    this.photocard.y = rect.height / 2;
                    this.photocard.scale = Math.min(rect.width, rect.height) / (img.width * 1.5);

                    this.render();
                    resolve();
                };
                img.onerror = reject;
                img.src = e.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Load photocard GIF and parse frames
     */
    async loadPhotocardGif(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const gif = await this.parseGif(arrayBuffer);

                    this.photocardGif.isGif = true;
                    this.photocardGif.frames = gif.frames;
                    this.photocardGif.delays = gif.delays;
                    this.photocardGif.currentFrame = 0;
                    this.photocardGif.lastFrameTime = performance.now();

                    this.photocardImage = gif.frames[0];
                    this.isPlaceholder = false;

                    this.canvas.classList.remove('placeholder-active');
                    this.canvas.style.cursor = 'grab';

                    const rect = this.canvas.getBoundingClientRect();
                    this.photocard.x = rect.width / 2;
                    this.photocard.y = rect.height / 2;
                    this.photocard.scale = Math.min(rect.width, rect.height) / (gif.frames[0].width * 1.5);

                    this.startPhotocardGifAnimation();
                    this.render();
                    resolve();
                } catch (error) {
                    console.error('Error parsing GIF:', error);
                    reject(error);
                }
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Load photocard video
     */
    async loadPhotocardVideo(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.autoplay = false;

            const url = URL.createObjectURL(file);
            let initialized = false;

            video.onloadedmetadata = () => {
                // Store the video element
                this.photocardVideo.isVideo = true;
                this.photocardVideo.element = video;
                this.photocardVideo.originalFile = file;
                this.photocardGif.isGif = false;
                this.isPlaceholder = false;

                // Create an image from the first frame for initial display
                video.currentTime = 0;
            };

            video.onseeked = () => {
                // Only initialize once to avoid resetting on loop
                if (initialized) return;
                initialized = true;

                // Video is ready at first frame
                this.photocardImage = video;

                this.canvas.classList.remove('placeholder-active');
                this.canvas.style.cursor = 'grab';

                const rect = this.canvas.getBoundingClientRect();
                this.photocard.x = rect.width / 2;
                this.photocard.y = rect.height / 2;
                this.photocard.scale = Math.min(rect.width, rect.height) / (video.videoWidth * 1.5);

                // Start video playback and animation
                video.play().then(() => {
                    this.startPhotocardVideoAnimation();
                    this.render();
                    resolve();
                }).catch(reject);
            };

            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video'));
            };

            video.src = url;
        });
    },

    /**
     * Parse GIF file into frames
     */
    async parseGif(arrayBuffer) {
        return new Promise((resolve, reject) => {
            try {
                // Check if gifuct-js is available - try multiple possible export names
                let gifuctLib = null;

                if (typeof window.gifuct !== 'undefined') {
                    gifuctLib = window.gifuct;
                } else if (typeof gifuct !== 'undefined') {
                    gifuctLib = gifuct;
                } else if (typeof window.GifuctJs !== 'undefined') {
                    gifuctLib = window.GifuctJs;
                }

                // If gifuct is available, use it
                if (gifuctLib) {
                    console.log('Parsing GIF with gifuct-js');
                    const gif = gifuctLib.parseGIF(arrayBuffer);
                    const frames = gifuctLib.decompressFrames(gif, true);

                    console.log(`GIF parsed: ${frames.length} frames`);

                    return this.processGifuctFrames(frames, resolve, reject);
                }

                // Fallback to omggif if available
                if (typeof window.GifReader !== 'undefined') {
                    console.log('Parsing GIF with omggif (fallback)');
                    return this.parseGifWithOmggif(arrayBuffer, resolve, reject);
                }

                // No GIF library available
                console.error('GIF parser library not loaded. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('gif')));
                reject(new Error('GIF parser library not loaded. Please reload the page.'));
            } catch (error) {
                console.error('Error parsing GIF:', error);
                reject(error);
            }
        });
    },

    /**
     * Process frames from gifuct-js
     */
    processGifuctFrames(frames, resolve, reject) {
        try {

            if (frames.length === 0) {
                reject(new Error('GIF has no frames'));
                return;
            }

            const imageFrames = [];
            const delays = [];

            // Get GIF dimensions from first frame
            const gifWidth = frames[0].dims.width;
            const gifHeight = frames[0].dims.height;

            // Create a persistent canvas for composition
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;
            const tempCtx = tempCanvas.getContext('2d');

            // Convert each frame to an Image object
            let loadedFrames = 0;

            frames.forEach((frame, index) => {
                // Never clear - accumulate frames to avoid transparency
                // Draw the current frame patch
                const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
                imageData.data.set(frame.patch);
                tempCtx.putImageData(imageData, frame.dims.left, frame.dims.top);

                // Convert to Image
                const img = new Image();
                img.onload = () => {
                    loadedFrames++;
                    if (loadedFrames === frames.length) {
                        console.log('All GIF frames loaded successfully');
                        resolve({ frames: imageFrames, delays });
                    }
                };
                img.onerror = (error) => {
                    console.error('Failed to load GIF frame:', error);
                    reject(new Error(`Failed to load GIF frame ${index}`));
                };

                img.src = tempCanvas.toDataURL('image/png');
                imageFrames[index] = img;
                delays[index] = (frame.delay || 10) * 10;
            });
        } catch (error) {
            reject(error);
        }
    },

    /**
     * Parse GIF using omggif library (fallback)
     */
    parseGifWithOmggif(arrayBuffer, resolve, reject) {
        try {
            const bytes = new Uint8Array(arrayBuffer);
            const reader = new window.GifReader(bytes);

            const imageFrames = [];
            const delays = [];
            const width = reader.width;
            const height = reader.height;

            console.log(`GIF parsed with omggif: ${reader.numFrames()} frames, ${width}x${height}`);

            // Create a persistent canvas for composition
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            let loadedFrames = 0;

            for (let i = 0; i < reader.numFrames(); i++) {
                const frameInfo = reader.frameInfo(i);
                const framePixels = new Uint8ClampedArray(width * height * 4);
                reader.decodeAndBlitFrameRGBA(i, framePixels);

                // Create ImageData and draw to canvas (accumulate, don't clear)
                const imageData = tempCtx.createImageData(width, height);
                imageData.data.set(framePixels);
                tempCtx.putImageData(imageData, 0, 0);

                // Convert to Image
                const img = new Image();
                img.onload = () => {
                    loadedFrames++;
                    if (loadedFrames === reader.numFrames()) {
                        console.log('All GIF frames loaded successfully (omggif)');
                        resolve({ frames: imageFrames, delays });
                    }
                };
                img.onerror = (error) => {
                    console.error('Failed to load GIF frame:', error);
                    reject(new Error(`Failed to load GIF frame ${i}`));
                };

                img.src = tempCanvas.toDataURL('image/png');
                imageFrames[i] = img;
                delays[i] = (frameInfo.delay || 10) * 10;
            }
        } catch (error) {
            console.error('Error parsing GIF with omggif:', error);
            reject(error);
        }
    },

    /**
     * Start photocard GIF animation
     */
    startPhotocardGifAnimation() {
        if (!this.photocardGif.isGif || this.photocardGif.frames.length === 0) return;

        const animate = (currentTime) => {
            if (!this.photocardGif.isGif) return;

            const elapsed = currentTime - this.photocardGif.lastFrameTime;
            const delay = this.photocardGif.delays[this.photocardGif.currentFrame];

            if (elapsed >= delay) {
                this.photocardGif.currentFrame = (this.photocardGif.currentFrame + 1) % this.photocardGif.frames.length;
                this.photocardImage = this.photocardGif.frames[this.photocardGif.currentFrame];
                this.photocardGif.lastFrameTime = currentTime;
                this.render();
            }

            this.photocardGif.animationFrame = requestAnimationFrame(animate);
        };

        this.photocardGif.animationFrame = requestAnimationFrame(animate);
    },

    /**
     * Start background GIF animation
     */
    startBackgroundGifAnimation() {
        if (!this.backgroundGif.isGif || this.backgroundGif.frames.length === 0) return;

        const animate = (currentTime) => {
            if (!this.backgroundGif.isGif) return;

            const elapsed = currentTime - this.backgroundGif.lastFrameTime;
            const delay = this.backgroundGif.delays[this.backgroundGif.currentFrame];

            if (elapsed >= delay) {
                this.backgroundGif.currentFrame = (this.backgroundGif.currentFrame + 1) % this.backgroundGif.frames.length;
                this.backgroundImage = this.backgroundGif.frames[this.backgroundGif.currentFrame];
                this.backgroundGif.lastFrameTime = currentTime;
                this.render();
            }

            this.backgroundGif.animationFrame = requestAnimationFrame(animate);
        };

        this.backgroundGif.animationFrame = requestAnimationFrame(animate);
    },

    /**
     * Stop photocard GIF animation
     */
    stopPhotocardGifAnimation() {
        if (this.photocardGif.animationFrame) {
            cancelAnimationFrame(this.photocardGif.animationFrame);
            this.photocardGif.animationFrame = null;
        }
    },

    /**
     * Stop background GIF animation
     */
    stopBackgroundGifAnimation() {
        if (this.backgroundGif.animationFrame) {
            cancelAnimationFrame(this.backgroundGif.animationFrame);
            this.backgroundGif.animationFrame = null;
        }
    },

    /**
     * Start photocard video animation
     */
    startPhotocardVideoAnimation() {
        if (!this.photocardVideo.isVideo || !this.photocardVideo.element) return;

        const animate = () => {
            if (!this.photocardVideo.isVideo) return;

            this.render();
            this.photocardVideo.animationFrame = requestAnimationFrame(animate);
        };

        this.photocardVideo.animationFrame = requestAnimationFrame(animate);
    },

    /**
     * Stop photocard video animation
     */
    stopPhotocardVideoAnimation() {
        if (this.photocardVideo.animationFrame) {
            cancelAnimationFrame(this.photocardVideo.animationFrame);
            this.photocardVideo.animationFrame = null;
        }
        if (this.photocardVideo.element) {
            this.photocardVideo.element.pause();
        }
    },

    /**
     * Start background video animation
     */
    startBackgroundVideoAnimation() {
        if (!this.backgroundVideo.isVideo || !this.backgroundVideo.element) return;

        const animate = () => {
            if (!this.backgroundVideo.isVideo) return;

            this.render();
            this.backgroundVideo.animationFrame = requestAnimationFrame(animate);
        };

        this.backgroundVideo.animationFrame = requestAnimationFrame(animate);
    },

    /**
     * Stop background video animation
     */
    stopBackgroundVideoAnimation() {
        if (this.backgroundVideo.animationFrame) {
            cancelAnimationFrame(this.backgroundVideo.animationFrame);
            this.backgroundVideo.animationFrame = null;
        }
        if (this.backgroundVideo.element) {
            this.backgroundVideo.element.pause();
        }
    },

    /**
     * Render the canvas
     */
    render() {
        // Use actual canvas dimensions (accounting for DPR scaling applied in resizeCanvas)
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.width / dpr;
        const height = this.canvas.height / dpr;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Draw camera feed if active
        if (this.camera.active && this.camera.video) {
            this.drawCameraFeed();
        }
        // Otherwise draw background image
        else if (this.backgroundImage) {
            this.drawBackground();
        }

        // Draw photocard (layer order)
        if (this.photocardImage) {
            if (this.photocard.layer === 'back') {
                this.drawPhotocard();
            }
        }

        // Draw border
        if (window.BorderManager) {
            window.BorderManager.drawBorder(this.ctx, width, height);
        }

        // Draw photocard on top if layer is front
        if (this.photocardImage && this.photocard.layer === 'front') {
            this.drawPhotocard();
        }

        // Draw crop overlay (after everything else)
        this.drawCropOverlay();
    },

    /**
     * Draw camera feed
     */
    drawCameraFeed() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.width / dpr;
        const height = this.canvas.height / dpr;

        this.ctx.save();

        // Calculate cover sizing for video
        const videoRatio = this.camera.video.videoWidth / this.camera.video.videoHeight;
        const canvasRatio = width / height;

        let baseWidth, baseHeight;

        if (videoRatio > canvasRatio) {
            baseHeight = height;
            baseWidth = height * videoRatio;
        } else {
            baseWidth = width;
            baseHeight = width / videoRatio;
        }

        // Apply transformations (same as background)
        const centerX = width / 2 + this.background.x;
        const centerY = height / 2 + this.background.y;
        this.ctx.translate(centerX, centerY);

        // Rotate
        const rotationRad = (this.background.rotation * Math.PI) / 180;
        this.ctx.rotate(rotationRad);

        // Scale with flip
        const scaleX = this.background.scale * (this.background.flipH ? -1 : 1);
        const scaleY = this.background.scale * (this.background.flipV ? -1 : 1);
        this.ctx.scale(scaleX, scaleY);

        // Draw video centered
        this.ctx.drawImage(
            this.camera.video,
            -baseWidth / 2,
            -baseHeight / 2,
            baseWidth,
            baseHeight
        );

        this.ctx.restore();
    },

    /**
     * Draw background image
     */
    drawBackground() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.width / dpr;
        const height = this.canvas.height / dpr;

        this.ctx.save();

        // Calculate default cover sizing
        // Handle both image and video elements
        const imgWidth = this.backgroundImage.videoWidth || this.backgroundImage.width;
        const imgHeight = this.backgroundImage.videoHeight || this.backgroundImage.height;
        const imgRatio = imgWidth / imgHeight;
        const canvasRatio = width / height;

        let baseWidth, baseHeight;

        if (imgRatio > canvasRatio) {
            baseHeight = height;
            baseWidth = height * imgRatio;
        } else {
            baseWidth = width;
            baseHeight = width / imgRatio;
        }

        // Apply transformations
        // Translate to center of canvas plus offset
        const centerX = width / 2 + this.background.x;
        const centerY = height / 2 + this.background.y;
        this.ctx.translate(centerX, centerY);

        // Rotate
        const rotationRad = (this.background.rotation * Math.PI) / 180;
        this.ctx.rotate(rotationRad);

        // Scale with flip
        const scaleX = this.background.scale * (this.background.flipH ? -1 : 1);
        const scaleY = this.background.scale * (this.background.flipV ? -1 : 1);
        this.ctx.scale(scaleX, scaleY);

        // Draw centered
        this.ctx.drawImage(
            this.backgroundImage,
            -baseWidth / 2,
            -baseHeight / 2,
            baseWidth,
            baseHeight
        );

        this.ctx.restore();
    },

    /**
     * Draw photocard image with transformations
     */
    drawPhotocard() {
        this.ctx.save();

        // Translate to photocard position
        this.ctx.translate(this.photocard.x, this.photocard.y);

        // Rotate
        this.ctx.rotate(this.photocard.rotation);

        // Scale
        const scaleX = this.photocard.scale * (this.photocard.flipH ? -1 : 1);
        const scaleY = this.photocard.scale * (this.photocard.flipV ? -1 : 1);
        this.ctx.scale(scaleX, scaleY);

        // Draw image centered
        // Handle both image and video elements
        const width = this.photocardImage.videoWidth || this.photocardImage.width;
        const height = this.photocardImage.videoHeight || this.photocardImage.height;
        this.ctx.drawImage(this.photocardImage, -width / 2, -height / 2, width, height);

        // Draw toploader overlay if enabled
        if (this.photocard.showToploader) {
            this.drawToploader(width, height);
        }

        this.ctx.restore();
    },

    /**
     * Draw toploader overlay on the photocard
     * Creates a realistic thick plastic sleeve with frame effect
     */
    drawToploader(width, height) {
        // Get configuration values
        const cfg = window.ToploaderConfig || ToploaderConfig;

        // Toploader dimensions - overlaps photocard significantly
        const overlap = cfg.dimensions.sideOverlap;
        const bottomOverlap = cfg.dimensions.bottomOverlap;
        const toploaderWidth = width + (overlap * 2);
        const toploaderHeight = height + overlap + bottomOverlap;

        // Check if dimensions changed - if not, we can reuse cached gradients
        const dimensionsChanged = this.toploaderGradientCache.cachedWidth !== width ||
                                  this.toploaderGradientCache.cachedHeight !== height;

        const x = -(toploaderWidth / 2);
        const y = -(height / 2) - overlap;
        const topCornerRadius = cfg.corners.topRadius;
        const bottomCornerRadius = cfg.corners.bottomRadius;
        const frameThicknessLeft = cfg.frame.leftThickness;
        const frameThicknessRight = cfg.frame.rightThickness;

        this.ctx.save();

        // Clip top to remove artifacts
        this.ctx.beginPath();
        this.ctx.rect(x, y + cfg.clipping.topClip, toploaderWidth, toploaderHeight - cfg.clipping.topClip);
        this.ctx.clip();

        // Helper function to create rounded rectangle path
        const roundedRect = (x, y, w, h, radiusTop, radiusBottom) => {
            this.ctx.beginPath();
            this.ctx.moveTo(x + radiusTop, y);
            this.ctx.lineTo(x + w - radiusTop, y);
            this.ctx.arcTo(x + w, y, x + w, y + radiusTop, radiusTop);
            this.ctx.lineTo(x + w, y + h - radiusBottom);
            this.ctx.arcTo(x + w, y + h, x + w - radiusBottom, y + h, radiusBottom);
            this.ctx.lineTo(x + radiusBottom, y + h);
            this.ctx.arcTo(x, y + h, x, y + h - radiusBottom, radiusBottom);
            this.ctx.lineTo(x, y + radiusTop);
            this.ctx.arcTo(x, y, x + radiusTop, y, radiusTop);
            this.ctx.closePath();
        };

        // Left side white border with reflection gradient
        const topCurveStart = topCornerRadius * cfg.curves.topCurveStartPercent;
        this.ctx.beginPath();
        this.ctx.moveTo(x + topCurveStart, y);
        this.ctx.arcTo(x, y, x, y + topCornerRadius, topCornerRadius);
        this.ctx.lineTo(x, y + toploaderHeight - bottomCornerRadius);
        this.ctx.arcTo(x, y + toploaderHeight, x + bottomCornerRadius, y + toploaderHeight, bottomCornerRadius);
        this.ctx.lineTo(x + frameThicknessLeft + (bottomCornerRadius - frameThicknessLeft), y + toploaderHeight - frameThicknessLeft);
        this.ctx.arcTo(x + frameThicknessLeft, y + toploaderHeight - frameThicknessLeft, x + frameThicknessLeft, y + toploaderHeight - frameThicknessLeft - (bottomCornerRadius - frameThicknessLeft), bottomCornerRadius - frameThicknessLeft);
        this.ctx.lineTo(x + frameThicknessLeft, y + frameThicknessLeft + (topCornerRadius - frameThicknessLeft));
        this.ctx.arcTo(x + frameThicknessLeft, y + frameThicknessLeft, x + frameThicknessLeft + (topCornerRadius - frameThicknessLeft) * cfg.curves.topCurveStartPercent, y + frameThicknessLeft, topCornerRadius - frameThicknessLeft);
        this.ctx.lineTo(x + topCurveStart, y);
        this.ctx.closePath();

        // Create or reuse cached west gradient
        let westGradient;
        if (dimensionsChanged) {
            westGradient = this.ctx.createLinearGradient(x, y, x + frameThicknessLeft * cfg.borders.west.widthMultiplier * cfg.borders.west.scaleFactor, y);
            westGradient.addColorStop(0, `rgba(255, 255, 255, ${cfg.borders.west.startOpacity})`);
            westGradient.addColorStop(1, `rgba(255, 255, 255, ${cfg.borders.west.endOpacity})`);
            this.toploaderGradientCache.westGradient = westGradient;
        } else {
            westGradient = this.toploaderGradientCache.westGradient;
        }
        this.ctx.fillStyle = westGradient;
        this.ctx.fill();

        // Right side white border with reflection gradient
        const topCurveEnd = toploaderWidth - topCornerRadius * cfg.curves.topCurveStartPercent;
        this.ctx.beginPath();
        this.ctx.moveTo(x + topCurveEnd, y);
        this.ctx.arcTo(x + toploaderWidth, y, x + toploaderWidth, y + topCornerRadius, topCornerRadius);
        this.ctx.lineTo(x + toploaderWidth, y + toploaderHeight - bottomCornerRadius);
        this.ctx.arcTo(x + toploaderWidth, y + toploaderHeight, x + toploaderWidth - bottomCornerRadius, y + toploaderHeight, bottomCornerRadius);
        this.ctx.lineTo(x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor - (bottomCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor), y + toploaderHeight - frameThicknessRight * cfg.borders.east.scaleFactor);
        this.ctx.arcTo(x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor, y + toploaderHeight - frameThicknessRight * cfg.borders.east.scaleFactor, x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor, y + toploaderHeight - frameThicknessRight * cfg.borders.east.scaleFactor - (bottomCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor), bottomCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor);
        this.ctx.lineTo(x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor, y + frameThicknessRight * cfg.borders.east.scaleFactor + (topCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor));
        this.ctx.arcTo(x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor, y + frameThicknessRight * cfg.borders.east.scaleFactor, x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor - (topCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor) * cfg.curves.topCurveStartPercent, y + frameThicknessRight * cfg.borders.east.scaleFactor, topCornerRadius - frameThicknessRight * cfg.borders.east.scaleFactor);
        this.ctx.lineTo(x + topCurveEnd, y);
        this.ctx.closePath();

        // Create or reuse cached east gradient
        let eastGradient;
        if (dimensionsChanged) {
            eastGradient = this.ctx.createLinearGradient(x + toploaderWidth, y, x + toploaderWidth - frameThicknessRight * cfg.borders.east.widthMultiplier * cfg.borders.east.scaleFactor, y);
            eastGradient.addColorStop(0, `rgba(255, 255, 255, ${cfg.borders.east.startOpacity})`);
            eastGradient.addColorStop(1, `rgba(255, 255, 255, ${cfg.borders.east.endOpacity})`);
            this.toploaderGradientCache.eastGradient = eastGradient;
        } else {
            eastGradient = this.toploaderGradientCache.eastGradient;
        }
        this.ctx.fillStyle = eastGradient;
        this.ctx.fill();

        // Bottom edge with subtle shadow gradient
        const southBorderStart = x + bottomCornerRadius;
        const southBorderEnd = x + toploaderWidth - bottomCornerRadius;
        const frameThicknessBottom = frameThicknessLeft;

        this.ctx.beginPath();
        this.ctx.moveTo(southBorderStart, y + toploaderHeight);
        this.ctx.lineTo(southBorderEnd, y + toploaderHeight);
        this.ctx.lineTo(southBorderEnd, y + toploaderHeight - frameThicknessBottom);
        this.ctx.lineTo(southBorderStart, y + toploaderHeight - frameThicknessBottom);
        this.ctx.closePath();

        // Create or reuse cached south gradient
        let southGradient;
        if (dimensionsChanged) {
            southGradient = this.ctx.createLinearGradient(southBorderStart, y + toploaderHeight, southBorderEnd, y + toploaderHeight);
            southGradient.addColorStop(0, `rgba(255, 255, 255, ${cfg.borders.south.edgeOpacity})`);
            southGradient.addColorStop(0.5, `rgba(255, 255, 255, ${cfg.borders.south.centerOpacity})`);
            southGradient.addColorStop(1, `rgba(255, 255, 255, ${cfg.borders.south.edgeOpacity})`);
            this.toploaderGradientCache.southGradient = southGradient;
        } else {
            southGradient = this.toploaderGradientCache.southGradient;
        }
        this.ctx.fillStyle = southGradient;
        this.ctx.fill();

        // Semi-transparent base overlay for plastic effect
        roundedRect(x, y, toploaderWidth, toploaderHeight, topCornerRadius, bottomCornerRadius);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${cfg.overlay.baseOpacity})`;
        this.ctx.fill();

        // Inner viewing area with subtle plastic tint
        const innerX = x + frameThicknessLeft;
        const innerY = y + frameThicknessLeft;
        const innerWidth = toploaderWidth - frameThicknessLeft - frameThicknessRight;
        const innerHeight = toploaderHeight - frameThicknessLeft - frameThicknessBottom;

        roundedRect(innerX, innerY, innerWidth, innerHeight, topCornerRadius - frameThicknessLeft, bottomCornerRadius - frameThicknessLeft);
        this.ctx.fillStyle = `rgba(${cfg.overlay.innerTint.red}, ${cfg.overlay.innerTint.green}, ${cfg.overlay.innerTint.blue}, ${cfg.overlay.innerTint.opacity})`;
        this.ctx.fill();

        // Subtle inner edge definition
        this.ctx.strokeStyle = `rgba(${cfg.overlay.innerEdge.red}, ${cfg.overlay.innerEdge.green}, ${cfg.overlay.innerEdge.blue}, ${cfg.overlay.innerEdge.opacity})`;
        this.ctx.lineWidth = cfg.overlay.innerEdge.lineWidth;
        this.ctx.stroke();

        // Top glossy highlight (subtle reflection from light source)
        const topHighlightGradient = this.ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerHeight * cfg.highlights.top.heightPercent);
        topHighlightGradient.addColorStop(0, `rgba(255, 255, 255, ${cfg.highlights.top.startOpacity})`);
        topHighlightGradient.addColorStop(0.2, `rgba(255, 255, 255, ${cfg.highlights.top.middleOpacity})`);
        topHighlightGradient.addColorStop(1, `rgba(255, 255, 255, ${cfg.highlights.top.endOpacity})`);

        roundedRect(innerX, innerY, innerWidth, innerHeight * cfg.highlights.top.heightPercent, topCornerRadius - frameThicknessLeft, 0);
        this.ctx.fillStyle = topHighlightGradient;
        this.ctx.fill();

        // Inner shadow gradients for 3D depth effect - connecting at corners
        // Shadow spreads all the way to photocard border
        const photocardLeftEdge = overlap; // Distance from toploader edge to photocard edge
        const photocardBottomEdge = bottomOverlap; // Distance from toploader bottom to photocard bottom

        const leftShadowWidth = photocardLeftEdge - frameThicknessLeft;
        const rightShadowWidth = photocardLeftEdge - frameThicknessRight;
        const bottomShadowHeight = photocardBottomEdge - frameThicknessBottom;
        const topShadowHeight = photocardLeftEdge - frameThicknessLeft;
        const rightInset = cfg.frame.rightInset;

        // Shadow corner radius to match border curvature - matches inner edge of white border
        const shadowTopCornerRadius = topCornerRadius - frameThicknessLeft;
        const shadowBottomCornerRadius = bottomCornerRadius - frameThicknessLeft;

        // Helper to create rounded rectangle path
        const createRoundedShadowPath = (shadowX, shadowY, shadowW, shadowH, radiusTopLeft, radiusTopRight, radiusBottomLeft, radiusBottomRight) => {
            this.ctx.beginPath();
            this.ctx.moveTo(shadowX + radiusTopLeft, shadowY);
            this.ctx.lineTo(shadowX + shadowW - radiusTopRight, shadowY);
            if (radiusTopRight > 0) {
                this.ctx.arcTo(shadowX + shadowW, shadowY, shadowX + shadowW, shadowY + radiusTopRight, radiusTopRight);
            }
            this.ctx.lineTo(shadowX + shadowW, shadowY + shadowH - radiusBottomRight);
            if (radiusBottomRight > 0) {
                this.ctx.arcTo(shadowX + shadowW, shadowY + shadowH, shadowX + shadowW - radiusBottomRight, shadowY + shadowH, radiusBottomRight);
            }
            this.ctx.lineTo(shadowX + radiusBottomLeft, shadowY + shadowH);
            if (radiusBottomLeft > 0) {
                this.ctx.arcTo(shadowX, shadowY + shadowH, shadowX, shadowY + shadowH - radiusBottomLeft, radiusBottomLeft);
            }
            this.ctx.lineTo(shadowX, shadowY + radiusTopLeft);
            if (radiusTopLeft > 0) {
                this.ctx.arcTo(shadowX, shadowY, shadowX + radiusTopLeft, shadowY, radiusTopLeft);
            }
            this.ctx.closePath();
        };

        // Top inner shadow gradient (North) - full width including corners
        const topShadowGradient = this.ctx.createLinearGradient(
            x,
            y + frameThicknessLeft,
            x,
            y + frameThicknessLeft + topShadowHeight
        );
        topShadowGradient.addColorStop(0, `rgba(0, 0, 0, ${cfg.shadows.north.startOpacity})`);
        topShadowGradient.addColorStop(1, `rgba(0, 0, 0, ${cfg.shadows.north.endOpacity})`);

        this.ctx.fillStyle = topShadowGradient;
        createRoundedShadowPath(
            x + frameThicknessLeft,
            y + frameThicknessLeft,
            toploaderWidth - frameThicknessLeft - frameThicknessRight,
            topShadowHeight,
            shadowTopCornerRadius, shadowTopCornerRadius, 0, 0
        );
        this.ctx.fill();

        // Left inner shadow gradient (West) - full height including corners
        const leftShadowGradient = this.ctx.createLinearGradient(
            x + frameThicknessLeft,
            y,
            x + frameThicknessLeft + leftShadowWidth,
            y
        );
        leftShadowGradient.addColorStop(0, `rgba(0, 0, 0, ${cfg.shadows.west.startOpacity})`);
        leftShadowGradient.addColorStop(1, `rgba(0, 0, 0, ${cfg.shadows.west.endOpacity})`);

        this.ctx.fillStyle = leftShadowGradient;
        createRoundedShadowPath(
            x + frameThicknessLeft,
            y + frameThicknessLeft,
            leftShadowWidth,
            toploaderHeight - frameThicknessLeft - frameThicknessBottom,
            shadowTopCornerRadius, 0, shadowBottomCornerRadius, 0
        );
        this.ctx.fill();

        // Right inner shadow gradient (East) - full height including corners
        const rightShadowGradient = this.ctx.createLinearGradient(
            x + toploaderWidth - frameThicknessRight - rightInset,
            y,
            x + toploaderWidth - frameThicknessRight - rightShadowWidth - rightInset,
            y
        );
        rightShadowGradient.addColorStop(0, `rgba(0, 0, 0, ${cfg.shadows.east.startOpacity})`);
        rightShadowGradient.addColorStop(1, `rgba(0, 0, 0, ${cfg.shadows.east.endOpacity})`);

        this.ctx.fillStyle = rightShadowGradient;
        createRoundedShadowPath(
            x + toploaderWidth - frameThicknessRight - rightShadowWidth - rightInset,
            y + frameThicknessLeft,
            rightShadowWidth,
            toploaderHeight - frameThicknessLeft - frameThicknessBottom,
            0, shadowTopCornerRadius, 0, shadowBottomCornerRadius
        );
        this.ctx.fill();

        // Bottom inner shadow gradient (South) - full width including corners
        const bottomShadowGradient = this.ctx.createLinearGradient(
            x,
            y + toploaderHeight - frameThicknessBottom - bottomShadowHeight,
            x,
            y + toploaderHeight - frameThicknessBottom
        );
        bottomShadowGradient.addColorStop(0, `rgba(0, 0, 0, ${cfg.shadows.south.startOpacity})`);
        bottomShadowGradient.addColorStop(1, `rgba(0, 0, 0, ${cfg.shadows.south.endOpacity})`);

        this.ctx.fillStyle = bottomShadowGradient;
        createRoundedShadowPath(
            x + frameThicknessLeft,
            y + toploaderHeight - frameThicknessBottom - bottomShadowHeight,
            toploaderWidth - frameThicknessLeft - frameThicknessRight,
            bottomShadowHeight,
            0, 0, shadowBottomCornerRadius, shadowBottomCornerRadius
        );
        this.ctx.fill();

        // Third internal shading line - follows white border width for West, East, and South
        // This creates a connected border-following highlight with varying widths per side
        this.ctx.strokeStyle = `rgba(${cfg.shadingLine.red}, ${cfg.shadingLine.green}, ${cfg.shadingLine.blue}, ${cfg.shadingLine.opacity})`;

        // Define position variables
        const thirdLineLeftX = x + frameThicknessLeft;
        const thirdLineRightX = x + toploaderWidth - frameThicknessRight * cfg.borders.east.scaleFactor;
        const thirdLineTopY = y + frameThicknessLeft;
        const thirdLineBottomY = y + toploaderHeight - frameThicknessBottom;

        // Left edge (West) - with left border width reduced by widthReduction factor
        this.ctx.lineWidth = frameThicknessLeft * cfg.shadingLine.widthReduction;
        this.ctx.beginPath();
        this.ctx.moveTo(thirdLineLeftX, thirdLineTopY + shadowTopCornerRadius);
        this.ctx.lineTo(thirdLineLeftX, thirdLineBottomY - shadowBottomCornerRadius);
        this.ctx.stroke();

        // Bottom edge (South) - with bottom border width reduced by widthReduction factor
        this.ctx.lineWidth = frameThicknessBottom * cfg.shadingLine.widthReduction;
        this.ctx.beginPath();
        this.ctx.moveTo(thirdLineLeftX + shadowBottomCornerRadius, thirdLineBottomY);
        this.ctx.lineTo(thirdLineRightX - shadowBottomCornerRadius, thirdLineBottomY);
        this.ctx.stroke();

        // Right edge (East) - with right border width reduced by widthReduction factor
        this.ctx.lineWidth = frameThicknessRight * cfg.borders.east.scaleFactor * cfg.shadingLine.widthReduction;
        this.ctx.beginPath();
        this.ctx.moveTo(thirdLineRightX, thirdLineTopY + shadowTopCornerRadius);
        this.ctx.lineTo(thirdLineRightX, thirdLineBottomY - shadowBottomCornerRadius);
        this.ctx.stroke();

        // Corner arcs - reduced by widthReduction factor
        this.ctx.lineWidth = frameThicknessLeft * cfg.shadingLine.widthReduction; // Use left thickness for corners

        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.arc(
            thirdLineLeftX + shadowBottomCornerRadius,
            thirdLineBottomY - shadowBottomCornerRadius,
            shadowBottomCornerRadius,
            Math.PI / 2,
            Math.PI
        );
        this.ctx.stroke();

        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.arc(
            thirdLineRightX - shadowBottomCornerRadius,
            thirdLineBottomY - shadowBottomCornerRadius,
            shadowBottomCornerRadius,
            0,
            Math.PI / 2
        );
        this.ctx.stroke();

        // Top-left corner
        this.ctx.beginPath();
        this.ctx.arc(
            thirdLineLeftX + shadowTopCornerRadius,
            thirdLineTopY + shadowTopCornerRadius,
            shadowTopCornerRadius,
            Math.PI,
            Math.PI * 1.5
        );
        this.ctx.stroke();

        // Top-right corner
        this.ctx.beginPath();
        this.ctx.arc(
            thirdLineRightX - shadowTopCornerRadius,
            thirdLineTopY + shadowTopCornerRadius,
            shadowTopCornerRadius,
            Math.PI * 1.5,
            0
        );
        this.ctx.stroke();

        this.ctx.restore();

        // Update cache with current dimensions
        this.toploaderGradientCache.cachedWidth = width;
        this.toploaderGradientCache.cachedHeight = height;
    },

    /**
     * Background transform operations
     */
    updateBackground(property, value) {
        if (!this.backgroundImage) return;
        this.background[property] = value;
        this.render();
    },

    flipBackgroundHorizontal() {
        if (!this.backgroundImage) return;
        this.background.flipH = !this.background.flipH;
        this.render();
    },

    flipBackgroundVertical() {
        if (!this.backgroundImage) return;
        this.background.flipV = !this.background.flipV;
        this.render();
    },

    resetBackground() {
        if (!this.backgroundImage) return;
        this.background = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            flipH: false,
            flipV: false
        };
        this.render();
    },

    /**
     * Photocard transform operations
     */
    updatePhotocard(property, value) {
        if (!this.photocardImage) return;
        this.photocard[property] = value;
        this.render();
    },

    flipPhotocardHorizontal() {
        if (!this.photocardImage) return;
        this.photocard.flipH = !this.photocard.flipH;
        this.render();
    },

    flipPhotocardVertical() {
        if (!this.photocardImage) return;
        this.photocard.flipV = !this.photocard.flipV;
        this.render();
    },

    resetPhotocard() {
        if (!this.photocardImage) return;
        const rect = this.canvas.getBoundingClientRect();
        const imgWidth = this.photocardImage.videoWidth || this.photocardImage.width;
        this.photocard = {
            x: rect.width / 2,
            y: rect.height / 2,
            scale: Math.min(rect.width, rect.height) / (imgWidth * 1.5),
            rotation: 0,
            flipH: false,
            flipV: false,
            layer: this.photocard.layer,
            showToploader: this.photocard.showToploader
        };

        // If photocard is a video, ensure it's playing
        if (this.photocardVideo.isVideo && this.photocardVideo.element) {
            this.photocardVideo.element.play().catch(err => {
                console.warn('Could not resume video playback:', err);
            });
        }

        this.render();
    },

    bringToFront() {
        if (!this.photocardImage) return;
        this.photocard.layer = 'front';
        this.render();
    },

    sendToBack() {
        if (!this.photocardImage) return;
        this.photocard.layer = 'back';
        this.render();
    },

    /**
     * Toggle toploader visibility
     */
    toggleToploader(show) {
        this.photocard.showToploader = show;
        this.render();
    },

    /**
     * Set edit mode (background or photocard)
     */
    setEditMode(mode) {
        if (mode !== 'background' && mode !== 'photocard') {
            console.warn('Invalid edit mode:', mode);
            return;
        }
        this.editMode = mode;
        console.log('Edit mode set to:', mode);
    },

    /**
     * Calculate crop bounds for the given aspect ratio
     * @param {string} ratio - '4:3', '9:16', '1:1', or null
     */
    calculateCropBounds(ratio) {
        if (!ratio) {
            this.crop.enabled = false;
            this.crop.aspectRatio = null;
            this.render();
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = this.canvas.width / dpr;
        const canvasHeight = this.canvas.height / dpr;

        let cropWidth, cropHeight;

        switch (ratio) {
            case '4:3':
                // Landscape - wider than tall
                if (canvasWidth / canvasHeight > 4/3) {
                    cropHeight = canvasHeight;
                    cropWidth = cropHeight * (4/3);
                } else {
                    cropWidth = canvasWidth;
                    cropHeight = cropWidth * (3/4);
                }
                break;
            case '9:16':
                // Portrait - taller than wide
                if (canvasHeight / canvasWidth > 16/9) {
                    cropWidth = canvasWidth;
                    cropHeight = cropWidth * (16/9);
                } else {
                    cropHeight = canvasHeight;
                    cropWidth = cropHeight * (9/16);
                }
                break;
            case '1:1':
                // Square
                cropWidth = cropHeight = Math.min(canvasWidth, canvasHeight);
                break;
            default:
                this.crop.enabled = false;
                this.crop.aspectRatio = null;
                this.render();
                return;
        }

        // Center the crop area
        this.crop.enabled = true;
        this.crop.aspectRatio = ratio;
        this.crop.bounds = {
            x: (canvasWidth - cropWidth) / 2,
            y: (canvasHeight - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight
        };

        this.render();
    },

    /**
     * Draw crop overlay showing areas that will be cropped out
     */
    drawCropOverlay() {
        if (!this.crop.enabled) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.width / dpr;
        const height = this.canvas.height / dpr;
        const { x, y, width: cropW, height: cropH } = this.crop.bounds;

        this.ctx.save();

        // Draw semi-transparent overlay on cropped-out areas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

        // Top area
        if (y > 0) {
            this.ctx.fillRect(0, 0, width, y);
        }
        // Bottom area
        if (y + cropH < height) {
            this.ctx.fillRect(0, y + cropH, width, height - y - cropH);
        }
        // Left area
        if (x > 0) {
            this.ctx.fillRect(0, y, x, cropH);
        }
        // Right area
        if (x + cropW < width) {
            this.ctx.fillRect(x + cropW, y, width - x - cropW, cropH);
        }

        // Draw crop boundary
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, cropW, cropH);

        // Draw corner markers for visual clarity
        const markerLength = Math.min(20, cropW / 5, cropH / 5);
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = 'rgba(199, 182, 249, 1)'; // Primary color

        // Top-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + markerLength);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + markerLength, y);
        this.ctx.stroke();

        // Top-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x + cropW - markerLength, y);
        this.ctx.lineTo(x + cropW, y);
        this.ctx.lineTo(x + cropW, y + markerLength);
        this.ctx.stroke();

        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + cropH - markerLength);
        this.ctx.lineTo(x, y + cropH);
        this.ctx.lineTo(x + markerLength, y + cropH);
        this.ctx.stroke();

        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(x + cropW - markerLength, y + cropH);
        this.ctx.lineTo(x + cropW, y + cropH);
        this.ctx.lineTo(x + cropW, y + cropH - markerLength);
        this.ctx.stroke();

        this.ctx.restore();
    },

    // Legacy methods for backward compatibility
    flipHorizontal() {
        this.flipPhotocardHorizontal();
    },

    flipVertical() {
        this.flipPhotocardVertical();
    },

    rotateLeft() {
        if (!this.photocardImage) return;
        this.photocard.rotation -= Math.PI / 2;
        this.render();
    },

    rotateRight() {
        if (!this.photocardImage) return;
        this.photocard.rotation += Math.PI / 2;
        this.render();
    },

    /**
     * Reset canvas
     */
    reset() {
        // Stop any GIF animations
        this.stopPhotocardGifAnimation();
        this.stopBackgroundGifAnimation();

        // Stop any video animations
        this.stopPhotocardVideoAnimation();
        this.stopBackgroundVideoAnimation();

        this.backgroundImage = null;
        this.photocardImage = null;
        this.isPlaceholder = false;

        // Reset GIF states
        this.photocardGif = {
            isGif: false,
            frames: [],
            delays: [],
            currentFrame: 0,
            lastFrameTime: 0,
            animationFrame: null
        };

        this.backgroundGif = {
            isGif: false,
            frames: [],
            delays: [],
            currentFrame: 0,
            lastFrameTime: 0,
            animationFrame: null
        };

        // Reset video states
        if (this.photocardVideo.element) {
            const url = this.photocardVideo.element.src;
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
        if (this.backgroundVideo.element) {
            const url = this.backgroundVideo.element.src;
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
        this.photocardVideo = {
            isVideo: false,
            element: null,
            originalFile: null,
            animationFrame: null
        };

        this.backgroundVideo = {
            isVideo: false,
            element: null,
            originalFile: null,
            animationFrame: null
        };

        this.background = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            flipH: false,
            flipV: false
        };
        this.photocard = {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            flipH: false,
            flipV: false,
            layer: 'front',
            showToploader: true
        };

        // Reload placeholder photocard
        this.loadPlaceholderPhotocard();
    },

    /**
     * Export canvas as image (PNG or GIF)
     */
    exportImage(asGif = false) {
        // Check if we should export as GIF
        const hasGif = this.photocardGif.isGif || this.backgroundGif.isGif;

        if (asGif && hasGif) {
            return this.exportAsGif();
        }

        return new Promise((resolve, reject) => {
            try {
                const dpr = window.devicePixelRatio || 1;
                let exportWidth, exportHeight;
                let sourceX = 0, sourceY = 0, sourceW, sourceH;

                // Apply crop if enabled
                if (this.crop.enabled) {
                    sourceX = this.crop.bounds.x * dpr;
                    sourceY = this.crop.bounds.y * dpr;
                    sourceW = this.crop.bounds.width * dpr;
                    sourceH = this.crop.bounds.height * dpr;
                    exportWidth = sourceW;
                    exportHeight = sourceH;
                } else {
                    sourceW = this.canvas.width;
                    sourceH = this.canvas.height;
                    exportWidth = this.canvas.width;
                    exportHeight = this.canvas.height;
                }

                // Create a temporary canvas for export
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = exportWidth;
                exportCanvas.height = exportHeight;

                const exportCtx = exportCanvas.getContext('2d');

                // Draw cropped region from current canvas
                exportCtx.drawImage(
                    this.canvas,
                    sourceX, sourceY, sourceW, sourceH,
                    0, 0, exportWidth, exportHeight
                );

                // Convert to blob
                exportCanvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to export canvas'));
                    }
                }, 'image/png');
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Export canvas as animated GIF
     */
    async exportAsGif() {
        try {
            // Check if gif.js is available
            if (typeof GIF === 'undefined') {
                throw new Error('GIF encoder library not loaded');
            }

            // Determine the number of frames to export
            const photocardFrameCount = this.photocardGif.isGif ? this.photocardGif.frames.length : 1;
            const backgroundFrameCount = this.backgroundGif.isGif ? this.backgroundGif.frames.length : 1;
            const totalFrames = Math.max(photocardFrameCount, backgroundFrameCount);

            // Create GIF encoder with crop support
            const dpr = window.devicePixelRatio || 1;
            let width, height;
            if (this.crop.enabled) {
                width = this.crop.bounds.width;
                height = this.crop.bounds.height;
            } else {
                width = this.canvas.width / dpr;
                height = this.canvas.height / dpr;
            }

            // Create inline worker to avoid CORS issues
            let workerScriptUrl;
            try {
                // Fetch the worker script and create a blob URL
                const workerResponse = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
                const workerBlob = await workerResponse.blob();
                workerScriptUrl = URL.createObjectURL(workerBlob);
            } catch (error) {
                console.warn('Failed to load worker script, falling back to no workers:', error);
                workerScriptUrl = undefined;
            }

            const gif = new GIF({
                workers: workerScriptUrl ? 2 : 0, // Use workers if available
                quality: 10,
                width: width,
                height: height,
                workerScript: workerScriptUrl
            });

            console.log(`Exporting GIF with ${totalFrames} frames...`);

            // Render each frame
            for (let i = 0; i < totalFrames; i++) {
                if (i % 10 === 0) {
                    console.log(`Processing frame ${i + 1}/${totalFrames}...`);
                }
                // Update images to the correct frame
                if (this.photocardGif.isGif) {
                    this.photocardImage = this.photocardGif.frames[i % photocardFrameCount];
                }
                if (this.backgroundGif.isGif) {
                    this.backgroundImage = this.backgroundGif.frames[i % backgroundFrameCount];
                }

                // Render the frame
                this.render();

                // Calculate delay (use the longer delay if both are animated)
                let delay = 100; // Default delay
                if (this.photocardGif.isGif && this.backgroundGif.isGif) {
                    const photocardDelay = this.photocardGif.delays[i % photocardFrameCount];
                    const backgroundDelay = this.backgroundGif.delays[i % backgroundFrameCount];
                    delay = Math.max(photocardDelay, backgroundDelay);
                } else if (this.photocardGif.isGif) {
                    delay = this.photocardGif.delays[i % photocardFrameCount];
                } else if (this.backgroundGif.isGif) {
                    delay = this.backgroundGif.delays[i % backgroundFrameCount];
                }

                // Add frame to GIF (with crop support)
                if (this.crop.enabled) {
                    // Create a temporary canvas for the cropped frame
                    const frameCanvas = document.createElement('canvas');
                    frameCanvas.width = this.crop.bounds.width * dpr;
                    frameCanvas.height = this.crop.bounds.height * dpr;
                    const frameCtx = frameCanvas.getContext('2d');
                    frameCtx.drawImage(
                        this.canvas,
                        this.crop.bounds.x * dpr, this.crop.bounds.y * dpr,
                        this.crop.bounds.width * dpr, this.crop.bounds.height * dpr,
                        0, 0, frameCanvas.width, frameCanvas.height
                    );
                    gif.addFrame(frameCanvas, { copy: true, delay: delay });
                } else {
                    gif.addFrame(this.canvas, { copy: true, delay: delay });
                }
            }

            // Generate GIF and return as a promise
            return new Promise((resolve, reject) => {
                gif.on('finished', (blob) => {
                    console.log('GIF encoding complete!');
                    // Clean up worker script URL if it was created
                    if (workerScriptUrl) {
                        URL.revokeObjectURL(workerScriptUrl);
                    }
                    resolve(blob);
                });

                gif.on('error', (error) => {
                    console.error('GIF encoding error:', error);
                    // Clean up worker script URL if it was created
                    if (workerScriptUrl) {
                        URL.revokeObjectURL(workerScriptUrl);
                    }
                    reject(error);
                });

                gif.on('progress', (progress) => {
                    console.log(`GIF encoding progress: ${Math.round(progress * 100)}%`);
                });

                console.log('Starting GIF encoding...');
                gif.render();
            });
        } catch (error) {
            throw error;
        }
    },

    /**
     * Check if current composition has GIF animation
     */
    hasGifAnimation() {
        return this.photocardGif.isGif || this.backgroundGif.isGif;
    },

    /**
     * Check if current composition has video
     */
    hasVideo() {
        return this.photocardVideo.isVideo || this.backgroundVideo.isVideo;
    },

    /**
     * Export canvas as video
     */
    async exportAsVideo(duration = null) {
        try {
            // If no duration specified, use video duration or default to 10 seconds
            if (!duration) {
                if (this.photocardVideo.isVideo && this.photocardVideo.element) {
                    duration = this.photocardVideo.element.duration;
                } else if (this.backgroundVideo.isVideo && this.backgroundVideo.element) {
                    duration = this.backgroundVideo.element.duration;
                } else {
                    duration = 10; // Default 10 seconds
                }
            }

            // Determine export dimensions - use original video resolution
            let exportWidth, exportHeight;
            if (this.photocardVideo.isVideo && this.photocardVideo.element) {
                exportWidth = this.photocardVideo.element.videoWidth;
                exportHeight = this.photocardVideo.element.videoHeight;
            } else if (this.backgroundVideo.isVideo && this.backgroundVideo.element) {
                exportWidth = this.backgroundVideo.element.videoWidth;
                exportHeight = this.backgroundVideo.element.videoHeight;
            } else {
                // Fallback to canvas dimensions
                exportWidth = this.canvas.width;
                exportHeight = this.canvas.height;
            }

            // Create export canvas at original resolution
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = exportWidth;
            exportCanvas.height = exportHeight;
            const exportCtx = exportCanvas.getContext('2d');
            exportCtx.imageSmoothingEnabled = true;
            exportCtx.imageSmoothingQuality = 'high';

            // Create a canvas stream from export canvas
            const stream = exportCanvas.captureStream(30); // 30 fps

            // Check for supported mime types - prioritize mp4 for better compatibility
            const mimeTypes = [
                { type: 'video/mp4', ext: 'mp4' },
                { type: 'video/mp4;codecs=h264', ext: 'mp4' },
                { type: 'video/webm;codecs=h264', ext: 'mp4' },
                { type: 'video/webm;codecs=vp9', ext: 'webm' },
                { type: 'video/webm;codecs=vp8', ext: 'webm' },
                { type: 'video/webm', ext: 'webm' }
            ];

            let selectedFormat = { type: 'video/webm', ext: 'webm' };
            for (const format of mimeTypes) {
                if (MediaRecorder.isTypeSupported(format.type)) {
                    selectedFormat = format;
                    console.log('Using mime type:', format.type);
                    break;
                }
            }

            // No bitrate limit - use default quality for original resolution
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedFormat.type
            });

            const chunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            // Store original canvas dimensions and context state
            const originalWidth = this.canvas.width;
            const originalHeight = this.canvas.height;
            const dpr = window.devicePixelRatio || 1;

            // Animation loop to render frames to export canvas
            let animationId;
            const renderExportFrame = () => {
                // Clear export canvas
                exportCtx.clearRect(0, 0, exportWidth, exportHeight);

                // Draw background
                if (this.backgroundImage) {
                    const imgWidth = this.backgroundImage.videoWidth || this.backgroundImage.width;
                    const imgHeight = this.backgroundImage.videoHeight || this.backgroundImage.height;
                    const imgRatio = imgWidth / imgHeight;
                    const canvasRatio = exportWidth / exportHeight;

                    let drawWidth, drawHeight, drawX, drawY;
                    if (imgRatio > canvasRatio) {
                        drawHeight = exportHeight;
                        drawWidth = drawHeight * imgRatio;
                        drawX = (exportWidth - drawWidth) / 2;
                        drawY = 0;
                    } else {
                        drawWidth = exportWidth;
                        drawHeight = drawWidth / imgRatio;
                        drawX = 0;
                        drawY = (exportHeight - drawHeight) / 2;
                    }
                    exportCtx.drawImage(this.backgroundImage, drawX, drawY, drawWidth, drawHeight);
                } else {
                    exportCtx.fillStyle = this.backgroundColor;
                    exportCtx.fillRect(0, 0, exportWidth, exportHeight);
                }

                // Draw photocard if exists
                if (this.photocardImage) {
                    const pcWidth = this.photocardImage.videoWidth || this.photocardImage.width;
                    const pcHeight = this.photocardImage.videoHeight || this.photocardImage.height;

                    // Scale photocard position and size relative to export dimensions
                    const scaleX = exportWidth / (originalWidth / dpr);
                    const scaleY = exportHeight / (originalHeight / dpr);
                    const scale = Math.min(scaleX, scaleY);

                    const scaledPcScale = this.photocard.scale * scale;
                    const scaledWidth = pcWidth * scaledPcScale;
                    const scaledHeight = pcHeight * scaledPcScale;
                    const scaledX = this.photocard.x * scaleX;
                    const scaledY = this.photocard.y * scaleY;

                    exportCtx.save();
                    exportCtx.translate(scaledX, scaledY);
                    exportCtx.rotate(this.photocard.rotation);

                    // Apply border radius if set
                    if (this.photocard.borderRadius > 0) {
                        const radius = this.photocard.borderRadius * scale;
                        exportCtx.beginPath();
                        exportCtx.roundRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight, radius);
                        exportCtx.clip();
                    }

                    exportCtx.drawImage(this.photocardImage, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
                    exportCtx.restore();

                    // Draw toploader if enabled (outside the border radius clip)
                    if (this.photocard.showToploader) {
                        const originalCtx = this.ctx;
                        this.ctx = exportCtx;

                        exportCtx.save();
                        exportCtx.translate(scaledX, scaledY);
                        exportCtx.rotate(this.photocard.rotation);

                        // Apply scale (including flip) to match regular rendering
                        const flipH = this.photocard.flipH ? -1 : 1;
                        const flipV = this.photocard.flipV ? -1 : 1;
                        exportCtx.scale(scaledPcScale * flipH, scaledPcScale * flipV);

                        this.drawToploader(pcWidth, pcHeight);

                        exportCtx.restore();
                        this.ctx = originalCtx;
                    }
                }

                animationId = requestAnimationFrame(renderExportFrame);
            };

            return new Promise((resolve, reject) => {
                mediaRecorder.onstop = () => {
                    // Stop animation loop
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }

                    const blob = new Blob(chunks, { type: selectedFormat.type });
                    console.log(`Video encoding complete! Resolution: ${exportWidth}x${exportHeight}`);
                    resolve({
                        blob: blob,
                        mimeType: selectedFormat.type,
                        extension: selectedFormat.ext
                    });
                };

                mediaRecorder.onerror = (error) => {
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }
                    console.error('MediaRecorder error:', error);
                    reject(error);
                };

                // Start animation loop
                renderExportFrame();

                // Start recording
                mediaRecorder.start();
                console.log(`Recording video at ${exportWidth}x${exportHeight} for ${duration} seconds...`);

                // Stop after duration
                setTimeout(() => {
                    mediaRecorder.stop();
                    // Stop all tracks in the stream
                    stream.getTracks().forEach(track => track.stop());
                }, duration * 1000);
            });
        } catch (error) {
            console.error('Error exporting video:', error);
            throw error;
        }
    },

    /**
     * Get canvas data URL
     */
    getDataURL() {
        return this.canvas.toDataURL('image/png');
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanvasManager;
}
