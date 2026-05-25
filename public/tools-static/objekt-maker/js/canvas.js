/**
 * canvas.js
 * Handles all canvas drawing operations, image rendering, and export functionality
 */

const DEFAULT_QR_CODE_LINK = 'https://objekt.my/objekt-maker/';

const CanvasManager = {
    canvas: null,
    ctx: null,
    uploadedImage: null,
    mediaType: 'static', // 'static' | 'gif' | 'video'
    gifData: { frames: [], delays: [], currentFrame: 0, lastFrameTime: 0, animationFrame: null },
    videoData: { element: null, originalFile: null, animationFrame: null },
    imageScale: 1,
    imageRotation: 0,
    imagePosX: 0,
    imagePosY: 0,
    // Default dimensions (Objekt Default)
    baseCanvasWidth: 768,
    baseCanvasHeight: 1186,
    canvasWidth: 768,
    canvasHeight: 1186,
    scaleFactor: 1, // Scale factor for proportional scaling (current / base)
    // Card size presets (at 300 DPI)
    cardSizePresets: {
        objekt: { name: 'Objekt Default', widthMM: 65, heightMM: 100, width: 768, height: 1186 },
        standard: { name: 'Standard Photocard', widthMM: 54, heightMM: 86, width: 638, height: 1016 },
        credit: { name: 'Credit Card', widthMM: 55, heightMM: 85, width: 650, height: 1004 },
        instax: { name: 'Instax Mini', widthMM: 57, heightMM: 89, width: 673, height: 1051 },
        custom: { name: 'Custom', widthMM: 65, heightMM: 100, width: 768, height: 1186 }
    },
    currentCardSize: 'objekt',
    accentWidth: 82.61793, // Reduced by 10% from 91.7977 (91.7977 × 0.9) - base size
    accentColor: '#FFD400',
    borderImage: null, // Custom border/notch image
    isExporting: false, // True during export to suppress placeholder drawings
    signatureImage: null, // Custom signature image
    signatureZoom: 1, // Signature zoom level (1 = 100%)
    signaturePosX: 0, // Signature X position offset
    signaturePosY: 0, // Signature Y position offset
    topLogoImage: null, // Custom logo image for back side top (replaces hex cube)
    topLogoZoom: 1.5, // Top logo zoom level (1.5 = 150%)
    topLogoPosX: 0, // Top logo X position offset
    topLogoPosY: 0, // Top logo Y position offset
    topLogoBaseX: 82, 
    topLogoBaseY: 155, 
    topLogoRotation: 0, // Top logo rotation in degrees (default 0)
    logoImage: null, // Custom logo image for back side bottom text area
    logoZoom: 1, // Logo zoom level (1 = 100%)
    logoPosX: 0, // Logo X position offset (reset to 0)
    logoPosY: 0, // Logo Y position offset (reset to 0)
    logoBaseX: 310, // Base X position for back logo
    logoBaseY: 410, // Base Y position for back logo
    logoRotation: 90, // Logo rotation in degrees (default 90 clockwise)
    frontLogoImage: null, // Custom logo image for front side
    frontLogoZoom: 1, // Front logo zoom level (1 = 100%)
    frontLogoPosX: 0, // Front logo X position offset (reset to 0)
    frontLogoPosY: 0, // Front logo Y position offset (reset to 0)
    frontLogoBaseX: 385, // Base X position to maintain original logo spot (+65)
    frontLogoBaseY: 430, // Base Y position to maintain original logo spot (-20)
    frontLogoRotation: 90, // Front logo rotation in degrees (default 90 clockwise)
    _renderScheduled: false, // Internal flag for scheduleRender
    cornerRadius: 36,
    notchHeight: 1050, // Height of the centered notch
    topText: 'SeoYeon',
    middleText: '100A#00001',
    bottomText: 'tripleS',
    textColor: '#000000', // Color for all text
    fontFamily: 'Helvetica Neue', // Font family for front text
    fontWeightFront: null, // Font weight for front middle text / 100A (null = per-role defaults for Helvetica Neue)
    fontWeightBack: null,  // Font weight for back main text / name, class, season (null = per-role defaults for Helvetica Neue)
    fontWeightBorder: null, // Shared font weight for border text on both sides (front top/bottom + back rotated)

    // Text height offsets (Front side)
    topTextHeight: 0,
    middleTextHeight: 0,
    bottomTextHeight: 0,

    // Back side settings
    enableBackSide: false,
    backNameLabel: 'NAME',
    backNameValue: 'SeoYeon',
    backClassLabel: 'CLASS',
    backClassValue: 'First',
    backSeasonLabel: 'SEASON',
    backSeasonValue: 'Atom02',
    backGroupName: 'tripleS',

    // Back side text height offsets
    backTopTextHeight: 0,
    backBottomTextHeight: 0,

    // QR Code settings
    qrCodeLink: DEFAULT_QR_CODE_LINK,
    qrCodeImage: null, // Cached QR code image
    qrCodeCanvas: null, // Cached QR code canvas

    // Objekt border toggle (Phase 1)
    showObjektBorder: true, // When false, renders as clean photocard without accent bar

    // Overflow border settings
    showOverflowBorder: false,
    overflowBorderPercent: 2,

    // Reference Template Overlay (Phase 3)
    templateImage: null, // Template image for alignment reference
    templateOpacity: 0.5, // Template opacity (0-1)
    showTemplate: false, // Whether to show the template overlay
    // Back Side Reference Template Overlay
    templateImageBack: null, // Back side template image for alignment reference
    templateOpacityBack: 0.5, // Back side template opacity (0-1)
    showTemplateBack: false, // Whether to show the back side template overlay
    // Back side uploaded image (custom back)
    backUploadedImage: null, // User uploaded back side image
    backImageScale: 1, // Back image zoom (0.5-2.0)
    backImagePosX: 0, // Back image pan X (-300 to 300)
    backImagePosY: 0, // Back image pan Y (-300 to 300)

    // Custom Frame Overlay (user-uploaded, included in export)
    frameImage: null, // User uploaded frame (transparent background)
    frameOpacity: 1, // Frame opacity (0-1)
    frameScale: 1, // Frame scale (1 = 100%)
    framePosX: 0, // Frame X offset
    framePosY: 0, // Frame Y offset
    frameRotation: 0, // Frame rotation degrees
    showFrame: false, // Whether a frame is loaded/visible

    /**
     * Initialize canvas manager
     * @param {HTMLCanvasElement} canvasElement - The canvas element
     */
    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });

        // Set initial canvas size
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;

        // Enable image smoothing for better quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        console.log('Canvas initialized:', this.canvasWidth, 'x', this.canvasHeight);
    },

    /**
     * Set card size from preset or custom dimensions
     * @param {string} preset - Preset name ('objekt', 'standard', 'credit', 'instax', 'custom')
     * @param {number} customWidth - Custom width in pixels (for 'custom' preset)
     * @param {number} customHeight - Custom height in pixels (for 'custom' preset)
     */
    setCardSize(preset, customWidth = null, customHeight = null) {
        let newWidth, newHeight;

        if (preset === 'custom' && customWidth && customHeight) {
            newWidth = customWidth;
            newHeight = customHeight;
            this.cardSizePresets.custom.width = customWidth;
            this.cardSizePresets.custom.height = customHeight;
        } else if (this.cardSizePresets[preset]) {
            newWidth = this.cardSizePresets[preset].width;
            newHeight = this.cardSizePresets[preset].height;
        } else {
            console.error('Invalid card size preset:', preset);
            return;
        }

        // Calculate scale factor based on base dimensions
        this.scaleFactor = newWidth / this.baseCanvasWidth;

        // Update canvas dimensions
        this.canvasWidth = newWidth;
        this.canvasHeight = newHeight;
        this.currentCardSize = preset;

        // Update actual canvas element dimensions
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;

        // Update back canvas dimensions if it exists
        const backCanvas = document.getElementById('backCanvas');
        if (backCanvas) {
            backCanvas.width = newWidth;
            backCanvas.height = newHeight;
        }

        console.log('Card size updated:', preset, `${newWidth}x${newHeight}`, `scale: ${this.scaleFactor.toFixed(3)}`);

        // Re-render if image is loaded
        if (this.hasImage()) {
            this.render();
            this.updateBackSidePreview();
        }
    },

    /**
     * Convert mm to pixels at 300 DPI
     * @param {number} mm - Millimeters
     * @returns {number} Pixels
     */
    mmToPixels(mm) {
        // 1 inch = 25.4 mm
        // At 300 DPI: 1 mm = (300 / 25.4) pixels ≈ 11.811 pixels
        return Math.round(mm * (300 / 25.4));
    },

    // ─── GIF Parsing ───

    async parseGif(arrayBuffer) {
        return new Promise((resolve, reject) => {
            try {
                let gifuctLib = null;
                if (typeof window.gifuct !== 'undefined') gifuctLib = window.gifuct;
                else if (typeof gifuct !== 'undefined') gifuctLib = gifuct;
                else if (typeof window.GifuctJs !== 'undefined') gifuctLib = window.GifuctJs;

                if (gifuctLib) {
                    console.log('Parsing GIF with gifuct-js');
                    const gif = gifuctLib.parseGIF(arrayBuffer);
                    const frames = gifuctLib.decompressFrames(gif, true);
                    console.log(`GIF parsed: ${frames.length} frames`);
                    return this.processGifuctFrames(frames, resolve, reject);
                }

                if (typeof window.GifReader !== 'undefined') {
                    console.log('Parsing GIF with omggif (fallback)');
                    return this.parseGifWithOmggif(arrayBuffer, resolve, reject);
                }

                reject(new Error('GIF parser library not loaded. Please reload the page.'));
            } catch (error) {
                console.error('Error parsing GIF:', error);
                reject(error);
            }
        });
    },

    processGifuctFrames(frames, resolve, reject) {
        try {
            if (frames.length === 0) { reject(new Error('GIF has no frames')); return; }

            const imageFrames = [];
            const delays = [];
            const gifWidth = frames[0].dims.width;
            const gifHeight = frames[0].dims.height;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;
            const tempCtx = tempCanvas.getContext('2d');

            let loadedFrames = 0;

            frames.forEach((frame, index) => {
                const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
                imageData.data.set(frame.patch);
                tempCtx.putImageData(imageData, frame.dims.left, frame.dims.top);

                const img = new Image();
                img.onload = () => {
                    loadedFrames++;
                    if (loadedFrames === frames.length) {
                        console.log('All GIF frames loaded successfully');
                        resolve({ frames: imageFrames, delays });
                    }
                };
                img.onerror = () => reject(new Error(`Failed to load GIF frame ${index}`));
                img.src = tempCanvas.toDataURL('image/png');
                imageFrames[index] = img;
                delays[index] = (frame.delay || 10) * 10;
            });
        } catch (error) {
            reject(error);
        }
    },

    parseGifWithOmggif(arrayBuffer, resolve, reject) {
        try {
            const bytes = new Uint8Array(arrayBuffer);
            const reader = new window.GifReader(bytes);
            const imageFrames = [];
            const delays = [];
            const width = reader.width;
            const height = reader.height;

            console.log(`GIF parsed with omggif: ${reader.numFrames()} frames, ${width}x${height}`);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            let loadedFrames = 0;

            for (let i = 0; i < reader.numFrames(); i++) {
                const frameInfo = reader.frameInfo(i);
                const framePixels = new Uint8ClampedArray(width * height * 4);
                reader.decodeAndBlitFrameRGBA(i, framePixels);

                const imageData = tempCtx.createImageData(width, height);
                imageData.data.set(framePixels);
                tempCtx.putImageData(imageData, 0, 0);

                const img = new Image();
                img.onload = () => {
                    loadedFrames++;
                    if (loadedFrames === reader.numFrames()) {
                        console.log('All GIF frames loaded successfully (omggif)');
                        resolve({ frames: imageFrames, delays });
                    }
                };
                img.onerror = () => reject(new Error(`Failed to load GIF frame ${i}`));
                img.src = tempCanvas.toDataURL('image/png');
                imageFrames[i] = img;
                delays[i] = (frameInfo.delay || 10) * 10;
            }
        } catch (error) {
            console.error('Error parsing GIF with omggif:', error);
            reject(error);
        }
    },

    // ─── Animation Loops ───

    startGifAnimation() {
        if (this.gifData.frames.length === 0) return;
        this.gifData.lastFrameTime = performance.now();

        const animate = (now) => {
            const elapsed = now - this.gifData.lastFrameTime;
            const delay = this.gifData.delays[this.gifData.currentFrame] || 100;

            if (elapsed >= delay) {
                this.gifData.currentFrame = (this.gifData.currentFrame + 1) % this.gifData.frames.length;
                this.uploadedImage = this.gifData.frames[this.gifData.currentFrame];
                this.gifData.lastFrameTime = now;
                this.render();
            }

            this.gifData.animationFrame = requestAnimationFrame(animate);
        };

        this.gifData.animationFrame = requestAnimationFrame(animate);
    },

    startVideoAnimation() {
        const animate = () => {
            if (this.videoData.element && !this.videoData.element.paused) {
                this.render();
            }
            this.videoData.animationFrame = requestAnimationFrame(animate);
        };
        this.videoData.animationFrame = requestAnimationFrame(animate);
    },

    stopAnimation() {
        if (this.gifData.animationFrame) {
            cancelAnimationFrame(this.gifData.animationFrame);
            this.gifData.animationFrame = null;
        }
        if (this.videoData.animationFrame) {
            cancelAnimationFrame(this.videoData.animationFrame);
            this.videoData.animationFrame = null;
        }
    },

    isAnimated() {
        return this.mediaType === 'gif' || this.mediaType === 'video';
    },

    // ─── Image/Media Loading ───

    /**
     * Load an image/GIF/video from file
     * @param {File} file - Media file to load
     * @returns {Promise<boolean>} Success status
     */
    async loadImage(file) {
        // Validate file type
        const isStatic = file.type.match(/^image\/(png|jpeg|jpg)$/);
        const isGif = file.type === 'image/gif';
        const isVideo = file.type === 'video/mp4';

        if (!isStatic && !isGif && !isVideo) {
            throw new Error('Please upload a PNG, JPG, GIF, or MP4 file');
        }

        // Size limits
        const maxSize = (isGif || isVideo) ? 30 * 1024 * 1024 : 5 * 1024 * 1024;
        const sizeLabel = (isGif || isVideo) ? '30MB' : '5MB';
        if (file.size > maxSize) {
            throw new Error(`File size must be less than ${sizeLabel}`);
        }

        // Stop any existing animation
        this.stopAnimation();

        if (isGif) {
            return this.loadGif(file);
        } else if (isVideo) {
            return this.loadVideo(file);
        } else {
            return this.loadStaticImage(file);
        }
    },

    async loadStaticImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.mediaType = 'static';
                    this.uploadedImage = img;
                    console.log('Image loaded:', img.width, 'x', img.height);
                    this.render();
                    resolve(true);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    async loadGif(file) {
        const arrayBuffer = await file.arrayBuffer();
        const { frames, delays } = await this.parseGif(arrayBuffer);

        this.mediaType = 'gif';
        this.gifData.frames = frames;
        this.gifData.delays = delays;
        this.gifData.currentFrame = 0;
        this.uploadedImage = frames[0];
        console.log('GIF loaded:', frames.length, 'frames');
        this.render();
        this.startGifAnimation();
        return true;
    },

    async loadVideo(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.autoplay = false;

            const url = URL.createObjectURL(file);
            let initialized = false;

            video.onloadedmetadata = () => {
                video.currentTime = 0;
            };

            video.onseeked = () => {
                if (initialized) return;
                initialized = true;

                this.mediaType = 'video';
                this.videoData.element = video;
                this.videoData.originalFile = file;
                this.uploadedImage = video;
                console.log('Video loaded:', video.videoWidth, 'x', video.videoHeight, 'duration:', video.duration);
                this.render();
                video.play().then(() => {
                    this.startVideoAnimation();
                }).catch(err => {
                    console.warn('Video autoplay blocked:', err);
                    this.startVideoAnimation();
                });
                resolve(true);
            };

            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video'));
            };
            video.src = url;
        });
    },

    /**
     * Set zoom level
     * @param {number} scale - Scale value (1 = 100%)
     */
    setZoom(scale) {
        this.imageScale = scale;
        this.render();
    },

    /**
     * Load back side image from file
     */
    async loadBackImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backUploadedImage = img;
                    console.log('Back image loaded:', img.width, 'x', img.height);
                    this.updateBackSidePreview();
                    resolve(true);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Set back image zoom level
     */
    setBackZoom(scale) {
        this.backImageScale = scale;
        this.updateBackSidePreview();
    },

    /**
     * Set back image pan position
     */
    setBackPan(x, y) {
        this.backImagePosX = x;
        this.backImagePosY = y;
        this.updateBackSidePreview();
    },

    /**
     * Check if back side has an uploaded image
     */
    hasBackImage() {
        return this.backUploadedImage !== null;
    },

    /**
     * Set rotation angle
     * @param {number} degrees - Rotation in degrees
     */
    setRotation(degrees) {
        this.imageRotation = degrees;
        this.render();
    },

    /**
     * Set text values
     * @param {string} top - Top text
     * @param {string} middle - Middle text
     * @param {string} bottom - Bottom text
     */
    setText(top, middle, bottom) {
        if (top !== undefined) this.topText = top;
        if (middle !== undefined) this.middleText = middle;
        if (bottom !== undefined) this.bottomText = bottom;
        this.render();
    },

    /**
     * Set border/accent color
     * @param {string} color - Hex color value
     */
    setBorderColor(color) {
        this.accentColor = color;
        this.render();
        this.updateBackSidePreview();
    },

    /**
     * Set text color (applies to all text)
     * @param {string} color - Hex color value
     */
    async setTextColor(color) {
        this.textColor = color;
        this.render();
        // Always regenerate QR code with new color
        await this.generateQRCode();
        this.updateBackSidePreview();
    },

    /**
     * Set font family for front text
     * @param {string} family - Font family name
     */
    setFontFamily(family) {
        this.fontFamily = family;
        this.render();
        this.updateBackSidePreview();
    },

    /**
     * Get the resolved font string for a given text role.
     * For Helvetica Neue, returns the original objekt-specific font families.
     * For other fonts, returns the generic fontFamily.
     * @param {string} role - 'frontTop', 'frontMiddle', 'backLabel', 'backValue', 'backRotated'
     * @returns {string} The font-family CSS string (without weight/size)
     */
    getFontFamilyForRole(role) {
        if (this.fontFamily === 'Helvetica Neue') {
            switch (role) {
                case 'frontMiddle':
                    return '"SF Pro Display", sans-serif';
                case 'backValue':
                    return '"Neue Helvetica Georgian 65 Medium", "Helvetica Neue", sans-serif';
                default:
                    return '"Helvetica Neue", sans-serif';
            }
        }
        return `"${this.fontFamily}", sans-serif`;
    },

    /**
     * Get the font weight for a given text role.
     * If a custom fontWeight is set, it overrides the default.
     * For Helvetica Neue with no override, returns the original objekt-tuned weights.
     * @param {string} role - 'frontTop', 'frontMiddle', 'backLabel', 'backValue', 'backRotated'
     * @param {number} defaultWeight - The default weight for this context
     * @returns {number} The font weight to use
     */
    getFontWeightForRole(role, defaultWeight) {
        // Border text roles are shared between front and back sides
        if (role === 'frontTop' || role === 'backRotated') {
            return this.fontWeightBorder ?? defaultWeight;
        }
        if (role === 'frontMiddle') {
            return this.fontWeightFront ?? defaultWeight;
        }
        // Back main text roles: backLabel, backValue
        return this.fontWeightBack ?? defaultWeight;
    },

    setFontWeightFront(weight) {
        this.fontWeightFront = weight;
        this.render();
    },

    setFontWeightBack(weight) {
        this.fontWeightBack = weight;
        this.render();
        this.updateBackSidePreview();
    },

    setFontWeightBorder(weight) {
        this.fontWeightBorder = weight;
        this.render();
        this.updateBackSidePreview();
    },

    /**
     * Set text height offset for front side
     * @param {string} position - 'top', 'middle', or 'bottom'
     * @param {number} offset - Y offset in pixels
     */
    setTextHeight(position, offset) {
        if (position === 'top') this.topTextHeight = offset;
        else if (position === 'middle') this.middleTextHeight = offset;
        else if (position === 'bottom') this.bottomTextHeight = offset;
        this.render();
    },

    /**
     * Set back side text height offset
     * @param {string} position - 'top' or 'bottom'
     * @param {number} offset - Y offset in pixels
     */
    setBackTextHeight(position, offset) {
        if (position === 'top') this.backTopTextHeight = offset;
        else if (position === 'bottom') this.backBottomTextHeight = offset;
        this.updateBackSidePreview();
    },

    /**
     * Set back side enabled state
     * @param {boolean} enabled - Whether back side is enabled
     */
    setBackSideEnabled(enabled) {
        this.enableBackSide = enabled;
        // Trigger back side preview update
        this.updateBackSidePreview();
    },

    /**
     * Set back side text values
     * @param {Object} data - Back side text data
     */
    setBackSideData(data) {
        if (data.nameLabel !== undefined) this.backNameLabel = data.nameLabel;
        if (data.nameValue !== undefined) this.backNameValue = data.nameValue;
        if (data.classLabel !== undefined) this.backClassLabel = data.classLabel;
        if (data.classValue !== undefined) this.backClassValue = data.classValue;
        if (data.seasonLabel !== undefined) this.backSeasonLabel = data.seasonLabel;
        if (data.seasonValue !== undefined) this.backSeasonValue = data.seasonValue;
        if (data.groupName !== undefined) this.backGroupName = data.groupName;
        // Update back side preview
        this.updateBackSidePreview();
    },

    /**
     * Load a border image from file
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>} Success status
     */
    async loadBorderImage(file) {
        return new Promise((resolve, reject) => {
            // Validate file type
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = async () => {
                    this.borderImage = img;
                    console.log('Border image loaded:', img.width, 'x', img.height);
                    this.render();
                    // Always regenerate QR code to ensure it displays on back side
                    await this.generateQRCode();
                    this.updateBackSidePreview();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load border image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the border image and use color instead
     */
    async clearBorderImage() {
        this.borderImage = null;
        this.render();
        // Always regenerate QR code to ensure it displays on back side
        await this.generateQRCode();
        this.updateBackSidePreview();
    },

    /**
     * Load a signature image from file
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>} Success status
     */
    async loadSignatureImage(file) {
        return new Promise((resolve, reject) => {
            // Validate file type - only accept PNG for transparency support
            if (!file.type.match('image/png')) {
                reject(new Error('Please upload a PNG image with transparent background'));
                return;
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.signatureImage = img;
                    console.log('Signature image loaded:', img.width, 'x', img.height);
                    this.updateBackSidePreview();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load signature image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the signature image and use default signature instead
     */
    clearSignatureImage() {
        this.signatureImage = null;
        this.signatureZoom = 1;
        this.topLogoImage = null;
        this.topLogoZoom = 1;
        this.topLogoPosX = 0;
        this.topLogoPosY = 0;
        this.topLogoRotation = 0;
        this.updateBackSidePreview();
    },

    /**
     * Set signature zoom level
     * @param {number} zoom - Zoom level (1 = 100%)
     */
    setSignatureZoom(zoom) {
        this.signatureZoom = zoom;
        this.updateBackSidePreview();
    },

    /**
     * Set signature position
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setSignaturePosition(x, y) {
        this.signaturePosX = x;
        this.signaturePosY = y;
        this.updateBackSidePreview();
    },

    /**
     * Load top logo image from file (replaces hex cube)
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>}
     */
    async loadTopLogoImage(file) {
        return new Promise((resolve, reject) => {
            // Validate file type (PNG, JPG)
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.topLogoImage = img;
                    console.log('Top logo image loaded:', img.width, 'x', img.height);
                    this.updateBackSidePreview();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load top logo image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the top logo image
     */
    clearTopLogoImage() {
        this.topLogoImage = null;
        this.topLogoZoom = 1;
        this.topLogoPosX = 0;
        this.topLogoPosY = 0;
        this.topLogoRotation = 0;
        this.updateBackSidePreview();
    },

    /**
     * Set top logo zoom level
     * @param {number} zoom - Zoom level (1 = 100%)
     */
    setTopLogoZoom(zoom) {
        this.topLogoZoom = zoom;
        this.updateBackSidePreview();
    },

    /**
     * Set top logo position
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setTopLogoPosition(x, y) {
        this.topLogoPosX = x;
        this.topLogoPosY = y;
        this.updateBackSidePreview();
    },

    /**
     * Set top logo rotation
     * @param {number} rotation - Rotation in degrees
     */
    setTopLogoRotation(rotation) {
        this.topLogoRotation = rotation;
        this.updateBackSidePreview();
    },

    /**
     * Load back side logo image from file
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>}
     */
    async loadLogoImage(file) {
        return new Promise((resolve, reject) => {
            // Validate file type (PNG, JPG)
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.logoImage = img;
                    this.backGroupName = ''; // Clear back side bottom text when logo is loaded
                    console.log('Logo image loaded:', img.width, 'x', img.height);
                    this.updateBackSidePreview();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load logo image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the back side logo image
     */
    clearLogoImage() {
        this.logoImage = null;
        this.logoZoom = 1;
        this.logoPosX = 0;
        this.logoPosY = 0;
        this.logoRotation = 90;
        this.updateBackSidePreview();
    },

    /**
     * Set logo zoom level
     * @param {number} zoom - Zoom level (1 = 100%)
     */
    setLogoZoom(zoom) {
        this.logoZoom = zoom;
        this.updateBackSidePreview();
    },

    /**
     * Set logo position
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setLogoPosition(x, y) {
        this.logoPosX = x;
        this.logoPosY = y;
        this.updateBackSidePreview();
    },

    /**
     * Set logo rotation
     * @param {number} rotation - Rotation in degrees
     */
    setLogoRotation(rotation) {
        this.logoRotation = rotation;
        this.updateBackSidePreview();
    },

    /**
     * Load front side logo image from file
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>}
     */
    async loadFrontLogoImage(file) {
        return new Promise((resolve, reject) => {
            // Validate file type (PNG, JPG)
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.frontLogoImage = img;
                    this.bottomText = ''; // Clear bottom text when logo is loaded
                    console.log('Front logo image loaded:', img.width, 'x', img.height);
                    this.render();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load logo image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the front side logo image
     */
    clearFrontLogoImage() {
        this.frontLogoImage = null;
        this.frontLogoZoom = 1;
        this.frontLogoPosX = 0;
        this.frontLogoPosY = 0;
        this.frontLogoRotation = 90;
        this.render();
    },

    /**
     * Set front logo zoom level
     * @param {number} zoom - Zoom level (1 = 100%)
     */
    setFrontLogoZoom(zoom) {
        this.frontLogoZoom = zoom;
        this.render();
    },

    /**
     * Set front logo position
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setFrontLogoPosition(x, y) {
        this.frontLogoPosX = x;
        this.frontLogoPosY = y;
        this.render();
    },

    /**
     * Set front logo rotation
     * @param {number} rotation - Rotation in degrees
     */
    setFrontLogoRotation(rotation) {
        this.frontLogoRotation = rotation;
        this.render();
    },

    /**
     * Load a template image from file (Phase 3)
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>} Success status
     */
    async loadTemplateImage(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.templateImage = img;
                    this.showTemplate = true;
                    console.log('Template image loaded:', img.width, 'x', img.height);
                    this.render();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load template image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the template image
     */
    clearTemplateImage() {
        this.templateImage = null;
        this.showTemplate = false;
        this.templateOpacity = 0.5;
        this.render();
    },

    /**
     * Load a custom frame image from file (PNG preferred for transparency)
     * @param {File} file
     */
    async loadFrameImage(file) {
        return new Promise((resolve, reject) => {
            // Prefer PNG (transparency) but allow JPG as fallback
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.frameImage = img;
                    this.showFrame = true;
                    // Reset frame transform defaults
                    this.frameOpacity = 1;
                    this.frameScale = 1;
                    this.framePosX = 0;
                    this.framePosY = 0;
                    this.frameRotation = 0;
                    console.log('Frame image loaded:', img.width, 'x', img.height);
                    this.render();
                    resolve(true);
                };
                img.onerror = () => reject(new Error('Failed to load frame image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the frame image
     */
    clearFrameImage() {
        this.frameImage = null;
        this.showFrame = false;
        this.frameOpacity = 1;
        this.frameScale = 1;
        this.framePosX = 0;
        this.framePosY = 0;
        this.frameRotation = 0;
        this.render();
    },

    /**
     * Set frame opacity (0-1)
     */
    setFrameOpacity(opacity) {
        this.frameOpacity = Math.max(0, Math.min(1, opacity));
        this.render();
    },

    /**
     * Set frame transform: scale
     */
    setFrameScale(scale) {
        this.frameScale = scale;
        this.render();
    },

    /**
     * Set frame position offsets
     */
    setFramePosition(x, y) {
        this.framePosX = x;
        this.framePosY = y;
        this.render();
    },

    /**
     * Set frame rotation degrees
     */
    setFrameRotation(deg) {
        this.frameRotation = deg;
        this.render();
    },

    /**
     * Set template opacity
     * @param {number} opacity - Opacity value (0-1)
     */
    setTemplateOpacity(opacity) {
        this.templateOpacity = Math.max(0, Math.min(1, opacity));
        this.render();
    },

    /**
     * Set template visibility
     * @param {boolean} visible - Whether to show the template
     */
    setTemplateVisible(visible) {
        this.showTemplate = visible;
        this.render();
    },

    /**
     * Load a back side template image from file
     * @param {File} file - Image file to load
     * @returns {Promise<boolean>} Success status
     */
    async loadTemplateImageBack(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.match('image/(png|jpeg|jpg)')) {
                reject(new Error('Please upload a PNG or JPG image'));
                return;
            }

            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                reject(new Error('Image size must be less than 5MB'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    this.templateImageBack = img;
                    this.showTemplateBack = true;
                    console.log('Back side template image loaded:', img.width, 'x', img.height);
                    this.updateBackSidePreview();
                    resolve(true);
                };

                img.onerror = () => {
                    reject(new Error('Failed to load template image'));
                };

                img.src = e.target.result;
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsDataURL(file);
        });
    },

    /**
     * Clear the back side template image
     */
    clearTemplateImageBack() {
        this.templateImageBack = null;
        this.showTemplateBack = false;
        this.templateOpacityBack = 0.5;
        this.updateBackSidePreview();
    },

    /**
     * Set back side template opacity
     * @param {number} opacity - Opacity value (0-1)
     */
    setTemplateOpacityBack(opacity) {
        this.templateOpacityBack = Math.max(0, Math.min(1, opacity));
        this.updateBackSidePreview();
    },

    /**
     * Set back side template visibility
     * @param {boolean} visible - Whether to show the template
     */
    setTemplateVisibleBack(visible) {
        this.showTemplateBack = visible;
        this.updateBackSidePreview();
    },

    /**
     * Render the template overlay on top of the canvas (Phase 3)
     * Called at the end of render() when template is visible
     */
    renderTemplateOverlay() {
        if (!this.templateImage || !this.showTemplate) {
            return;
        }

        this.ctx.save();

        // Apply opacity
        this.ctx.globalAlpha = this.templateOpacity;

        // Calculate dimensions to cover the canvas while maintaining aspect ratio
        const imgAspect = this.templateImage.width / this.templateImage.height;
        const canvasAspect = this.canvasWidth / this.canvasHeight;

        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

        if (imgAspect > canvasAspect) {
            // Image is wider - fit to height
            drawHeight = this.canvasHeight;
            drawWidth = drawHeight * imgAspect;
            offsetX = (this.canvasWidth - drawWidth) / 2;
        } else {
            // Image is taller - fit to width
            drawWidth = this.canvasWidth;
            drawHeight = drawWidth / imgAspect;
            offsetY = (this.canvasHeight - drawHeight) / 2;
        }

        // Draw template overlay
        this.ctx.drawImage(
            this.templateImage,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
        );

        this.ctx.restore();
    },

    /**
     * Render the back side template overlay
     * Called from renderBackSide() when back template is visible
     * @param {CanvasRenderingContext2D} ctx - Back side canvas context
     * @param {number} canvasWidth - Canvas width
     * @param {number} canvasHeight - Canvas height
     */
    renderTemplateOverlayBack(ctx, canvasWidth, canvasHeight) {
        if (!this.templateImageBack || !this.showTemplateBack) {
            return;
        }

        ctx.save();

        // Apply opacity
        ctx.globalAlpha = this.templateOpacityBack;

        // Calculate dimensions to cover the canvas while maintaining aspect ratio
        const imgAspect = this.templateImageBack.width / this.templateImageBack.height;
        const canvasAspect = canvasWidth / canvasHeight;

        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

        if (imgAspect > canvasAspect) {
            // Image is wider - fit to height
            drawHeight = canvasHeight;
            drawWidth = drawHeight * imgAspect;
            offsetX = (canvasWidth - drawWidth) / 2;
        } else {
            // Image is taller - fit to width
            drawWidth = canvasWidth;
            drawHeight = drawWidth / imgAspect;
            offsetY = (canvasHeight - drawHeight) / 2;
        }

        // Draw template overlay
        ctx.drawImage(
            this.templateImageBack,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
        );

        ctx.restore();
    },

    /**
     * Pan image position
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setPan(x, y) {
        this.imagePosX = x;
        this.imagePosY = y;
        this.render();
    },

    /**
     * Set QR code link and regenerate QR code
     * @param {string} link - URL for the QR code
     */
    async setQRCodeLink(link) {
        this.qrCodeLink = link;
        await this.generateQRCode();
        this.updateBackSidePreview();
    },

    /**
     * Generate QR code image from the current link using Nayuki QR Code generator
     * @returns {Promise<void>}
     */
    async generateQRCode() {
        if (!this.qrCodeLink || typeof qrcode === 'undefined') {
            this.qrCodeImage = null;
            this.qrCodeCanvas = null;
            console.warn('QR Code library not loaded or no link provided', {
                link: this.qrCodeLink,
                libraryLoaded: typeof qrcode !== 'undefined'
            });
            return;
        }

        try {
            console.log('Generating QR code for:', this.qrCodeLink, 'with text color:', this.textColor);

            // Create QR code using Nayuki library
            // Error correction level: L=1, M=0, Q=3, H=2
            const typeNumber = 0; // Auto-detect optimal type
            const errorCorrectionLevel = 'M'; // Medium error correction
            const qr = qrcode(typeNumber, errorCorrectionLevel);
            qr.addData(this.qrCodeLink);
            qr.make();

            // Get the module count (size of the QR code grid)
            const moduleCount = qr.getModuleCount();
            const cellSize = 8; // Size of each module in pixels
            const margin = 2; // Margin in modules
            const size = (moduleCount + margin * 2) * cellSize;

            // Create a canvas for QR code generation
            const qrCanvas = document.createElement('canvas');
            qrCanvas.width = size;
            qrCanvas.height = size;
            const ctx = qrCanvas.getContext('2d');

            // Fill background with white
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);

            // Draw QR code modules
            ctx.fillStyle = '#000000'; // Always black for QR code readability
            for (let row = 0; row < moduleCount; row++) {
                for (let col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(
                            (col + margin) * cellSize,
                            (row + margin) * cellSize,
                            cellSize,
                            cellSize
                        );
                    }
                }
            }

            console.log('QR canvas created, dimensions:', qrCanvas.width, 'x', qrCanvas.height, 'modules:', moduleCount);

            // Store the canvas directly for rendering
            this.qrCodeCanvas = qrCanvas;

            // Also convert canvas to image for backwards compatibility
            const img = new Image();
            img.src = qrCanvas.toDataURL('image/png');

            await new Promise((resolve, reject) => {
                img.onload = () => {
                    console.log('QR image loaded successfully, dimensions:', img.width, 'x', img.height);
                    resolve();
                };
                img.onerror = (error) => {
                    console.error('QR image failed to load:', error);
                    reject(error);
                };
            });

            this.qrCodeImage = img;
            console.log('QR Code generated successfully and stored');

            // Update back side preview
            this.updateBackSidePreview();
        } catch (error) {
            console.error('Failed to generate QR code:', error);
            this.qrCodeImage = null;
            this.qrCodeCanvas = null;
        }
    },

    /**
     * Update back side preview canvas
     */
    updateBackSidePreview() {
        const backCanvasWrapper = document.getElementById('backCanvasWrapper');
        const backCanvas = document.getElementById('backCanvas');

        if (!backCanvasWrapper || !backCanvas) {
            console.warn('Back canvas elements not found');
            return;
        }

        // Always render the back side (even if not visible) so it's ready when needed
        console.log('Updating back side preview, QR code status:', {
            canvasExists: !!this.qrCodeCanvas,
            imageExists: !!this.qrCodeImage,
            imageComplete: this.qrCodeImage ? this.qrCodeImage.complete : false,
            enableBackSide: this.enableBackSide
        });

        // Render the back side to the preview canvas
        const backSideCanvas = this.renderBackSide();
        // Resize DOM canvas to match rendered size (includes overflow border)
        if (backCanvas.width !== backSideCanvas.width || backCanvas.height !== backSideCanvas.height) {
            backCanvas.width = backSideCanvas.width;
            backCanvas.height = backSideCanvas.height;
        }
        const backCtx = backCanvas.getContext('2d');
        backCtx.clearRect(0, 0, backCanvas.width, backCanvas.height);
        backCtx.drawImage(backSideCanvas, 0, 0);
        console.log('Back side preview updated');

        if (this.enableBackSide) {
            // Show the back canvas wrapper
            backCanvasWrapper.classList.add('active');
        } else {
            // Hide the back canvas wrapper
            backCanvasWrapper.classList.remove('active');
        }
    },

    /**
     * Schedule a render on the next animation frame.
     * Coalesces multiple calls so the canvas is only redrawn once per frame.
     * Always renders both front and back sides to keep them in sync.
     */
    scheduleRender() {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        requestAnimationFrame(() => {
            this._renderScheduled = false;
            this.render();
            this.updateBackSidePreview();
        });
    },

    /**
     * Main render function - draws everything on canvas
     */
    render() {
        if (!this.uploadedImage) {
            return;
        }

        // Calculate canvas size with overflow
        const multiplier = this.showOverflowBorder ? (1 + this.overflowBorderPercent / 100) : 1;
        const renderWidth = Math.round(this.canvasWidth * multiplier);
        const renderHeight = Math.round(this.canvasHeight * multiplier);
        const offsetX = Math.round((renderWidth - this.canvasWidth) / 2);
        const offsetY = Math.round((renderHeight - this.canvasHeight) / 2);

        // Resize canvas if needed
        if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
            this.canvas.width = renderWidth;
            this.canvas.height = renderHeight;
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }

        // Clear and draw gray background if overflow enabled
        this.ctx.clearRect(0, 0, renderWidth, renderHeight);
        if (this.showOverflowBorder) {
            this.ctx.fillStyle = '#D3D3D3';
            this.ctx.fillRect(0, 0, renderWidth, renderHeight);
        }

        // Create a temporary canvas for the rounded image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvasWidth;
        tempCanvas.height = this.canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Calculate scaled accent width
        const scaledAccentWidth = this.accentWidth * this.scaleFactor;

        // Calculate image area (canvas width minus accent bar)
        const imageAreaWidth = this.canvasWidth - scaledAccentWidth;
        const imageAreaHeight = this.canvasHeight;

        // Calculate image dimensions to cover the entire canvas with 2:3 aspect ratio
        // Using "cover" mode - fill entire area, cropping if necessary
        const targetAspect = 2 / 3; // Width / Height = 2 / 3
        const imgW = this.uploadedImage.videoWidth || this.uploadedImage.width;
        const imgH = this.uploadedImage.videoHeight || this.uploadedImage.height;
        const imgAspect = imgW / imgH;

        let drawWidth, drawHeight;

        // Calculate dimensions to cover the entire canvas area (including accent bar)
        const fullAspect = this.canvasWidth / this.canvasHeight;

        if (imgAspect > fullAspect) {
            // Image is wider - fit to height
            drawHeight = this.canvasHeight * this.imageScale;
            drawWidth = drawHeight * imgAspect;
        } else {
            // Image is taller - fit to width
            drawWidth = this.canvasWidth * this.imageScale;
            drawHeight = drawWidth / imgAspect;
        }

        // Calculate position (centered with pan)
        const xPos = (this.canvasWidth - drawWidth) / 2 + this.imagePosX;
        const yPos = (this.canvasHeight - drawHeight) / 2 + this.imagePosY;

        // Draw image on temp canvas
        tempCtx.drawImage(
            this.uploadedImage,
            xPos,
            yPos,
            drawWidth,
            drawHeight
        );

        // Create rounded rectangle clip path on main canvas
        const scaledCornerRadius = this.cornerRadius * this.scaleFactor;
        this.ctx.save();
        this.createRoundedRect(offsetX, offsetY, this.canvasWidth, this.canvasHeight, scaledCornerRadius);
        this.ctx.clip();

        // Draw the temp canvas (with image) onto main canvas
        this.ctx.drawImage(tempCanvas, offsetX, offsetY);

        this.ctx.restore();

        // Draw centered notch on right side (only if objekt border is enabled)
        if (this.showObjektBorder) {
            this.ctx.save();
            const scaledNotchHeight = this.notchHeight * this.scaleFactor;
            const accentX = offsetX + this.canvasWidth - scaledAccentWidth;

            // Calculate vertical centering
            const notchY = offsetY + (this.canvasHeight - scaledNotchHeight) / 2;
            const notchRadius = 20 * this.scaleFactor; // Radius for the notch rounded corners (left side only)

            // Create path for centered notch with rounded corners only on left side
            this.ctx.beginPath();
            this.ctx.moveTo(accentX, notchY + notchRadius);
            this.ctx.arcTo(accentX, notchY, accentX + notchRadius, notchY, notchRadius);
            this.ctx.lineTo(offsetX + this.canvasWidth, notchY); // Straight line to top-right (no rounding)
            this.ctx.lineTo(offsetX + this.canvasWidth, notchY + scaledNotchHeight); // Straight line down the right edge
            this.ctx.lineTo(accentX + notchRadius, notchY + scaledNotchHeight);
            this.ctx.arcTo(accentX, notchY + scaledNotchHeight, accentX, notchY + scaledNotchHeight - notchRadius, notchRadius);
            this.ctx.closePath();

            // If border image is set, use it; otherwise use color
            if (this.borderImage) {
                // Clip and draw the border image
                this.ctx.clip();

                // Calculate dimensions to cover the notch area (zoom to fill, don't stretch)
                const notchAspect = scaledAccentWidth / scaledNotchHeight;
                const imgAspect = this.borderImage.width / this.borderImage.height;

                let drawWidth, drawHeight;
                let offsetX = 0, offsetY = 0;

                if (imgAspect > notchAspect) {
                    // Image is wider - fit to height and crop sides
                    drawHeight = scaledNotchHeight;
                    drawWidth = drawHeight * imgAspect;
                    offsetX = (scaledAccentWidth - drawWidth) / 2;
                } else {
                    // Image is taller - fit to width and crop top/bottom
                    drawWidth = scaledAccentWidth;
                    drawHeight = drawWidth / imgAspect;
                    offsetY = (scaledNotchHeight - drawHeight) / 2;
                }

                // Draw the border image to cover the notch area
                this.ctx.drawImage(
                    this.borderImage,
                    accentX + offsetX,
                    notchY + offsetY,
                    drawWidth,
                    drawHeight
                );
            } else {
                // Use solid color
                this.ctx.fillStyle = this.accentColor;
                this.ctx.fill();
            }

            this.ctx.restore();

            // Draw text on accent bar
            this.drawAccentText();
        }

        // Draw front side logo if present
        if (this.frontLogoImage) {
            // Position logo inside the main image area
            // When objekt border is on, exclude the notch area; when off, use full canvas width
            const scaledAccentWidth = this.accentWidth * this.scaleFactor;
            const imageAreaWidth = this.showObjektBorder ? this.canvasWidth - scaledAccentWidth : this.canvasWidth;
            const centerX = offsetX + imageAreaWidth / 2;
            const centerY = offsetY + this.canvasHeight / 2;
            this.drawFrontLogo(this.ctx, centerX, centerY);
        }

        // Draw custom frame overlay (user-uploaded) - included in export
        if (this.frameImage && this.showFrame) {
            try {
                this.ctx.save();
                this.ctx.globalAlpha = this.frameOpacity;

                // Clip frame to the rounded rectangle
                this.createRoundedRect(offsetX, offsetY, this.canvasWidth, this.canvasHeight, scaledCornerRadius);
                this.ctx.clip();

                // Calculate dimensions to cover the canvas while maintaining aspect ratio
                const imgAspect = this.frameImage.width / this.frameImage.height;
                const canvasAspect = this.canvasWidth / this.canvasHeight;

                let drawWidth, drawHeight;

                if (imgAspect > canvasAspect) {
                    // Image is wider - fit to height
                    drawHeight = this.canvasHeight * this.frameScale;
                    drawWidth = drawHeight * imgAspect;
                } else {
                    // Image is taller - fit to width
                    drawWidth = this.canvasWidth * this.frameScale;
                    drawHeight = drawWidth / imgAspect;
                }

                // Center position with user offsets
                const drawX = offsetX + (this.canvasWidth - drawWidth) / 2 + this.framePosX;
                const drawY = offsetY + (this.canvasHeight - drawHeight) / 2 + this.framePosY;

                // Apply rotation about center
                const cx = drawX + drawWidth / 2;
                const cy = drawY + drawHeight / 2;
                this.ctx.translate(cx, cy);
                this.ctx.rotate((this.frameRotation * Math.PI) / 180);
                this.ctx.translate(-cx, -cy);

                this.ctx.drawImage(this.frameImage, drawX, drawY, drawWidth, drawHeight);
            } catch (err) {
                console.error('Failed to render frame image', err);
            } finally {
                this.ctx.restore();
            }
        }

        // Draw template overlay on top (Phase 3) - only for preview, not export
        this.renderTemplateOverlay();
    },

    /**
     * Draw front side logo image
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    drawFrontLogo(ctx, x, y) {
        ctx.save();

        // If a front logo image is uploaded, use it
        if (this.frontLogoImage) {
            const baseWidth = 100 * this.scaleFactor; // Base width for front logo at 100% zoom (scaled)
            const baseHeight = 100 * this.scaleFactor; // Base height for front logo at 100% zoom (scaled)

            // Calculate dimensions to fit logo while maintaining aspect ratio
            const imgAspect = this.frontLogoImage.width / this.frontLogoImage.height;
            let drawWidth, drawHeight;

            if (imgAspect > baseWidth / baseHeight) {
                // Image is wider - fit to width
                drawWidth = baseWidth;
                drawHeight = drawWidth / imgAspect;
            } else {
                // Image is taller - fit to height
                drawHeight = baseHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // Apply zoom
            drawWidth *= this.frontLogoZoom;
            drawHeight *= this.frontLogoZoom;

            // Center the logo
            const drawX = x - drawWidth / 2;
            const drawY = y - drawHeight / 2;

            // Apply position offsets (base position + slider offset), scaled
            const finalX = drawX + (this.frontLogoBaseX * this.scaleFactor) + this.frontLogoPosX;
            const finalY = drawY + (this.frontLogoBaseY * this.scaleFactor) + this.frontLogoPosY;

            // Translate to center, rotate, translate back to draw position
            ctx.translate(finalX + drawWidth / 2, finalY + drawHeight / 2);
            ctx.rotate((this.frontLogoRotation * Math.PI) / 180);
            ctx.translate(-(finalX + drawWidth / 2), -(finalY + drawHeight / 2));

            // Draw the logo image
            ctx.drawImage(this.frontLogoImage, finalX, finalY, drawWidth, drawHeight);
        }

        ctx.restore();
    },

    /**
     * Create rounded rectangle path
     */
    createRoundedRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.arcTo(x + width, y, x + width, y + radius, radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.arcTo(x, y + height, x, y + height - radius, radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.arcTo(x, y, x + radius, y, radius);
        this.ctx.closePath();
    },

    /**
     * Draw rotated text on accent bar
     */
    drawAccentText() {
        this.ctx.save();

        const multiplier = this.showOverflowBorder ? (1 + this.overflowBorderPercent / 100) : 1;
        const renderWidth = Math.round(this.canvasWidth * multiplier);
        const renderHeight = Math.round(this.canvasHeight * multiplier);
        const offsetX = Math.round((renderWidth - this.canvasWidth) / 2);
        const offsetY = Math.round((renderHeight - this.canvasHeight) / 2);

        const scaledAccentWidth = this.accentWidth * this.scaleFactor;
        const accentX = offsetX + this.canvasWidth - scaledAccentWidth;
        const centerX = accentX + scaledAccentWidth / 2;

        // Set text properties
        this.ctx.fillStyle = this.textColor;
        const scaledFontSize = 40.90875 * this.scaleFactor;
        this.ctx.font = `${this.getFontWeightForRole('frontTop', 600)} ${scaledFontSize}px ${this.getFontFamilyForRole('frontTop')}`;

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';

        // Draw top text (rotated 90° counterclockwise + 180° flip) - SeoYeon with reduced letter spacing
        this.ctx.save();
        const scaledTopLetterSpacing = -2.045 * this.scaleFactor;
        this.ctx.letterSpacing = `${scaledTopLetterSpacing}px`;
        const scaledTopY = offsetY + 104 * this.scaleFactor;
        this.ctx.translate(centerX, scaledTopY + this.topTextHeight);
        this.ctx.rotate(-Math.PI / 2 + Math.PI);
        this.ctx.fillText(this.topText, 0, 0);
        this.ctx.restore();

        // Draw middle text (rotated 90° counterclockwise + 180° flip) - 100A with reduced letter spacing
        // Supports optional serial number: "100A#00001" renders as "100A #00001" with MatrixSSK for serial
        this.ctx.save();
        const scaledMiddleFontSize = 45 * this.scaleFactor;
        const middleFontWeight = this.getFontWeightForRole('frontMiddle', 550);
        const middleFontDeclaration = `${middleFontWeight} ${scaledMiddleFontSize}px ${this.getFontFamilyForRole('frontMiddle')}`;
        this.ctx.font = middleFontDeclaration;
        const scaledMiddleLetterSpacing = -1.975 * this.scaleFactor;
        this.ctx.letterSpacing = `${scaledMiddleLetterSpacing}px`;
        const serialCenteringOffset = this.getSerialCenteringOffset(this.ctx, this.middleText, middleFontDeclaration, scaledMiddleFontSize, scaledMiddleLetterSpacing);
        this.ctx.translate(centerX, offsetY + this.canvasHeight / 2.25 + this.middleTextHeight + serialCenteringOffset);
        this.ctx.rotate(-Math.PI / 2 + Math.PI);
        this.drawMiddleTextWithSerial(this.ctx, this.middleText, middleFontDeclaration, scaledMiddleFontSize, scaledMiddleLetterSpacing);
        this.ctx.restore();

        // Draw bottom text (rotated 90° clockwise) - tripleS with increased letter spacing
        this.ctx.save();

        // Calculate notch boundaries for bottom text positioning
        const scaledNotchHeight = this.notchHeight * this.scaleFactor;
        const notchY = offsetY + (this.canvasHeight - scaledNotchHeight) / 2;
        const notchBottom = notchY + scaledNotchHeight;
        const scaledDefaultBottomY = offsetY + this.canvasHeight - (227 * this.scaleFactor);

        // Measure text width to determine if it needs adjustment
        let textWidth = 0;
        const baseSpacing = -1.0973 * this.scaleFactor;

        if (this.bottomText === 'tripleS') {
            // Calculate width for special "tripleS" rendering
            const extraGap100 = Math.abs(baseSpacing);
            const extraGap50 = Math.abs(baseSpacing) * 0.5;
            const reducedGap = baseSpacing * 0.15;

            for (let i = 0; i < this.bottomText.length; i++) {
                const char = this.bottomText[i];
                const charWidth = this.ctx.measureText(char).width;
                textWidth += charWidth + baseSpacing;

                if (i === 0 || i === 1) textWidth += extraGap100;
                if (i === 5) textWidth += extraGap50;
                if (i === 6) textWidth -= reducedGap;
            }
        } else {
            // Measure standard text width
            this.ctx.letterSpacing = '-1.0973px';
            textWidth = this.ctx.measureText(this.bottomText).width;
        }

        // Calculate Y position, adjusting if text would overflow the notch
        const bottomMargin = 20 * this.scaleFactor; // Padding from the bottom edge of the notch
        let bottomTextY = scaledDefaultBottomY;
        const textEnd = scaledDefaultBottomY + textWidth; // After rotation, text extends upward (positive direction)

        if (textEnd > notchBottom - bottomMargin) {
            // Text overflows - align to right edge of notch with margin
            bottomTextY = notchBottom - textWidth - bottomMargin;
        }

        this.ctx.translate(centerX, bottomTextY + this.bottomTextHeight);
        this.ctx.rotate(Math.PI / 2);

        // Special handling for "tripleS" text with custom letter pair spacing
        if (this.bottomText === 'tripleS') {
            const extraGap100 = Math.abs(baseSpacing); // 100% increment (doubling the gap)
            const extraGap50 = Math.abs(baseSpacing) * 0.5; // 50% increment
            const reducedGap = baseSpacing * 0.15; // 15% reduction

            // Draw each character with custom spacing
            let xOffset = 0;
            for (let i = 0; i < this.bottomText.length; i++) {
                const char = this.bottomText[i];
                this.ctx.fillText(char, xOffset, 0);

                // Measure character width for next position
                const charWidth = this.ctx.measureText(char).width;
                xOffset += charWidth + baseSpacing;

                // Add 100% extra gap after 't' (index 0) and 'r' (index 1)
                if (i === 0 || i === 1) {
                    xOffset += extraGap100;
                }

                // Add 50% extra gap after 'l' (index 5)
                if (i === 5) {
                    xOffset += extraGap50;
                }

                // Reduce gap after 'e' (index 6)
                if (i === 6) {
                    xOffset -= reducedGap;
                }
            }
        } else {
            // Default rendering for other text
            this.ctx.letterSpacing = '-1.0973px';
            this.ctx.fillText(this.bottomText, 0, 0);
        }

        this.ctx.restore();

        this.ctx.restore();
    },

    /**
     * Render back side of the Objekt card
     * @returns {HTMLCanvasElement} Canvas with back side rendered
     */
    renderBackSide() {
        // Calculate canvas size with overflow (synced with front side)
        const multiplier = this.showOverflowBorder ? (1 + this.overflowBorderPercent / 100) : 1;
        const renderWidth = Math.round(this.canvasWidth * multiplier);
        const renderHeight = Math.round(this.canvasHeight * multiplier);
        const offsetX = Math.round((renderWidth - this.canvasWidth) / 2);
        const offsetY = Math.round((renderHeight - this.canvasHeight) / 2);

        // Create a new canvas for the back side
        const backCanvas = document.createElement('canvas');
        backCanvas.width = renderWidth;
        backCanvas.height = renderHeight;
        const backCtx = backCanvas.getContext('2d');

        // Enable high quality rendering
        backCtx.imageSmoothingEnabled = true;
        backCtx.imageSmoothingQuality = 'high';

        // Clear and draw gray background if overflow enabled
        backCtx.clearRect(0, 0, renderWidth, renderHeight);
        if (this.showOverflowBorder) {
            backCtx.fillStyle = '#D3D3D3';
            backCtx.fillRect(0, 0, renderWidth, renderHeight);
        }

        // Offset all drawing by overflow border amount
        backCtx.save();
        backCtx.translate(offsetX, offsetY);

        // Draw rounded rectangle background (white)
        const scaledCornerRadius = this.cornerRadius * this.scaleFactor;

        // If user uploaded a custom back image, render it like the front side
        if (this.backUploadedImage) {
            // Create a temporary canvas for the image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvasWidth;
            tempCanvas.height = this.canvasHeight;
            const tempCtx = tempCanvas.getContext('2d');

            // Calculate image dimensions (cover mode)
            const imgAspect = this.backUploadedImage.width / this.backUploadedImage.height;
            const fullAspect = this.canvasWidth / this.canvasHeight;
            let drawWidth, drawHeight;

            if (imgAspect > fullAspect) {
                drawHeight = this.canvasHeight * this.backImageScale;
                drawWidth = drawHeight * imgAspect;
            } else {
                drawWidth = this.canvasWidth * this.backImageScale;
                drawHeight = drawWidth / imgAspect;
            }

            const xPos = (this.canvasWidth - drawWidth) / 2 + this.backImagePosX;
            const yPos = (this.canvasHeight - drawHeight) / 2 + this.backImagePosY;

            tempCtx.drawImage(this.backUploadedImage, xPos, yPos, drawWidth, drawHeight);

            // Clip to rounded rectangle and draw
            backCtx.save();
            this.createRoundedRectOnContext(backCtx, 0, 0, this.canvasWidth, this.canvasHeight, scaledCornerRadius);
            backCtx.clip();
            backCtx.drawImage(tempCanvas, 0, 0);
            backCtx.restore();

            // Draw accent bar (notch) on right side if objekt border is enabled
            if (this.showObjektBorder) {
                const scaledAccentWidth = this.accentWidth * this.scaleFactor;
                const scaledNotchHeight = this.notchHeight * this.scaleFactor;
                const accentX = this.canvasWidth - scaledAccentWidth;
                const notchY = (this.canvasHeight - scaledNotchHeight) / 2;
                const notchRadius = 20 * this.scaleFactor;

                backCtx.save();
                backCtx.beginPath();
                backCtx.moveTo(accentX, notchY + notchRadius);
                backCtx.arcTo(accentX, notchY, accentX + notchRadius, notchY, notchRadius);
                backCtx.lineTo(this.canvasWidth, notchY);
                backCtx.lineTo(this.canvasWidth, notchY + scaledNotchHeight);
                backCtx.lineTo(accentX + notchRadius, notchY + scaledNotchHeight);
                backCtx.arcTo(accentX, notchY + scaledNotchHeight, accentX, notchY + scaledNotchHeight - notchRadius, notchRadius);
                backCtx.closePath();

                if (this.borderImage) {
                    backCtx.clip();
                    const notchAspect = scaledAccentWidth / scaledNotchHeight;
                    const bImgAspect = this.borderImage.width / this.borderImage.height;
                    let bDrawW, bDrawH, bOffX = 0, bOffY = 0;
                    if (bImgAspect > notchAspect) {
                        bDrawH = scaledNotchHeight;
                        bDrawW = bDrawH * bImgAspect;
                        bOffX = (scaledAccentWidth - bDrawW) / 2;
                    } else {
                        bDrawW = scaledAccentWidth;
                        bDrawH = bDrawW / bImgAspect;
                        bOffY = (scaledNotchHeight - bDrawH) / 2;
                    }
                    backCtx.drawImage(this.borderImage, accentX + bOffX, notchY + bOffY, bDrawW, bDrawH);
                } else {
                    backCtx.fillStyle = this.accentColor;
                    backCtx.fill();
                }
                backCtx.restore();
            }

            // Render back side template overlay if enabled
            this.renderTemplateOverlayBack(backCtx, renderWidth, renderHeight);

            // Restore the overflow border translation
            backCtx.restore();

            return backCanvas;
        }

        backCtx.save();
        this.createRoundedRectOnContext(backCtx, 0, 0, this.canvasWidth, this.canvasHeight, scaledCornerRadius);
        backCtx.fillStyle = '#FFFFFF'; // White background
        backCtx.fill();
        backCtx.restore();

        // Draw yellow rectangle with corner rounding
        // Width calculation: white background decreased by 16.22%, so yellow box expands
        // Original white width: accentWidth (82.61793)
        // New white width: accentWidth * (1 - 0.1622) = accentWidth * 0.8378
        const scaledAccentWidth = this.accentWidth * this.scaleFactor;
        const whiteBackgroundWidth = scaledAccentWidth * 0.8378;
        const rectWidth = this.canvasWidth - whiteBackgroundWidth;

        // Height calculation: top and bottom white parts decreased by 15.625%
        // Original top/bottom white height: accentWidth (82.61793)
        // New top/bottom white height: accentWidth * (1 - 0.15625) = accentWidth * 0.84375
        const whiteBackgroundHeight = scaledAccentWidth * 0.84375;
        const rectHeight = this.canvasHeight - (2 * whiteBackgroundHeight);

        const rectX = 0;
        const rectY = whiteBackgroundHeight;
        const rectRadius = 26 * this.scaleFactor; // Corner radius for the info block (scaled)

        backCtx.save();
        // Draw content panel with rounded corners only on right side (top-right and bottom-right)
        this.createPartiallyRoundedRect(backCtx, rectX, rectY, rectWidth, rectHeight, rectRadius);

        // If border image is set, use it; otherwise use color (same as front side)
        if (this.borderImage) {
            // Clip and draw the border image
            backCtx.clip();

            // Calculate dimensions to cover the info block area (zoom to fill, don't stretch)
            const blockAspect = rectWidth / rectHeight;
            const imgAspect = this.borderImage.width / this.borderImage.height;

            let drawWidth, drawHeight;
            let offsetX = 0, offsetY = 0;

            if (imgAspect > blockAspect) {
                // Image is wider - fit to height and crop sides
                drawHeight = rectHeight;
                drawWidth = drawHeight * imgAspect;
                offsetX = (rectWidth - drawWidth) / 2;
            } else {
                // Image is taller - fit to width and crop top/bottom
                drawWidth = rectWidth;
                drawHeight = drawWidth / imgAspect;
                offsetY = (rectHeight - drawHeight) / 2;
            }

            // Draw the border image to cover the info block area
            backCtx.drawImage(
                this.borderImage,
                rectX + offsetX,
                rectY + offsetY,
                drawWidth,
                drawHeight
            );
        } else {
            // Use solid color
            backCtx.fillStyle = this.accentColor; // Yellow color (inherits from front)
            backCtx.fill();
        }

        backCtx.restore();

        // Draw top logo if present, otherwise draw filled hexagonal cube logo at top left (preview only)
        if (this.topLogoImage) {
            this.drawTopLogo(backCtx, this.topLogoBaseX * this.scaleFactor, this.topLogoBaseY * this.scaleFactor);
        } else if (!this.isExporting) {
            this.drawFilledHexCubeIcon(backCtx, 47 * this.scaleFactor, 110 * this.scaleFactor);
        }

        // Draw the text content on the left side
        backCtx.fillStyle = this.textColor;
        backCtx.textAlign = 'left';
        backCtx.textBaseline = 'top';

        const leftMargin = 47 * this.scaleFactor;

        // Calculate divider positions based on info block proportions
        // Info block is 100 units tall, dividers at: 17.5, 32.5, 47.5, 62.5, 83.5
        const divider1Y = rectY + (rectHeight * 0.175); // 17.5 units
        const divider2Y = rectY + (rectHeight * 0.325); // 32.5 units
        const divider3Y = rectY + (rectHeight * 0.475); // 47.5 units
        const divider4Y = rectY + (rectHeight * 0.625); // 62.5 units
        const divider5Y = rectY + (rectHeight * 0.835); // 83.5 units

        // Calculate white square position and size for divider line endpoint
        const squareSize = divider5Y - divider4Y;
        const whiteBoxX = rectX + (rectWidth * 0.52);
        const whiteBoxRightEdge = whiteBoxX + squareSize;

        // Draw horizontal divider line 1 (1px solid line)
        backCtx.fillRect(leftMargin, divider1Y, whiteBoxRightEdge - leftMargin, 1);

        // NAME section
        const scaledLabelFontSize = 29.828 * this.scaleFactor;
        backCtx.font = `${this.getFontWeightForRole('backLabel', 400)} ${scaledLabelFontSize}px ${this.getFontFamilyForRole('backLabel')}`;
        backCtx.letterSpacing = '0px';
        backCtx.fillText(this.backNameLabel, leftMargin, divider1Y + (10 * this.scaleFactor));

        const scaledValueFontSize = 88 * this.scaleFactor;
        backCtx.font = `${this.getFontWeightForRole('backValue', 500)} ${scaledValueFontSize}px ${this.getFontFamilyForRole('backValue')}`;
        const scaledLetterSpacing = -1 * this.scaleFactor;
        backCtx.letterSpacing = `${scaledLetterSpacing}px`;
        // Use stroke to make it slightly thicker than 500 but thinner than 600
        backCtx.strokeStyle = this.textColor;
        backCtx.lineWidth = 2 * this.scaleFactor;
        backCtx.strokeText(this.backNameValue, leftMargin, divider1Y + (58 * this.scaleFactor));
        backCtx.fillStyle = this.textColor;
        backCtx.fillText(this.backNameValue, leftMargin, divider1Y + (58 * this.scaleFactor));

        // Horizontal divider 2 (1px solid line)
        backCtx.fillRect(leftMargin, divider2Y, whiteBoxRightEdge - leftMargin, 1);

        // CLASS section
        backCtx.font = `${this.getFontWeightForRole('backLabel', 400)} ${scaledLabelFontSize}px ${this.getFontFamilyForRole('backLabel')}`;
        backCtx.letterSpacing = '0px';
        backCtx.fillText(this.backClassLabel, leftMargin, divider2Y + (10 * this.scaleFactor));

        backCtx.font = `${this.getFontWeightForRole('backValue', 500)} ${scaledValueFontSize}px ${this.getFontFamilyForRole('backValue')}`;
        const scaledClassLetterSpacing = -1.67 * this.scaleFactor;
        backCtx.letterSpacing = `${scaledClassLetterSpacing}px`;
        // Use stroke to make it slightly thicker than 500 but thinner than 600
        backCtx.strokeStyle = this.textColor;
        backCtx.lineWidth = 2 * this.scaleFactor;
        backCtx.strokeText(this.backClassValue, leftMargin, divider2Y + (58 * this.scaleFactor));
        backCtx.fillStyle = this.textColor;
        backCtx.fillText(this.backClassValue, leftMargin, divider2Y + (58 * this.scaleFactor));

        // Horizontal divider 3 (1px solid line)
        backCtx.fillRect(leftMargin, divider3Y, whiteBoxRightEdge - leftMargin, 1);

        // SEASON section
        backCtx.font = `${this.getFontWeightForRole('backLabel', 400)} ${scaledLabelFontSize}px ${this.getFontFamilyForRole('backLabel')}`;
        backCtx.letterSpacing = '0px';
        backCtx.fillText(this.backSeasonLabel, leftMargin, divider3Y + (10 * this.scaleFactor));

        // Draw SEASON value with special handling for outline "02"
        this.drawSeasonTextWithOutline(backCtx, this.backSeasonValue, leftMargin, divider3Y + (56 * this.scaleFactor));

        // Horizontal divider 4 (1px solid line)
        backCtx.fillRect(leftMargin, divider4Y, whiteBoxRightEdge - leftMargin, 1);

        // Draw signature on the left side of the lower area
        const signatureWidth = 220;
        const signatureHeight = squareSize;
        const signatureX = leftMargin + 30;
        const signatureY = divider4Y + (squareSize - signatureHeight) / 2;
        this.drawSignature(backCtx, signatureX, signatureY, signatureWidth, signatureHeight);

        // Draw white square (whiteBoxX and squareSize already calculated above)
        const whiteBoxY = divider4Y;
        backCtx.fillStyle = '#FFFFFF';
        backCtx.fillRect(whiteBoxX, whiteBoxY, squareSize, squareSize);

        // Add black border to white square (1px like divider lines)
        backCtx.strokeStyle = '#000000'; // Always black for QR code border
        backCtx.lineWidth = 1;
        backCtx.strokeRect(whiteBoxX, whiteBoxY, squareSize, squareSize);

        // Draw QR code inside the white square
        // Prioritize qrCodeCanvas as it's more reliable than the image
        const qrSource = this.qrCodeCanvas || this.qrCodeImage;

        if (qrSource && (this.qrCodeCanvas || (this.qrCodeImage && this.qrCodeImage.complete))) {
            // Save context state before drawing QR code
            backCtx.save();

            // Set important rendering properties to ensure QR code is visible
            backCtx.globalAlpha = 1.0; // Force full opacity
            backCtx.globalCompositeOperation = 'source-over'; // Ensure normal blending

            // Add padding inside the white box for the QR code (reduced to 5% for thinner border)
            const qrPadding = squareSize * 0.05; // 5% padding (half of previous 10%)
            const qrSize = squareSize - (qrPadding * 2);
            const qrX = whiteBoxX + qrPadding;
            const qrY = whiteBoxY + qrPadding;

            // Draw QR code with high quality settings
            backCtx.imageSmoothingEnabled = false; // Disable smoothing for crisp QR code
            backCtx.drawImage(qrSource, qrX, qrY, qrSize, qrSize);

            // Restore context state
            backCtx.restore();
        }

        // Horizontal divider 5 at bottom (1px solid line)
        backCtx.fillStyle = this.textColor;
        backCtx.fillRect(leftMargin, divider5Y, whiteBoxRightEdge - leftMargin, 1);

        // Draw rotated text on the sides
        backCtx.save();
        // Position text at the right edge of the yellow info block
        const scaledAccentWidth2 = this.accentWidth * this.scaleFactor;
        const whiteBackgroundWidth2 = scaledAccentWidth2 * 0.8378;
        const rectWidth2 = this.canvasWidth - whiteBackgroundWidth2;
        const rectY2 = scaledAccentWidth2 * 0.84375;
        const rectHeight2 = this.canvasHeight - (2 * rectY2);
        const rightGap = rectWidth2 * 0.04; // 4% of info block width from right edge
        const textX = rectWidth2 - rightGap - (18 * this.scaleFactor);
        const topGap = rectHeight2 * 0.04; // 4% of info block height from top edge
        const bottomGap = 30 * this.scaleFactor; // Gap from bottom of info block

        // Draw "SeoYeon" (name) - aligned to top corner of info block
        const scaledRotatedFontSize = 41.18 * this.scaleFactor;
        backCtx.translate(textX, rectY2 + topGap - (10 * this.scaleFactor) + this.backTopTextHeight);
        backCtx.rotate(Math.PI / 2); // Rotate 90 degrees clockwise

        backCtx.fillStyle = this.textColor;
        backCtx.font = `${this.getFontWeightForRole('backRotated', 600)} ${scaledRotatedFontSize}px ${this.getFontFamilyForRole('backRotated')}`;
        backCtx.textAlign = 'left';
        backCtx.textBaseline = 'middle';
        const scaledRotatedLetterSpacing = -1.5 * this.scaleFactor;
        backCtx.letterSpacing = `${scaledRotatedLetterSpacing}px`;
        backCtx.fillText(this.backNameValue, 0, 0);
        backCtx.restore();

        // Draw group name text (e.g., "tripleS") - aligned to bottom corner of info block
        backCtx.save();
        backCtx.translate(textX, rectY2 + rectHeight2 - bottomGap - (135 * this.scaleFactor) + this.backBottomTextHeight);
        backCtx.rotate(Math.PI / 2); // Rotate 90 degrees clockwise

        backCtx.fillStyle = this.textColor;
        backCtx.font = `${this.getFontWeightForRole('backRotated', 600)} ${scaledRotatedFontSize}px ${this.getFontFamilyForRole('backRotated')}`;
        backCtx.textAlign = 'left';
        backCtx.textBaseline = 'middle';

        // Special handling for "tripleS" text with custom letter pair spacing (same as front page)
        const text = this.backGroupName;
        const baseSpacing = -1.5 * this.scaleFactor; // Base letter spacing for this text (scaled)
        const extraGap100 = Math.abs(baseSpacing); // 100% increment (doubling the gap)
        const extraGap50 = Math.abs(baseSpacing) * 0.5; // 50% increment
        const reducedGap = baseSpacing * 0.15; // 15% reduction

        // Draw each character with custom spacing
        let xOffset = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            backCtx.fillText(char, xOffset, 0);

            // Measure character width for next position
            const charWidth = backCtx.measureText(char).width;
            xOffset += charWidth + baseSpacing;

            // Special spacing adjustments only apply if text is exactly "tripleS"
            if (text === 'tripleS') {
                // Add 100% extra gap after 't' (index 0) and 'r' (index 1)
                if (i === 0 || i === 1) {
                    xOffset += extraGap100;
                }

                // Add 50% extra gap after 'l' (index 5)
                if (i === 5) {
                    xOffset += extraGap50;
                }

                // Reduce gap after 'e' (index 6)
                if (i === 6) {
                    xOffset -= reducedGap;
                }
            }
        }

        backCtx.restore();

        // Draw back side logo if present
        if (this.logoImage) {
            // Position logo inside the yellow info block border
            const whiteBackgroundWidth = this.accentWidth * 0.8378;
            const rectWidth = this.canvasWidth - whiteBackgroundWidth;
            const whiteBackgroundHeight = this.accentWidth * 0.84375;
            const rectHeight = this.canvasHeight - (2 * whiteBackgroundHeight);
            const rectX = 0;
            const rectY = whiteBackgroundHeight;

            // Center the logo within the yellow info block
            const centerX = rectX + rectWidth / 2;
            const centerY = rectY + rectHeight / 2;
            this.drawLogo(backCtx, centerX, centerY);
        }

        // Render back side template overlay if enabled
        this.renderTemplateOverlayBack(backCtx, renderWidth, renderHeight);

        // Restore the overflow border translation
        backCtx.restore();

        return backCanvas;
    },

    /**
     * Draw back side logo image
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    drawLogo(ctx, x, y) {
        ctx.save();

        // If a logo image is uploaded, use it
        if (this.logoImage) {
            const baseWidth = 80 * this.scaleFactor; // Base width for logo at 100% zoom (scaled)
            const baseHeight = 80 * this.scaleFactor; // Base height for logo at 100% zoom (scaled)

            // Calculate dimensions to fit logo while maintaining aspect ratio
            const imgAspect = this.logoImage.width / this.logoImage.height;
            let drawWidth, drawHeight;

            if (imgAspect > baseWidth / baseHeight) {
                // Image is wider - fit to width
                drawWidth = baseWidth;
                drawHeight = drawWidth / imgAspect;
            } else {
                // Image is taller - fit to height
                drawHeight = baseHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // Apply zoom
            drawWidth *= this.logoZoom;
            drawHeight *= this.logoZoom;

            // Center the logo
            const drawX = x - drawWidth / 2;
            const drawY = y - drawHeight / 2;

            // Apply position offsets (base position + slider offset), scaled
            const finalX = drawX + (this.logoBaseX * this.scaleFactor) + this.logoPosX;
            const finalY = drawY + (this.logoBaseY * this.scaleFactor) + this.logoPosY;

            // Translate to center, rotate, translate back to draw position
            ctx.translate(finalX + drawWidth / 2, finalY + drawHeight / 2);
            ctx.rotate((this.logoRotation * Math.PI) / 180);
            ctx.translate(-(finalX + drawWidth / 2), -(finalY + drawHeight / 2));

            // Draw the logo image
            ctx.drawImage(this.logoImage, finalX, finalY, drawWidth, drawHeight);
        }

        ctx.restore();
    },

    /**
     * Draw top logo image (replaces hex cube)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position (already scaled by caller)
     * @param {number} y - Y position (already scaled by caller)
     */
    drawTopLogo(ctx, x, y) {
        ctx.save();

        if (this.topLogoImage) {
            const baseWidth = 100 * this.scaleFactor; // Base width for top logo at 100% zoom (scaled)
            const baseHeight = 100 * this.scaleFactor; // Base height for top logo at 100% zoom (scaled)

            // Calculate dimensions to fit logo while maintaining aspect ratio
            const imgAspect = this.topLogoImage.width / this.topLogoImage.height;
            let drawWidth, drawHeight;

            if (imgAspect > baseWidth / baseHeight) {
                // Image is wider - fit to width
                drawWidth = baseWidth;
                drawHeight = drawWidth / imgAspect;
            } else {
                // Image is taller - fit to height
                drawHeight = baseHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // Apply zoom
            drawWidth *= this.topLogoZoom;
            drawHeight *= this.topLogoZoom;

            // Center the logo at the base position
            const centerX = x - drawWidth / 2;
            const centerY = y - drawHeight / 2;

            // Apply position offsets (base position + slider offset)
            const finalX = centerX + this.topLogoPosX;
            const finalY = centerY + this.topLogoPosY;

            // Translate to center, rotate, translate back to draw position
            ctx.translate(finalX + drawWidth / 2, finalY + drawHeight / 2);
            ctx.rotate((this.topLogoRotation * Math.PI) / 180);
            ctx.translate(-(finalX + drawWidth / 2), -(finalY + drawHeight / 2));

            // Draw the top logo image
            ctx.drawImage(this.topLogoImage, finalX, finalY, drawWidth, drawHeight);
        }

        ctx.restore();
    },

    /**
     * Draw outlined hexagonal cube logo (matching the reference card logo)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position (already scaled by caller)
     * @param {number} y - Y position (already scaled by caller)
     */
    drawFilledHexCubeIcon(ctx, x, y) {
        const size = 100 * this.scaleFactor;
        ctx.save();
        ctx.strokeStyle = this.textColor;
        ctx.lineWidth = 3.5 * this.scaleFactor;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';

        // Draw outlined hexagonal cube (isometric style)
        const w = size * 0.65;
        const h = size * 0.75;

        // Top face (diamond/rhombus) - outline only
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h * 0.25);
        ctx.lineTo(x + w / 2, y + h * 0.5);
        ctx.lineTo(x, y + h * 0.25);
        ctx.closePath();
        ctx.stroke();

        // Left face - outline only
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.25);
        ctx.lineTo(x + w / 2, y + h * 0.5);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h * 0.75);
        ctx.closePath();
        ctx.stroke();

        // Right face - outline only
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h * 0.5);
        ctx.lineTo(x + w, y + h * 0.25);
        ctx.lineTo(x + w, y + h * 0.75);
        ctx.lineTo(x + w / 2, y + h);
        ctx.closePath();
        ctx.stroke();

        // Add internal vertical line for detail
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h);
        ctx.stroke();

        ctx.restore();
    },

    /**
     * Parse middle text to split off a serial number (#XXXXX) from the main text.
     * If the text contains a '#' followed by digits, returns { mainText, serial }.
     * The main text gets a trailing space added before the serial portion.
     * @param {string} text - Raw middle text (e.g. "100A#00001")
     * @returns {{ mainText: string, serial: string|null }}
     */
    parseMiddleTextSerial(text) {
        const hashIndex = text.indexOf('#');
        if (hashIndex === -1) return { mainText: text, serial: null };

        const after = text.slice(hashIndex + 1);
        // Only treat as serial if what follows the '#' is purely digits
        if (!/^\d+$/.test(after)) return { mainText: text, serial: null };

        const mainText = text.slice(0, hashIndex);
        return { mainText, serial: '#' + after };
    },

    /**
     * Draw middle text with serial number support.
     * If the text contains a '#NNNNN' serial, the part before '#' is drawn in the
     * main font, a space is inserted, then '#NNNNN' is drawn in MatrixSSK Regular
     * at the same font weight. Both parts share the same font size and baseline.
     *
     * This is called inside an already-transformed context (translated + rotated)
     * so it draws centred at (0, 0) just like the original fillText call.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context (already transformed)
     * @param {string} text - Raw middle text
     * @param {string} fontDeclaration - Full CSS font string for the main font (size already scaled)
     * @param {number} scaledFontSize - Font size in px (already scaled)
     * @param {number} scaledLetterSpacing - Letter spacing in px (already scaled)
     */
    /**
     * Compute the Y-translation correction needed to re-center the middle text
     * when a serial number is present. Because the text is rotated 90°, the
     * serial's extra rendered width shifts the visual center upward; this returns
     * a downward offset (positive Y) to compensate.
     *
     * Calibrated against: "100A #10006" (5-digit serial) → -57px at scaleFactor=1.
     * Formula: offset = -(serialExtraWidth / 2) * calibrationFactor
     * where serialExtraWidth = space + '#' + extraGap + digits (all measured).
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text - Raw middle text (e.g. "100A#10006")
     * @param {string} fontDeclaration - CSS font string for main text
     * @param {number} scaledFontSize - Scaled font size in px
     * @param {number} scaledLetterSpacing - Letter spacing for main text in px
     * @returns {number} Y offset in canvas pixels (negative = shift up)
     */
    getSerialCenteringOffset(ctx, text, fontDeclaration, scaledFontSize, scaledLetterSpacing) {
        const { serial } = this.parseMiddleTextSerial(text);
        if (!serial) return 0;

        const serialLetterSpacing = 2 * this.scaleFactor;
        const digitsLetterSpacing = 4 * this.scaleFactor;
        const hashExtraGap = 3 * this.scaleFactor;
        const serialFont = `550 ${scaledFontSize}px "MatrixSSK", monospace`;

        // Measure space width using main font
        ctx.font = fontDeclaration;
        ctx.letterSpacing = `${scaledLetterSpacing}px`;
        const spaceWidth = ctx.measureText(' ').width;

        // Measure '#' and digits widths using serial font
        ctx.font = serialFont;
        ctx.letterSpacing = `${serialLetterSpacing}px`;
        const hashWidth = ctx.measureText('#').width + serialLetterSpacing + hashExtraGap;
        const digits = serial.slice(1);
        // Each digit contributes its width + digits letter spacing (trailing spacing on last char is included
        // in measureText for centering purposes since it offsets visually)
        ctx.letterSpacing = `${digitsLetterSpacing}px`;
        const digitsWidth = ctx.measureText(digits).width + digitsLetterSpacing * digits.length;

        const serialExtraWidth = spaceWidth + hashWidth + digitsWidth;

        // Calibration: reference "100A #10006" (5 digits) produced -57px offset at scaleFactor=1.
        // serialExtraWidth for that case divided by 2 should equal 57px * scaleFactor.
        // We apply a calibration factor derived from this reference.
        // calibrationFactor = (57 * scaleFactor) / (referenceSerialExtraWidth / 2)
        // Since we can't re-measure the reference here, we use the ratio approach:
        // offset = -(serialExtraWidth / 2) * (57 / referenceHalfWidth)
        // referenceHalfWidth ≈ 57px at scaleFactor=1, so calibrationFactor ≈ 1.0 if formula is accurate.
        // We trust the measurement and return half-width as the offset directly.
        return -(serialExtraWidth / 2);
    },

    drawMiddleTextWithSerial(ctx, text, fontDeclaration, scaledFontSize, scaledLetterSpacing) {
        const { mainText, serial } = this.parseMiddleTextSerial(text);

        if (!serial) {
            // No serial — draw as before
            ctx.fillText(text, 0, 0);
            return;
        }

        // Measure main text width so the serial can be positioned immediately after.
        ctx.font = fontDeclaration;
        ctx.letterSpacing = `${scaledLetterSpacing}px`;

        // Add a space between mainText and the serial
        const spacer = ' ';
        const mainWithSpace = mainText + spacer;
        const mainWidth = ctx.measureText(mainWithSpace).width;

        const serialFont = `550 ${scaledFontSize}px "MatrixSSK", monospace`;

        // Draw main text part starting from x=0 (same as original fillText call)
        ctx.font = fontDeclaration;
        ctx.letterSpacing = `${scaledLetterSpacing}px`;
        ctx.fillText(mainWithSpace, 0, 0);

        // Draw serial part in MatrixSSK immediately after main text
        // Fixed weight 550, +2px letter spacing for '#', +4px letter spacing between digits, +3px extra gap after '#'
        const serialLetterSpacing = 2 * this.scaleFactor;
        const digitsLetterSpacing = 4 * this.scaleFactor;
        const hashExtraGap = 3 * this.scaleFactor;
        ctx.font = serialFont;
        ctx.letterSpacing = `${serialLetterSpacing}px`;

        // Draw '#' then the digits separately to insert extra gap between them
        const hash = serial[0]; // '#'
        const digits = serial.slice(1);
        ctx.fillText(hash, mainWidth, 0);
        const hashWidth = ctx.measureText(hash).width + serialLetterSpacing + hashExtraGap;
        ctx.letterSpacing = `${digitsLetterSpacing}px`;
        ctx.fillText(digits, mainWidth + hashWidth, 0);
    },

    /**
     * Draw season text with outline style for numbers (like "Atom02" where "02" is outlined)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {string} text - Season text (e.g., "Atom02")
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    drawSeasonTextWithOutline(ctx, text, x, y) {
        ctx.save();
        const scaledFontSize = 88 * this.scaleFactor;
        ctx.font = `${this.getFontWeightForRole('backValue', 500)} ${scaledFontSize}px ${this.getFontFamilyForRole('backValue')}`;
        const scaledLetterSpacing = -1.67 * this.scaleFactor;
        ctx.letterSpacing = `${scaledLetterSpacing}px`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Check if text ends with numbers (like "02")
        const numberMatch = text.match(/^([A-Za-z]+)(\d+)$/);

        if (numberMatch) {
            const textPart = numberMatch[1]; // e.g., "Atom"
            const numberPart = numberMatch[2]; // e.g., "02"

            // Draw text part with stroke + fill for slightly thicker appearance
            ctx.strokeStyle = this.textColor;
            ctx.lineWidth = 3 * this.scaleFactor;
            ctx.strokeText(textPart, x, y);
            ctx.fillStyle = this.textColor;
            ctx.fillText(textPart, x, y);

            // Measure text part width
            const textWidth = ctx.measureText(textPart).width;

            // Draw number part (outlined)
            ctx.strokeStyle = this.textColor;
            ctx.lineWidth = 2.0 * this.scaleFactor;
            ctx.strokeText(numberPart, x + textWidth - (3 * this.scaleFactor), y);
        } else {
            // If no numbers, just draw normally with stroke + fill
            ctx.strokeStyle = this.textColor;
            ctx.lineWidth = 0.5 * this.scaleFactor;
            ctx.strokeText(text, x, y);
            ctx.fillStyle = this.textColor;
            ctx.fillText(text, x, y);
        }

        ctx.restore();
    },

    /**
     * Draw signature in the signature area (left side, next to white box)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - Signature X position
     * @param {number} y - Signature Y position
     * @param {number} _width - Signature area width (unused)
     * @param {number} height - Signature area height
     */
    drawSignature(ctx, x, y, _width, height) {
        ctx.save();

        // If a signature image is uploaded, use it
        if (this.signatureImage) {
            const baseWidth = 220 * this.scaleFactor; // Base width for signature at 100% zoom (scaled)
            const maxHeight = height; // Use available height as reference

            // Calculate dimensions to fit signature while maintaining aspect ratio
            const imgAspect = this.signatureImage.width / this.signatureImage.height;
            let drawWidth, drawHeight;

            if (imgAspect > baseWidth / maxHeight) {
                // Image is wider - fit to width
                drawWidth = baseWidth;
                drawHeight = drawWidth / imgAspect;
            } else {
                // Image is taller - fit to height
                drawHeight = maxHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // Apply zoom
            drawWidth *= this.signatureZoom;
            drawHeight *= this.signatureZoom;

            // Center the signature vertically in the available space (before zoom)
            // This allows the signature to overflow and overlap divider lines
            // Apply position offsets
            const drawX = x + this.signaturePosX;
            const drawY = y + (height - drawHeight) / 2 + this.signaturePosY;

            // Draw the signature image with transparency preserved
            // No clipping - allow overflow
            ctx.drawImage(this.signatureImage, drawX, drawY, drawWidth, drawHeight);
        } else if (!this.isExporting) {
            // Draw default procedural signature (preview only, not during export)
            ctx.strokeStyle = this.textColor;
            ctx.lineWidth = 2 * this.scaleFactor;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const centerY = y + height / 2;
            const scale = this.scaleFactor;

            // Draw a flowing cursive signature
            ctx.beginPath();

            // First swooping curve
            ctx.moveTo(x, centerY - 10);
            ctx.bezierCurveTo(
                x + 30, centerY - 35,
                x + 50, centerY + 20,
                x + 80, centerY - 5
            );

            // Middle flowing part
            ctx.bezierCurveTo(
                x + 110, centerY - 25,
                x + 130, centerY + 15,
                x + 160, centerY + 5
            );

            // Final tail
            ctx.bezierCurveTo(
                x + 180, centerY - 10,
                x + 200, centerY + 10,
                x + 220, centerY
            );

            ctx.stroke();

            // Add a subtle underline below the signature
            ctx.beginPath();
            ctx.moveTo(x + 10, centerY + 40);
            ctx.lineTo(x + 200, centerY + 40);
            ctx.stroke();
        }

        ctx.restore();
    },

    /**
     * Create rounded rectangle path on a given context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Corner radius
     */
    createRoundedRectOnContext(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        ctx.lineTo(x + radius, y + height);
        ctx.arcTo(x, y + height, x, y + height - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    },

    /**
     * Create partially rounded rectangle path (only top-right and bottom-right corners rounded)
     * Used for the content panel on the back side
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Corner radius for top-right and bottom-right
     */
    createPartiallyRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        // Start at top-left (no rounding)
        ctx.moveTo(x, y);
        // Top edge to top-right corner (with rounding)
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        // Right edge to bottom-right corner (with rounding)
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        // Bottom edge to bottom-left (no rounding)
        ctx.lineTo(x, y + height);
        // Left edge back to top-left (no rounding)
        ctx.lineTo(x, y);
        ctx.closePath();
    },

    // ─── Video Export ───

    async exportAsVideo(duration = null) {
        try {
            // Auto-detect duration
            if (!duration) {
                if (this.mediaType === 'video' && this.videoData.element) {
                    duration = this.videoData.element.duration;
                } else if (this.mediaType === 'gif' && this.gifData.delays.length > 0) {
                    duration = this.gifData.delays.reduce((sum, d) => sum + d, 0) / 1000;
                } else {
                    duration = 5;
                }
            }
            // Cap at 30 seconds
            duration = Math.min(duration, 30);

            const exportWidth = this.canvas.width;
            const exportHeight = this.canvas.height;

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = exportWidth;
            exportCanvas.height = exportHeight;
            const exportCtx = exportCanvas.getContext('2d');

            const stream = exportCanvas.captureStream(30);

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

            const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedFormat.type });
            const chunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
            };

            // Reset media to start before recording
            if (this.mediaType === 'video' && this.videoData.element) {
                this.videoData.element.currentTime = 0;
            } else if (this.mediaType === 'gif') {
                this.gifData.currentFrame = 0;
                this.gifData.lastFrameTime = performance.now();
                this.uploadedImage = this.gifData.frames[0];
            }

            let animationId;
            const renderExportFrame = () => {
                this.render();
                exportCtx.clearRect(0, 0, exportWidth, exportHeight);
                exportCtx.drawImage(this.canvas, 0, 0);
                animationId = requestAnimationFrame(renderExportFrame);
            };

            return new Promise((resolve, reject) => {
                mediaRecorder.onstop = () => {
                    if (animationId) cancelAnimationFrame(animationId);
                    const blob = new Blob(chunks, { type: selectedFormat.type });
                    console.log(`Video encoding complete! ${exportWidth}x${exportHeight}`);
                    resolve({ blob, mimeType: selectedFormat.type, extension: selectedFormat.ext });
                };

                mediaRecorder.onerror = (error) => {
                    if (animationId) cancelAnimationFrame(animationId);
                    reject(error);
                };

                renderExportFrame();
                mediaRecorder.start();
                console.log(`Recording video at ${exportWidth}x${exportHeight} for ${duration}s...`);

                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                }, duration * 1000);
            });
        } catch (error) {
            console.error('Error exporting video:', error);
            throw error;
        }
    },

    /**
     * Export canvas as downloadable image
     * @param {Array} textOverlays - Array of text overlay objects (not used anymore)
     * @param {string} format - Export format ('png' or 'jpeg')
     * @param {string} filename - Download filename (optional, will be generated based on settings)
     */
    async exportImage(textOverlays = [], format = 'png', filename = null) {
        // Temporarily hide template overlays during export (Phase 3)
        const templateWasVisible = this.showTemplate;
        const templateBackWasVisible = this.showTemplateBack;
        if (templateWasVisible) {
            this.showTemplate = false;
            this.render(); // Re-render without template
        }
        if (templateBackWasVisible) {
            this.showTemplateBack = false;
        }

        // Generate filename based on settings if not provided
        if (!filename) {
            if (this.showObjektBorder) {
                filename = 'objekt';
            } else {
                filename = 'photocard';
            }
            // Add card size info for non-objekt sizes
            if (this.currentCardSize !== 'objekt') {
                const preset = this.cardSizePresets[this.currentCardSize];
                if (preset) {
                    filename += `-${this.currentCardSize}`;
                }
            }
        }

        let result;
        if (this.enableBackSide) {
            // Front side: video if animated, PNG otherwise
            if (this.isAnimated()) {
                const videoResult = await this.exportAsVideo();
                const url = URL.createObjectURL(videoResult.blob);
                const link = document.createElement('a');
                link.download = `${filename}-front.${videoResult.extension}`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            } else {
                await new Promise((resolve) => {
                    this.canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.download = `${filename}-front.${format}`;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        resolve(true);
                    }, `image/${format}`, 0.95);
                });
            }

            // Back side always exports as PNG
            const backCanvas = this.renderBackSide();
            await new Promise((resolve) => {
                backCanvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `${filename}-back.${format}`;
                    link.href = url;
                    link.click();
                    URL.revokeObjectURL(url);
                    resolve(true);
                }, `image/${format}`, 0.95);
            });

            result = true;
        } else {
            // Single side: video if animated, PNG otherwise
            if (this.isAnimated()) {
                const videoResult = await this.exportAsVideo();
                const url = URL.createObjectURL(videoResult.blob);
                const link = document.createElement('a');
                link.download = `${filename}.${videoResult.extension}`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                result = true;
            } else {
                result = await new Promise((resolve) => {
                    this.canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.download = `${filename}.${format}`;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        resolve(true);
                    }, `image/${format}`, 0.95);
                });
            }
        }

        // Restore template visibility after export (Phase 3)
        if (templateWasVisible) {
            this.showTemplate = true;
            this.render(); // Re-render with template
        }
        if (templateBackWasVisible) {
            this.showTemplateBack = true;
            this.updateBackSidePreview(); // Re-render back side with template
        }

        return result;
    },

    /**
     * Reset canvas to initial state
     */
    reset() {
        // Stop any running animation
        this.stopAnimation();
        this.mediaType = 'static';
        this.gifData = { frames: [], delays: [], currentFrame: 0, lastFrameTime: 0, animationFrame: null };
        if (this.videoData.element) {
            this.videoData.element.pause();
            URL.revokeObjectURL(this.videoData.element.src);
        }
        this.videoData = { element: null, originalFile: null, animationFrame: null };

        this.uploadedImage = null;
        this.imageScale = 1;
        this.imageRotation = 0;
        this.imagePosX = 0;
        this.imagePosY = 0;
        this.topText = 'SeoYeon';
        this.middleText = '100A#00001';
        this.bottomText = 'tripleS';
        this.accentColor = '#FFD400';
        this.borderImage = null;
        this.signatureImage = null;
        this.signatureZoom = 1;
        this.signaturePosX = 0;
        this.signaturePosY = 0;
        this.textColor = '#000000';
        this.showObjektBorder = true; // Reset to objekt mode by default
        // Reset back uploaded image
        this.backUploadedImage = null;
        this.backImageScale = 1;
        this.backImagePosX = 0;
        this.backImagePosY = 0;
        // Reset template overlay (Phase 3)
        this.templateImage = null;
        this.templateOpacity = 0.5;
        this.showTemplate = false;
        // Reset back side template overlay
        this.templateImageBack = null;
        this.templateOpacityBack = 0.5;
        this.showTemplateBack = false;
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        console.log('Canvas reset');
    },

    /**
     * Check if canvas has an image loaded
     * @returns {boolean}
     */
    hasImage() {
        return this.uploadedImage !== null;
    },

    /**
     * Get current canvas as data URL
     * @returns {string} Data URL
     */
    toDataURL() {
        return this.canvas.toDataURL('image/png');
    },

    /**
     * Get bounding boxes for all text areas on the front side
     * @returns {Array} Array of text bound objects with {type, x, y, width, height}
     */
    getTextBounds() {
        const bounds = [];
        const accentX = this.canvasWidth - this.accentWidth;
        const centerX = accentX + this.accentWidth / 2;
        const padding = 20; // Hit area padding

        // Top text bounds (text is rotated 90° CW, so width/height are swapped)
        const topFontSize = 40.90875;
        this.ctx.font = `${this.getFontWeightForRole('frontTop', 600)} ${topFontSize}px ${this.getFontFamilyForRole('frontTop')}`;
        this.ctx.letterSpacing = '-2.045px';
        const topTextWidth = this.ctx.measureText(this.topText).width;
        this.ctx.letterSpacing = '0px';
        const topTextY = 104 + this.topTextHeight;
        bounds.push({
            type: 'top',
            x: centerX - topFontSize / 2 - padding,
            y: topTextY - padding,
            width: topFontSize + padding * 2,
            height: topTextWidth + padding * 2
        });

        // Middle text bounds (text is rotated 90° CW, so width/height are swapped)
        const middleFontSize = 45;
        this.ctx.font = `${this.getFontWeightForRole('frontMiddle', 550)} ${middleFontSize}px ${this.getFontFamilyForRole('frontMiddle')}`;
        this.ctx.letterSpacing = '-1.975px';
        const middleTextWidth = this.ctx.measureText(this.middleText).width;
        this.ctx.letterSpacing = '0px';
        const middleTextY = this.canvasHeight / 2.25 + this.middleTextHeight;
        bounds.push({
            type: 'middle',
            x: centerX - middleFontSize / 2 - padding,
            y: middleTextY - padding,
            width: middleFontSize + padding * 2,
            height: middleTextWidth + padding * 2
        });

        // Bottom text/logo bounds (more complex due to rotation and positioning)
        // If front logo is present, use logo bounds instead of text bounds
        if (this.frontLogoImage) {
            // Calculate logo position (same logic as in drawFrontLogo)
            const scaledAccentWidth = this.accentWidth * this.scaleFactor;
            const imageAreaWidth = this.showObjektBorder ? this.canvasWidth - scaledAccentWidth : this.canvasWidth;
            const logoCenterX = imageAreaWidth / 2;
            const logoCenterY = this.canvasHeight / 2;

            const baseWidth = 100 * this.scaleFactor;
            const baseHeight = 100 * this.scaleFactor;

            // Calculate dimensions to fit logo while maintaining aspect ratio
            const imgAspect = this.frontLogoImage.width / this.frontLogoImage.height;
            let drawWidth, drawHeight;

            if (imgAspect > baseWidth / baseHeight) {
                drawWidth = baseWidth;
                drawHeight = drawWidth / imgAspect;
            } else {
                drawHeight = baseHeight;
                drawWidth = drawHeight * imgAspect;
            }

            // Apply zoom
            drawWidth *= this.frontLogoZoom;
            drawHeight *= this.frontLogoZoom;

            // Calculate final position
            const drawX = logoCenterX - drawWidth / 2;
            const drawY = logoCenterY - drawHeight / 2;
            const finalX = drawX + (this.frontLogoBaseX * this.scaleFactor) + this.frontLogoPosX;
            const finalY = drawY + (this.frontLogoBaseY * this.scaleFactor) + this.frontLogoPosY;

            // Add larger padding for easier clicking
            const logoPadding = 40;
            bounds.push({
                type: 'bottom',
                x: finalX - logoPadding,
                y: finalY - logoPadding,
                width: drawWidth + logoPadding * 2,
                height: drawHeight + logoPadding * 2
            });
        } else {
            // Original text bounds calculation
            const notchY = (this.canvasHeight - this.notchHeight) / 2;
            const notchBottom = notchY + this.notchHeight;
            const defaultBottomY = this.canvasHeight - 227;

            let textWidth = 0;
            const baseSpacing = -1.0973;

            if (this.bottomText === 'tripleS') {
                const extraGap100 = Math.abs(baseSpacing);
                const extraGap50 = Math.abs(baseSpacing) * 0.5;
                const reducedGap = baseSpacing * 0.15;

                for (let i = 0; i < this.bottomText.length; i++) {
                    const char = this.bottomText[i];
                    const charWidth = this.ctx.measureText(char).width;
                    textWidth += charWidth + baseSpacing;

                    if (i === 0 || i === 1) textWidth += extraGap100;
                    if (i === 5) textWidth += extraGap50;
                    if (i === 6) textWidth -= reducedGap;
                }
            } else {
                this.ctx.letterSpacing = '-1.0973px';
                textWidth = this.ctx.measureText(this.bottomText).width;
            }

            const bottomMargin = 20;
            let bottomTextY = defaultBottomY;
            const textEnd = defaultBottomY + textWidth;

            if (textEnd > notchBottom - bottomMargin) {
                bottomTextY = notchBottom - textWidth - bottomMargin;
            }

            bottomTextY += this.bottomTextHeight;

            bounds.push({
                type: 'bottom',
                x: centerX - padding,
                y: bottomTextY - padding,
                width: 45 + padding * 2,
                height: textWidth + padding * 2
            });
        }

        return bounds;
    },

    /**
     * Get which text area was clicked (if any)
     * @param {number} x - Click X coordinate relative to canvas
     * @param {number} y - Click Y coordinate relative to canvas
     * @returns {string|null} Text type ('top', 'middle', 'bottom') or null
     */
    getClickedText(x, y) {
        const bounds = this.getTextBounds();

        for (const bound of bounds) {
            if (x >= bound.x && x <= bound.x + bound.width &&
                y >= bound.y && y <= bound.y + bound.height) {
                return bound.type;
            }
        }

        return null;
    },

    /**
     * Get bounding boxes for all text areas on the back side
     * @returns {Array} Array of text bound objects with {type, x, y, width, height}
     */
    getBackTextBounds() {
        const bounds = [];
        const ctx = document.createElement('canvas').getContext('2d');
        const padding = 30; // Hit area padding for easier clicking

        // Calculate dimensions used in back side rendering
        const whiteBackgroundWidth = this.accentWidth * 0.8378;
        const rectWidth = this.canvasWidth - whiteBackgroundWidth;
        const whiteBackgroundHeight = this.accentWidth * 0.84375;
        const rectHeight = this.canvasHeight - (2 * whiteBackgroundHeight);
        const rectX = 0;
        const rectY = whiteBackgroundHeight;

        const leftMargin = 47;

        // Calculate divider positions
        const divider1Y = rectY + (rectHeight * 0.175);
        const divider2Y = rectY + (rectHeight * 0.325);
        const divider3Y = rectY + (rectHeight * 0.475);
        const divider4Y = rectY + (rectHeight * 0.625);

        // NAME Label
        ctx.font = `${this.getFontWeightForRole('backLabel', 400)} 29.828px ${this.getFontFamilyForRole('backLabel')}`;
        const nameLabelWidth = ctx.measureText(this.backNameLabel).width;
        bounds.push({
            type: 'nameLabel',
            x: leftMargin - padding,
            y: divider1Y + 10 - padding,
            width: nameLabelWidth + padding * 2,
            height: 29.828 + padding * 2
        });

        // NAME Value
        ctx.font = `${this.getFontWeightForRole('backValue', 500)} 88px ${this.getFontFamilyForRole('backValue')}`;
        const nameValueWidth = ctx.measureText(this.backNameValue).width;
        bounds.push({
            type: 'nameValue',
            x: leftMargin - padding,
            y: divider1Y + 58 - padding,
            width: nameValueWidth + padding * 2,
            height: 88 + padding * 2
        });

        // CLASS Label
        ctx.font = `${this.getFontWeightForRole('backLabel', 400)} 29.828px ${this.getFontFamilyForRole('backLabel')}`;
        const classLabelWidth = ctx.measureText(this.backClassLabel).width;
        bounds.push({
            type: 'classLabel',
            x: leftMargin - padding,
            y: divider2Y + 10 - padding,
            width: classLabelWidth + padding * 2,
            height: 29.828 + padding * 2
        });

        // CLASS Value
        ctx.font = `${this.getFontWeightForRole('backValue', 500)} 88px ${this.getFontFamilyForRole('backValue')}`;
        const classValueWidth = ctx.measureText(this.backClassValue).width;
        bounds.push({
            type: 'classValue',
            x: leftMargin - padding,
            y: divider2Y + 58 - padding,
            width: classValueWidth + padding * 2,
            height: 88 + padding * 2
        });

        // SEASON Label
        ctx.font = `${this.getFontWeightForRole('backLabel', 400)} 29.828px ${this.getFontFamilyForRole('backLabel')}`;
        const seasonLabelWidth = ctx.measureText(this.backSeasonLabel).width;
        bounds.push({
            type: 'seasonLabel',
            x: leftMargin - padding,
            y: divider3Y + 10 - padding,
            width: seasonLabelWidth + padding * 2,
            height: 29.828 + padding * 2
        });

        // SEASON Value
        ctx.font = `${this.getFontWeightForRole('backValue', 500)} 88px ${this.getFontFamilyForRole('backValue')}`;
        const seasonValueWidth = ctx.measureText(this.backSeasonValue).width;
        bounds.push({
            type: 'seasonValue',
            x: leftMargin - padding,
            y: divider3Y + 56 - padding,
            width: seasonValueWidth + padding * 2,
            height: 88 + padding * 2
        });

        // Rotated text on the right side
        const rightGap = rectWidth * 0.04;
        const textX = rectWidth - rightGap - 18;
        const topGap = rectHeight * 0.04;

        // Top rotated text (name value) - rotated 90 degrees
        ctx.font = `${this.getFontWeightForRole('backRotated', 600)} 41.18px ${this.getFontFamilyForRole('backRotated')}`;
        const topRotatedWidth = ctx.measureText(this.backNameValue).width;
        // Since it's rotated 90 degrees, x and y are swapped for hit detection
        bounds.push({
            type: 'topRotated',
            x: textX - 41.18 / 2 - padding,
            y: rectY + topGap - 10 + this.backTopTextHeight - padding,
            width: 41.18 + padding * 2,
            height: topRotatedWidth + padding * 2
        });

        // Bottom rotated text (group name) - rotated 90 degrees
        const bottomGap = 30;
        const bottomRotatedWidth = ctx.measureText(this.backGroupName).width;
        bounds.push({
            type: 'bottomRotated',
            x: textX - 41.18 / 2 - padding,
            y: rectY + rectHeight - bottomGap - 135 + this.backBottomTextHeight - padding,
            width: 41.18 + padding * 2,
            height: bottomRotatedWidth + padding * 2
        });

        return bounds;
    },

    /**
     * Get which back side text area was clicked (if any)
     * @param {number} x - Click X coordinate relative to canvas
     * @param {number} y - Click Y coordinate relative to canvas
     * @returns {string|null} Text type or null
     */
    getClickedBackText(x, y) {
        const bounds = this.getBackTextBounds();

        for (const bound of bounds) {
            if (x >= bound.x && x <= bound.x + bound.width &&
                y >= bound.y && y <= bound.y + bound.height) {
                return bound.type;
            }
        }

        // Check QR code area
        if (this.isQRCodeAreaClicked(x, y)) {
            return 'qrcode';
        }

        // Check signature area
        if (this.isSignatureAreaClicked(x, y)) {
            return 'signature';
        }

        // Check top logo area
        if (this.isTopLogoAreaClicked(x, y)) {
            return 'toplogo';
        }

        return null;
    },

    /**
     * Check if the QR code (white box) area was clicked
     * @param {number} x - Click X coordinate relative to canvas
     * @param {number} y - Click Y coordinate relative to canvas
     * @returns {boolean} True if QR code area was clicked
     */
    isQRCodeAreaClicked(x, y) {
        // Calculate QR code area bounds (same as in renderBackSide)
        const whiteBackgroundWidth = this.accentWidth * 0.8378;
        const rectWidth = this.canvasWidth - whiteBackgroundWidth;
        const whiteBackgroundHeight = this.accentWidth * 0.84375;
        const rectHeight = this.canvasHeight - (2 * whiteBackgroundHeight);
        const rectY = whiteBackgroundHeight;

        const divider4Y = rectY + (rectHeight * 0.625);
        const divider5Y = rectY + (rectHeight * 0.835);
        const squareSize = divider5Y - divider4Y;

        const whiteBoxX = (rectWidth * 0.52);
        const whiteBoxY = divider4Y;

        // Check if click is within the white box area
        return x >= whiteBoxX && x <= whiteBoxX + squareSize &&
               y >= whiteBoxY && y <= whiteBoxY + squareSize;
    },

    /**
     * Check if the signature area was clicked
     * @param {number} x - Click X coordinate relative to canvas
     * @param {number} y - Click Y coordinate relative to canvas
     * @returns {boolean} True if signature area was clicked
     */
    isSignatureAreaClicked(x, y) {
        // Calculate signature area bounds (same as in renderBackSide)
        const whiteBackgroundWidth = this.accentWidth * 0.8378;
        const rectWidth = this.canvasWidth - whiteBackgroundWidth;
        const whiteBackgroundHeight = this.accentWidth * 0.84375;
        const rectHeight = this.canvasHeight - (2 * whiteBackgroundHeight);
        const rectY = whiteBackgroundHeight;

        const divider4Y = rectY + (rectHeight * 0.625);
        const divider5Y = rectY + (rectHeight * 0.835);
        const squareSize = divider5Y - divider4Y;

        const leftMargin = 47;
        const signatureX = leftMargin + 30;
        const signatureY = divider4Y + (squareSize - squareSize) / 2;
        const signatureWidth = 220;
        const signatureHeight = squareSize;

        // Generous padding for easier clicking
        const padding = 20;

        return x >= signatureX - padding && x <= signatureX + signatureWidth + padding &&
               y >= signatureY - padding && y <= signatureY + signatureHeight + padding;
    },

    /**
     * Check if the top logo area was clicked
     * @param {number} x - Click X coordinate relative to canvas
     * @param {number} y - Click Y coordinate relative to canvas
     * @returns {boolean} True if top logo area was clicked
     */
    isTopLogoAreaClicked(x, y) {
        // Calculate top logo area bounds (same as hex cube position)
        const logoX = this.topLogoBaseX;
        const logoY = this.topLogoBaseY;
        const logoSize = 100; // Base size of the logo/hex cube area
        const padding = 20; // Generous padding for easier clicking

        return x >= logoX - padding && x <= logoX + logoSize + padding &&
               y >= logoY - padding && y <= logoY + logoSize + padding;
    }
};

// Export to global scope for browser usage
window.CanvasManager = CanvasManager;

// Export for use in other modules (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanvasManager;
}
