/**
 * ui.js
 * Manages UI interactions, toolbar events, and modals
 */

const UIManager = {
    elements: {},
    cameraAspectRatio: '3:4', // Default aspect ratio
    canvasAspectRatio: '3:4', // Canvas aspect ratio after capture
    photocardFileInputTimeout: null, // Debounce for double file picker on Android

    /**
     * Detect if the device is Android
     */
    isAndroid() {
        return /Android/i.test(navigator.userAgent);
    },

    /**
     * Safely trigger photocard file input with debouncing to prevent double prompts on Android
     */
    triggerPhotocardFileInput() {
        // Clear any existing timeout
        if (this.photocardFileInputTimeout) {
            clearTimeout(this.photocardFileInputTimeout);
        }

        // Click the file input
        if (this.elements.photocardFileInput) {
            this.elements.photocardFileInput.click();
        }

        // Set a cooldown period to prevent multiple rapid clicks
        this.photocardFileInputTimeout = setTimeout(() => {
            this.photocardFileInputTimeout = null;
        }, 500);
    },

    /**
     * Initialize UI manager
     */
    init(canvasInstance) {
        this.canvas = canvasInstance;
        this.editModeHintShown = false;
        this.cacheElements();
        this.attachEventListeners();
        this.initializeLucideIcons();

        // Show mobile home screen on mobile devices
        if (window.innerWidth <= 767 && this.elements.mobileHome) {
            this.elements.mobileHome.classList.add('active');
        }

        // Sync photocard sliders with the initial placeholder
        setTimeout(() => {
            this.syncPhotocardSliders();
        }, 100);

        // Initially hide the hint
        if (this.elements.editModeHint) {
            this.elements.editModeHint.style.display = 'none';
        }
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Mobile home
            mobileHome: document.getElementById('mobile-home'),
            launchCameraBtn: document.getElementById('launch-camera-btn'),

            // Toolbar toggle
            toolbarToggle: document.getElementById('toolbar-toggle'),
            toolbarToggleIcon: document.getElementById('toolbar-toggle-icon'),
            toolbar: document.getElementById('toolbar'),

            // Edit mode hint
            editModeHint: document.getElementById('edit-mode-hint'),

            // File inputs
            bgFileInput: document.getElementById('bg-file-input'),
            photocardFileInput: document.getElementById('photocard-file-input'),

            // Upload buttons
            uploadBgBtn: document.getElementById('upload-bg-btn'),
            uploadPhotocardBtn: document.getElementById('upload-photocard-btn'),

            // Camera elements
            cameraBtn: document.getElementById('camera-btn'),
            cameraControls: document.getElementById('camera-controls'),
            cameraShutterBtn: document.getElementById('camera-shutter-btn'),
            cameraUploadBgBtn: document.getElementById('camera-upload-bg-btn'),
            cameraAddPhotocardBtn: document.getElementById('camera-add-photocard-btn'),
            cameraAspectRatioBtn: document.getElementById('camera-aspect-ratio-btn'),
            cameraResetPhotocardBtn: document.getElementById('camera-reset-photocard-btn'),
            cameraZoomControls: document.getElementById('camera-zoom-controls'),
            cameraZoomSlider: document.getElementById('camera-zoom-slider'),
            cameraZoomInBtn: document.getElementById('camera-zoom-in-btn'),
            cameraZoomOutBtn: document.getElementById('camera-zoom-out-btn'),
            cameraActionButtons: document.getElementById('camera-action-buttons'),
            cameraSaveBtn: document.getElementById('camera-save-btn'),
            cameraDiscardBtn: document.getElementById('camera-discard-btn'),

            // Background controls
            bgXSlider: document.getElementById('bg-x-slider'),
            bgYSlider: document.getElementById('bg-y-slider'),
            bgScaleSlider: document.getElementById('bg-scale-slider'),
            bgRotationSlider: document.getElementById('bg-rotation-slider'),
            bgXValue: document.getElementById('bg-x-value'),
            bgYValue: document.getElementById('bg-y-value'),
            bgScaleValue: document.getElementById('bg-scale-value'),
            bgRotationValue: document.getElementById('bg-rotation-value'),
            bgFlipHBtn: document.getElementById('bg-flip-h-btn'),
            bgFlipVBtn: document.getElementById('bg-flip-v-btn'),
            bgResetBtn: document.getElementById('bg-reset-btn'),

            // Photocard controls
            photocardXSlider: document.getElementById('photocard-x-slider'),
            photocardYSlider: document.getElementById('photocard-y-slider'),
            photocardScaleSlider: document.getElementById('photocard-scale-slider'),
            photocardRotationSlider: document.getElementById('photocard-rotation-slider'),
            photocardXValue: document.getElementById('photocard-x-value'),
            photocardYValue: document.getElementById('photocard-y-value'),
            photocardScaleValue: document.getElementById('photocard-scale-value'),
            photocardRotationValue: document.getElementById('photocard-rotation-value'),
            photocardResetBtn: document.getElementById('photocard-reset-btn'),
            photocardResetTransformBtn: document.getElementById('photocard-reset-transform-btn'),

            // Toploader toggle
            toploaderToggle: document.getElementById('toploader-toggle'),

            // Action buttons
            resetBtn: document.getElementById('reset-btn'),
            saveBtn: document.getElementById('save-btn'),
            saveVideoBtn: document.getElementById('save-video-btn'),

            // Canvas overlay
            canvasOverlay: document.getElementById('canvas-overlay'),

            // Edit mode toggle
            editModeToggle: document.getElementById('edit-mode-toggle'),
            editModePhotocardBtn: document.getElementById('edit-mode-photocard'),
            editModeBackgroundBtn: document.getElementById('edit-mode-background'),

            // QR Modal
            qrModal: document.getElementById('qr-modal'),
            qrModalClose: document.getElementById('qr-modal-close'),
            qrCodeContainer: document.getElementById('qr-code-container'),
            shareUrlInput: document.getElementById('share-url'),
            copyUrlBtn: document.getElementById('copy-url-btn'),

            // Save Confirmation Modal
            saveConfirmationModal: document.getElementById('save-confirmation-modal'),
            saveConfirmationModalClose: document.getElementById('save-confirmation-modal-close'),
            keepEditingBtn: document.getElementById('keep-editing-btn'),
            discardImageBtn: document.getElementById('discard-image-btn')
        };
    },

    /**
     * Attach event listeners to UI elements
     */
    attachEventListeners() {
        // Mobile home launch camera button
        if (this.elements.launchCameraBtn) {
            this.elements.launchCameraBtn.addEventListener('click', () => {
                this.handleLaunchCamera();
            });
        }

        // Upload buttons
        this.elements.uploadBgBtn.addEventListener('click', () => {
            this.elements.bgFileInput.click();
        });

        this.elements.uploadPhotocardBtn.addEventListener('click', () => {
            this.triggerPhotocardFileInput();
        });

        // Camera button
        if (this.elements.cameraBtn) {
            this.elements.cameraBtn.addEventListener('click', () => {
                this.handleCameraStart();
            });
        }

        // Edit mode toggle buttons
        if (this.elements.editModePhotocardBtn) {
            this.elements.editModePhotocardBtn.addEventListener('click', () => {
                this.handleEditModeChange('photocard');
            });
        }

        if (this.elements.editModeBackgroundBtn) {
            this.elements.editModeBackgroundBtn.addEventListener('click', () => {
                this.handleEditModeChange('background');
                // Hide hint when user clicks background toggle
                this.hideEditModeHint();
            });
        }

        // Camera controls
        if (this.elements.cameraShutterBtn) {
            this.elements.cameraShutterBtn.addEventListener('click', () => {
                this.handleCameraCapture();
            });
        }

        if (this.elements.cameraUploadBgBtn) {
            this.elements.cameraUploadBgBtn.addEventListener('click', () => {
                this.handleCameraUploadBackground();
            });
        }

        if (this.elements.cameraAddPhotocardBtn) {
            this.elements.cameraAddPhotocardBtn.addEventListener('click', () => {
                this.handleCameraAddPhotocard();
            });
        }

        if (this.elements.cameraAspectRatioBtn) {
            this.elements.cameraAspectRatioBtn.addEventListener('click', () => {
                this.handleAspectRatioToggle();
            });
        }

        if (this.elements.cameraResetPhotocardBtn) {
            this.elements.cameraResetPhotocardBtn.addEventListener('click', () => {
                this.handleCameraResetPhotocard();
            });
        }

        // Camera zoom controls
        if (this.elements.cameraZoomInBtn) {
            this.elements.cameraZoomInBtn.addEventListener('click', () => {
                this.handleCameraZoomIn();
            });
        }

        if (this.elements.cameraZoomOutBtn) {
            this.elements.cameraZoomOutBtn.addEventListener('click', () => {
                this.handleCameraZoomOut();
            });
        }

        if (this.elements.cameraZoomSlider) {
            this.elements.cameraZoomSlider.addEventListener('input', (e) => {
                this.handleCameraZoomSlider(e);
            });
        }

        if (this.elements.cameraSaveBtn) {
            this.elements.cameraSaveBtn.addEventListener('click', () => {
                this.handleCameraSave();
            });
        }

        if (this.elements.cameraDiscardBtn) {
            this.elements.cameraDiscardBtn.addEventListener('click', () => {
                this.handleCameraDiscard();
            });
        }

        // File inputs
        this.elements.bgFileInput.addEventListener('change', (e) => {
            this.handleBackgroundUpload(e);
        });

        this.elements.photocardFileInput.addEventListener('change', (e) => {
            this.handlePhotocardUpload(e);
        });

        // Background sliders
        this.elements.bgXSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updateBackground('x', value);
            this.elements.bgXValue.textContent = Math.round(value);
        });

        this.elements.bgYSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updateBackground('y', value);
            this.elements.bgYValue.textContent = Math.round(value);
        });

        this.elements.bgScaleSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updateBackground('scale', value);
            this.elements.bgScaleValue.textContent = value.toFixed(2);
        });

        this.elements.bgRotationSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updateBackground('rotation', value);
            this.elements.bgRotationValue.textContent = Math.round(value) + '°';
        });

        // Background buttons
        this.elements.bgFlipHBtn.addEventListener('click', () => {
            this.canvas.flipBackgroundHorizontal();
        });

        this.elements.bgFlipVBtn.addEventListener('click', () => {
            this.canvas.flipBackgroundVertical();
        });

        this.elements.bgResetBtn.addEventListener('click', () => {
            this.canvas.resetBackground();
            this.syncBackgroundSliders();
        });

        // Photocard sliders
        this.elements.photocardXSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updatePhotocard('x', value);
            this.elements.photocardXValue.textContent = Math.round(value);
        });

        this.elements.photocardYSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updatePhotocard('y', value);
            this.elements.photocardYValue.textContent = Math.round(value);
        });

        this.elements.photocardScaleSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.canvas.updatePhotocard('scale', value);
            this.elements.photocardScaleValue.textContent = value.toFixed(2);
        });

        this.elements.photocardRotationSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const radians = (value * Math.PI) / 180;
            this.canvas.updatePhotocard('rotation', radians);
            this.elements.photocardRotationValue.textContent = Math.round(value) + '°';
        });

        // Photocard buttons
        this.elements.photocardResetBtn.addEventListener('click', () => {
            this.canvas.resetPhotocard();
            this.syncPhotocardSliders();
        });

        this.elements.photocardResetTransformBtn.addEventListener('click', () => {
            this.canvas.resetPhotocard();
            this.syncPhotocardSliders();
            this.showNotification('Photocard position and size reset', 'success');
        });

        // Toploader toggle
        this.elements.toploaderToggle.addEventListener('change', (e) => {
            this.toggleToploader(e.target.checked);
        });

        // Action buttons
        this.elements.resetBtn.addEventListener('click', () => {
            this.handleReset();
        });

        this.elements.saveBtn.addEventListener('click', () => {
            this.handleSave();
        });

        this.elements.saveVideoBtn.addEventListener('click', () => {
            this.handleSaveAsVideo();
        });

        // QR Modal
        this.elements.qrModalClose.addEventListener('click', () => {
            this.closeQRModal();
        });

        this.elements.qrModal.addEventListener('click', (e) => {
            if (e.target === this.elements.qrModal) {
                this.closeQRModal();
            }
        });

        this.elements.copyUrlBtn.addEventListener('click', () => {
            this.copyShareUrl();
        });

        // Save Confirmation Modal
        this.elements.saveConfirmationModalClose.addEventListener('click', () => {
            this.closeSaveConfirmationModal();
        });

        this.elements.saveConfirmationModal.addEventListener('click', (e) => {
            if (e.target === this.elements.saveConfirmationModal) {
                this.closeSaveConfirmationModal();
            }
        });

        this.elements.keepEditingBtn.addEventListener('click', () => {
            this.handleKeepEditing();
        });

        this.elements.discardImageBtn.addEventListener('click', () => {
            this.handleDiscardImage();
        });

        // Drag and drop for canvas
        const canvas = document.getElementById('proofshot-canvas');
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleDrop(e);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // Toolbar toggle (mobile)
        const toolbarToggle = this.elements.toolbarToggle;
        if (toolbarToggle) {
            toolbarToggle.addEventListener('click', () => {
                this.toggleToolbar();
            });
            this.initMobileToggle();
        }
    },

    /**
     * Toggle toolbar visibility (mobile)
     */
    toggleToolbar() {
        const toolbar = this.elements.toolbar;
        const toggle = this.elements.toolbarToggle;
        
        toolbar.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
    },

    /**
     * Initialize mobile toolbar toggle
     */
    initMobileToggle() {
        if (window.innerWidth <= 767) {
            const toggle = this.elements.toolbarToggle;
            if (toggle) {
                toggle.style.display = 'flex';
                this.initializeLucideIcons();
            }
        }
    },

    /**
     * Initialize Lucide icons
     */
    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    /**
     * Handle background image upload
     */
    async handleBackgroundUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            this.showNotification('Please select a valid image or video file', 'error');
            return;
        }

        try {
            this.showLoading('Loading background...');

            // Track if we were in camera mode
            const wasInCameraMode = this.canvas.camera.active;

            // If camera is active, stop it
            if (this.canvas.camera.active) {
                this.canvas.stopCamera();

                // Hide camera controls
                if (this.elements.cameraControls) {
                    this.elements.cameraControls.classList.remove('active');
                }
                if (this.elements.cameraAspectRatioBtn) {
                    this.elements.cameraAspectRatioBtn.classList.remove('active');
                }
                if (this.elements.cameraResetPhotocardBtn) {
                    this.elements.cameraResetPhotocardBtn.classList.remove('active');
                }

                // Hide upload background button (keep + button visible)
                if (this.elements.cameraUploadBgBtn) {
                    this.elements.cameraUploadBgBtn.style.display = 'none';
                }

                // Exit fullscreen mode
                const canvasContainer = document.querySelector('.canvas-container');
                if (canvasContainer) {
                    canvasContainer.classList.remove('camera-active');
                    canvasContainer.classList.remove('preview-mode');
                    const canvas = document.getElementById('proofshot-canvas');
                    if (canvas) {
                        canvas.style.width = '';
                        canvas.style.height = '';
                    }
                }
            }

            await this.canvas.loadBackground(file);
            this.hideCanvasOverlay();
            this.syncBackgroundSliders();

            // Resize canvas after upload
            setTimeout(() => {
                this.canvas.resizeCanvas();
            }, 100);

            // If we were in camera mode and on mobile, show action buttons
            if (wasInCameraMode && window.innerWidth <= 767) {
                if (this.elements.cameraActionButtons) {
                    this.elements.cameraActionButtons.classList.add('active');
                }
            }

            // Show edit mode hint if user has both background and photocard
            if (this.canvas.photocardImage) {
                setTimeout(() => {
                    this.showEditModeHint();
                }, 500);
            }

            this.showNotification('Background loaded successfully', 'success');
        } catch (error) {
            console.error('Error loading background:', error);
            this.showNotification('Failed to load background', 'error');
        } finally {
            this.hideLoading();
            e.target.value = ''; // Reset file input
        }
    },

    /**
     * Handle photocard image upload
     */
    async handlePhotocardUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            this.showNotification('Please select a valid image or video file', 'error');
            return;
        }

        try {
            this.showLoading('Loading photocard...');
            await this.canvas.loadPhotocard(file);
            this.syncPhotocardSliders();

            // Show edit mode hint if user has both background and photocard
            if (this.canvas.backgroundImage) {
                setTimeout(() => {
                    this.showEditModeHint();
                }, 500);
            }

            this.showNotification('Photocard loaded successfully', 'success');
        } catch (error) {
            console.error('Error loading photocard:', error);
            this.showNotification('Failed to load photocard', 'error');
        } finally {
            this.hideLoading();
            e.target.value = ''; // Reset file input
        }
    },

    /**
     * Handle drag and drop
     */
    async handleDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        const mediaFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));

        if (mediaFiles.length === 0) {
            this.showNotification('Please drop image or video files', 'error');
            return;
        }

        // First file as background, second as photocard
        if (mediaFiles.length >= 1) {
            await this.canvas.loadBackground(mediaFiles[0]);
            this.syncBackgroundSliders();
            this.hideCanvasOverlay();
        }

        if (mediaFiles.length >= 2) {
            await this.canvas.loadPhotocard(mediaFiles[1]);
            this.syncPhotocardSliders();

            // Show edit mode hint when both images are loaded
            setTimeout(() => {
                this.showEditModeHint();
            }, 500);
        }
    },

    /**
     * Handle reset
     */
    handleReset() {
        if (!confirm('Are you sure you want to reset the canvas? This will clear all images.')) {
            return;
        }

        this.canvas.reset();
        this.syncBackgroundSliders();
        this.syncPhotocardSliders();
        this.showCanvasOverlay();
        this.showNotification('Canvas reset', 'success');
    },

    /**
     * Handle save/export - saves first, then shows confirmation modal
     */
    async handleSave() {
        if (!this.canvas.backgroundImage) {
            this.showNotification('Please add a background image before saving', 'error');
            return;
        }

        // Save/share the image first
        try {
            // Check if we have video, GIF animation, or static image
            const hasVideo = this.canvas.hasVideo();
            const hasGif = this.canvas.hasGifAnimation();
            const exportAsVideo = hasVideo;
            const exportAsGif = !hasVideo && hasGif;

            if (exportAsVideo) {
                this.showLoading('Generating video...');
            } else if (exportAsGif) {
                this.showLoading('Generating animated GIF...');
            } else {
                this.showLoading('Exporting...');
            }

            const isMobile = window.innerWidth <= 767;
            let extension, mimeType, blob;

            if (exportAsVideo) {
                const videoData = await this.canvas.exportAsVideo();
                blob = videoData.blob;
                mimeType = videoData.mimeType;
                extension = videoData.extension;
            } else if (exportAsGif) {
                extension = 'gif';
                mimeType = 'image/gif';
                blob = await this.canvas.exportImage(true);
            } else {
                extension = 'png';
                mimeType = 'image/png';
                blob = await this.canvas.exportImage(false);
            }

            const filename = `proofshot-${Date.now()}.${extension}`;

            // Use Web Share API on mobile for images/GIFs only (except Android - use direct download for Android and videos)
            if (isMobile && !this.isAndroid() && !exportAsVideo) {
                const file = new File([blob], filename, { type: mimeType });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Proofshot',
                            text: 'Check out my proofshot!'
                        });
                        this.showNotification('Shared successfully', 'success');
                    } catch (shareError) {
                        if (shareError.name !== 'AbortError') {
                            // Fallback to download
                            this.downloadBlob(blob, filename);
                            this.showNotification('Saved!', 'success');
                        }
                    }
                } else {
                    // canShare returned false or not available, use download
                    this.downloadBlob(blob, filename);
                    this.showNotification('Saved!', 'success');
                }
            } else {
                // Desktop, Android, or video: standard download
                this.downloadBlob(blob, filename);
                let message = 'Proofshot saved successfully';
                if (exportAsVideo) {
                    message = 'Video saved successfully';
                } else if (exportAsGif) {
                    message = 'Animated GIF saved successfully';
                }
                this.showNotification(message, 'success');
            }

            // After saving, show the "What's next?" modal
            this.openSaveConfirmationModal();
        } catch (error) {
            console.error('Error saving:', error);
            this.showNotification('Failed to save proofshot', 'error');
        } finally {
            this.hideLoading();
        }
    },

    /**
     * Handle save as video - always exports as video
     */
    async handleSaveAsVideo() {
        if (!this.canvas.backgroundImage) {
            this.showNotification('Please add a background image before saving', 'error');
            return;
        }

        try {
            this.showLoading('Generating video...');

            const isMobile = window.innerWidth <= 767;

            // Export as video
            const videoData = await this.canvas.exportAsVideo();
            const blob = videoData.blob;
            const mimeType = videoData.mimeType;
            const extension = videoData.extension;
            const filename = `proofshot-${Date.now()}.${extension}`;

            // Videos always use direct download
            this.downloadBlob(blob, filename);
            this.showNotification('Video saved successfully', 'success');

            // After saving, show the "What's next?" modal
            this.openSaveConfirmationModal();
        } catch (error) {
            console.error('Error saving video:', error);
            this.showNotification('Failed to save video', 'error');
        } finally {
            this.hideLoading();
        }
    },

    /**
     * Download blob as file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Export image using Web Share API
     */
    async exportImageShare(canvas, filename) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Failed to create image blob'));
                    return;
                }

                try {
                    const file = new File([blob], filename, { type: 'image/png' });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'Proofshot',
                            text: 'Check out my proofshot!'
                        });
                        resolve(true);
                    } else {
                        // Fallback to download
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        resolve(true);
                    }
                } catch (shareError) {
                    if (shareError.name === 'AbortError') {
                        resolve(false);
                    } else {
                        // Fallback to download
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        resolve(true);
                    }
                }
            }, 'image/png', 0.95);
        });
    },

    /**
     * Handle QR code generation
     */
    handleQRCode() {
        const currentUrl = window.location.href;

        // Clear previous QR code
        this.elements.qrCodeContainer.innerHTML = '';

        // Generate QR code
        if (typeof QRCode !== 'undefined') {
            new QRCode(this.elements.qrCodeContainer, {
                text: currentUrl,
                width: 200,
                height: 200,
                colorDark: '#2d3748',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            this.showNotification('QR code library not loaded', 'error');
            return;
        }

        // Set share URL
        this.elements.shareUrlInput.value = currentUrl;

        // Show modal
        this.openModal();
    },

    /**
     * Copy share URL to clipboard
     */
    async copyShareUrl() {
        const url = this.elements.shareUrlInput.value;

        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('Link copied to clipboard', 'success');

            // Visual feedback
            const btn = this.elements.copyUrlBtn;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check"></i><span>Copied!</span>';
            this.initializeLucideIcons();

            setTimeout(() => {
                btn.innerHTML = originalText;
                this.initializeLucideIcons();
            }, 2000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showNotification('Failed to copy link', 'error');
        }
    },

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(e) {
        // Don't trigger shortcuts if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'r':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.handleReset();
                }
                break;
            case 's':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.handleSave();
                }
                break;
            case 'h':
                this.canvas.flipHorizontal();
                break;
            case 'v':
                this.canvas.flipVertical();
                break;
            case '[':
                this.canvas.rotateLeft();
                break;
            case ']':
                this.canvas.rotateRight();
                break;
            case 'escape':
                this.closeQRModal();
                this.closeSaveConfirmationModal();
                break;
        }
    },

    /**
     * Toggle toploader visibility
     */
    toggleToploader(show) {
        this.canvas.toggleToploader(show);
    },

    /**
     * Show canvas overlay
     */
    showCanvasOverlay() {
        this.elements.canvasOverlay.classList.remove('hidden');
    },

    /**
     * Hide canvas overlay
     */
    hideCanvasOverlay() {
        this.elements.canvasOverlay.classList.add('hidden');
    },

    /**
     * Open QR modal
     */
    openModal() {
        this.elements.qrModal.classList.add('active');
    },

    /**
     * Close QR modal
     */
    closeQRModal() {
        this.elements.qrModal.classList.remove('active');
    },

    /**
     * Close modal (legacy support)
     */
    closeModal() {
        this.closeQRModal();
    },

    /**
     * Open save confirmation modal
     */
    openSaveConfirmationModal() {
        this.elements.saveConfirmationModal.classList.add('active');
        // Re-initialize icons for the modal
        this.initializeLucideIcons();
    },

    /**
     * Close save confirmation modal
     */
    closeSaveConfirmationModal() {
        this.elements.saveConfirmationModal.classList.remove('active');
    },

    /**
     * Handle keep editing - just closes the modal
     */
    handleKeepEditing() {
        // Close the modal and continue editing
        this.closeSaveConfirmationModal();
    },

    /**
     * Handle discard image - clears canvas and reopens camera
     */
    async handleDiscardImage() {
        // Close the modal
        this.closeSaveConfirmationModal();

        // Hide camera action buttons if visible
        if (this.elements.cameraActionButtons) {
            this.elements.cameraActionButtons.classList.remove('active');
        }

        const isMobile = window.innerWidth <= 767;

        if (isMobile) {
            // On mobile, show the mobile home screen
            if (this.elements.mobileHome) {
                this.elements.mobileHome.classList.add('active');
            }

            // Clear the background image but keep the photocard
            this.canvas.backgroundImage = null;
            this.canvas.render();
        } else {
            // On desktop, restart camera or clear and prepare for new image
            // Clear the background image
            this.canvas.backgroundImage = null;

            // Show upload background and add photocard buttons
            if (this.elements.cameraUploadBgBtn) {
                this.elements.cameraUploadBgBtn.style.display = '';
            }
            if (this.elements.cameraAddPhotocardBtn) {
                this.elements.cameraAddPhotocardBtn.style.display = '';
            }

            // Try to start camera, or fall back to canvas overlay
            const cameraStarted = await this.initializeCamera();
            if (!cameraStarted) {
                this.canvas.render();
                this.showCanvasOverlay();
                this.showNotification('Ready for new proofshot', 'info');
            }
        }
    },

    /**
     * Show loading indicator
     */
    showLoading(message = 'Loading...') {
        console.log('Loading:', message);

        // Create loading overlay if it doesn't exist
        let loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-message">Loading...</div>
                </div>
            `;

            // Add styles
            Object.assign(loadingOverlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '10000',
                backdropFilter: 'blur(4px)'
            });

            document.body.appendChild(loadingOverlay);

            // Add spinner styles if not already added
            if (!document.getElementById('loading-styles')) {
                const style = document.createElement('style');
                style.id = 'loading-styles';
                style.textContent = `
                    .loading-content {
                        text-align: center;
                        color: white;
                    }
                    .loading-spinner {
                        width: 50px;
                        height: 50px;
                        margin: 0 auto 20px;
                        border: 4px solid rgba(255, 255, 255, 0.3);
                        border-top: 4px solid white;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    .loading-message {
                        font-size: 1.1rem;
                        font-weight: 600;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // Update message
        const messageEl = loadingOverlay.querySelector('.loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }

        loadingOverlay.style.display = 'flex';
    },

    /**
     * Hide loading indicator
     */
    hideLoading() {
        console.log('Loading complete');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    },

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Simple console notification - could be enhanced with toast notifications
        const styles = {
            info: 'color: #3182ce',
            success: 'color: #38a169',
            error: 'color: #e53e3e'
        };

        console.log(`%c${message}`, styles[type] || styles.info);

        // Could also create a toast element here for visual feedback
        this.createToast(message, type);
    },

    /**
     * Create toast notification
     */
    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        // Add styles
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: type === 'success' ? '#6dd5a0' : type === 'error' ? '#ff6b9d' : '#c7b6f9',
            color: 'white',
            fontWeight: '600',
            fontSize: '0.9rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: '9999',
            animation: 'slideIn 0.3s ease-out',
            maxWidth: '300px'
        });

        document.body.appendChild(toast);

        // Remove after 1.5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 1000);
    },

    /**
     * Shared method to initialize camera with UI setup
     */
    async initializeCamera() {
        try {
            // Check if camera is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showNotification('Camera not supported on this device', 'error');
                return false;
            }

            this.showLoading('Starting camera...');
            await this.canvas.startCamera();

            // Show camera controls
            if (this.elements.cameraControls) {
                this.elements.cameraControls.classList.add('active');
            }

            // Show upload background button (reset inline display style from capture)
            if (this.elements.cameraUploadBgBtn) {
                this.elements.cameraUploadBgBtn.style.display = '';
            }

            // Show aspect ratio button
            if (this.elements.cameraAspectRatioBtn) {
                this.elements.cameraAspectRatioBtn.classList.add('active');
            }

            // Show reset photocard button
            if (this.elements.cameraResetPhotocardBtn) {
                this.elements.cameraResetPhotocardBtn.classList.add('active');
            }

            // Show zoom controls
            if (this.elements.cameraZoomControls) {
                this.elements.cameraZoomControls.classList.add('active');
                // Reset zoom slider to default
                if (this.elements.cameraZoomSlider) {
                    this.elements.cameraZoomSlider.value = 1;
                }
            }

            // Make canvas container fullscreen with aspect ratio
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) {
                canvasContainer.classList.add('camera-active');
                this.applyAspectRatio(canvasContainer);
                // Resize canvas to fit fullscreen and reset photocard
                setTimeout(() => {
                    this.canvas.resizeCanvas();
                    // Reset photocard position and scale to fit new camera canvas size
                    this.canvas.resetPhotocard();
                    this.syncPhotocardSliders();
                }, 100);
            }

            // Hide canvas overlay
            this.hideCanvasOverlay();

            // Collapse toolbar on mobile
            if (window.innerWidth <= 767) {
                this.elements.toolbar.classList.add('collapsed');
            }

            this.hideLoading();
            return true;
        } catch (error) {
            console.error('Error starting camera:', error);

            let errorMessage = 'Failed to access camera';
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage = 'No camera found on this device';
            }

            this.showNotification(errorMessage, 'error');
            this.hideLoading();
            return false;
        }
    },

    /**
     * Handle edit mode change
     */
    handleEditModeChange(mode) {
        // Update canvas manager edit mode
        if (this.canvas && this.canvas.setEditMode) {
            this.canvas.setEditMode(mode);
        }

        // Update button states
        if (this.elements.editModePhotocardBtn && this.elements.editModeBackgroundBtn) {
            this.elements.editModePhotocardBtn.classList.toggle('active', mode === 'photocard');
            this.elements.editModeBackgroundBtn.classList.toggle('active', mode === 'background');
        }
    },

    /**
     * Show edit mode hint
     */
    showEditModeHint() {
        if (this.elements.editModeHint && !this.editModeHintShown) {
            this.elements.editModeHint.style.display = 'block';
            this.elements.editModeHint.style.animation = 'hintFadeInOut 3s ease-in-out forwards';
            this.editModeHintShown = true;
        }
    },

    /**
     * Hide edit mode hint
     */
    hideEditModeHint() {
        if (this.elements.editModeHint) {
            this.elements.editModeHint.style.display = 'none';
            this.editModeHintShown = true;
        }
    },

    /**
     * Handle launch camera from mobile home
     */
    async handleLaunchCamera() {
        // Hide mobile home
        if (this.elements.mobileHome) {
            this.elements.mobileHome.classList.remove('active');
        }

        // Start camera
        await this.handleCameraStart();
    },

    /**
     * Handle camera start
     */
    async handleCameraStart() {
        await this.initializeCamera();
    },

    /**
     * Handle camera capture
     */
    handleCameraCapture() {
        try {
            // Save the current aspect ratio
            this.canvasAspectRatio = this.cameraAspectRatio;

            // Capture the current frame
            this.canvas.captureFrame();

            // Hide camera controls
            if (this.elements.cameraControls) {
                this.elements.cameraControls.classList.remove('active');
            }

            // Hide aspect ratio button
            if (this.elements.cameraAspectRatioBtn) {
                this.elements.cameraAspectRatioBtn.classList.remove('active');
            }

            // Hide reset photocard button
            if (this.elements.cameraResetPhotocardBtn) {
                this.elements.cameraResetPhotocardBtn.classList.remove('active');
            }

            // Hide zoom controls
            if (this.elements.cameraZoomControls) {
                this.elements.cameraZoomControls.classList.remove('active');
            }

            // Hide upload background button (keep + button visible)
            if (this.elements.cameraUploadBgBtn) {
                this.elements.cameraUploadBgBtn.style.display = 'none';
            }

            // Exit fullscreen mode but keep aspect ratio
            const canvasContainer = document.querySelector('.canvas-container');
            if (canvasContainer) {
                // Calculate current canvas size in camera mode before removing class
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const isMobile = vw <= 767;
                let capturedWidth, capturedHeight;

                if (this.cameraAspectRatio === '3:4') {
                    capturedWidth = Math.min(vh * 0.75, vw);
                    capturedHeight = capturedWidth * (4/3);
                } else if (this.cameraAspectRatio === '9:16') {
                    capturedWidth = Math.min(vh * 0.5625, vw);
                    capturedHeight = capturedWidth * (16/9);
                } else if (this.cameraAspectRatio === '1:1') {
                    capturedWidth = Math.min(vh, vw);
                    capturedHeight = capturedWidth;
                } else {
                    capturedWidth = Math.min(vh * 0.75, vw);
                    capturedHeight = capturedWidth * (4/3);
                }

                // On mobile, scale down canvas to fit with buttons visible
                if (isMobile) {
                    const availableHeight = vh - 180; // Reserve space for header and buttons
                    if (capturedHeight > availableHeight) {
                        const scaleFactor = availableHeight / capturedHeight;
                        capturedWidth = capturedWidth * scaleFactor;
                        capturedHeight = availableHeight;
                    }
                }

                canvasContainer.classList.remove('camera-active');
                // Add preview mode class for proper spacing
                canvasContainer.classList.add('preview-mode');

                // Keep the aspect ratio for the canvas
                this.applyCanvasAspectRatio(canvasContainer);

                // Reset positioning to ensure it's in normal document flow
                canvasContainer.style.position = 'relative';
                canvasContainer.style.top = 'auto';
                canvasContainer.style.left = 'auto';
                canvasContainer.style.zIndex = 'auto';

                // Remove explicit dimensions and let canvas resize naturally
                canvasContainer.style.width = '';
                canvasContainer.style.height = '';
                canvasContainer.style.maxWidth = isMobile ? '100vw' : '800px';
                canvasContainer.style.maxHeight = isMobile ? 'calc(100vh - 180px)' : 'none';

                // Resize canvas to container dimensions
                setTimeout(() => {
                    // Clear any inline styles on canvas
                    const canvas = document.getElementById('proofshot-canvas');
                    if (canvas) {
                        canvas.style.width = '';
                        canvas.style.height = '';
                    }

                    this.canvas.resizeCanvas();

                    // Force scroll to ensure the entire canvas and buttons are visible
                    setTimeout(() => {
                        if (isMobile) {
                            // On mobile, scroll to show canvas at top with buttons below
                            window.scrollTo({
                                top: 0,
                                behavior: 'smooth'
                            });
                        } else {
                            // On desktop, center the canvas in viewport
                            setTimeout(() => {
                                canvasContainer.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                    inline: 'nearest'
                                });
                            }, 100);
                        }
                    }, 150);
                }, 100);
            }

            // Show action buttons after capture (sticky on mobile)
            if (this.elements.cameraActionButtons) {
                this.elements.cameraActionButtons.classList.add('active');
            }

            // Show success notification with flash effect
            this.showCameraFlash();
            this.showNotification('Photo captured!', 'success');
        } catch (error) {
            console.error('Error capturing photo:', error);
            this.showNotification('Failed to capture photo', 'error');
        }
    },

    /**
     * Handle camera close
     */
    handleCameraClose() {
        this.canvas.stopCamera();

        // Hide camera controls
        if (this.elements.cameraControls) {
            this.elements.cameraControls.classList.remove('active');
        }

        // Hide aspect ratio button
        if (this.elements.cameraAspectRatioBtn) {
            this.elements.cameraAspectRatioBtn.classList.remove('active');
        }

        // Hide reset photocard button
        if (this.elements.cameraResetPhotocardBtn) {
            this.elements.cameraResetPhotocardBtn.classList.remove('active');
        }

        // Hide zoom controls
        if (this.elements.cameraZoomControls) {
            this.elements.cameraZoomControls.classList.remove('active');
        }

        // Hide action buttons
        if (this.elements.cameraActionButtons) {
            this.elements.cameraActionButtons.classList.remove('active');
        }

        // Exit fullscreen mode
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.classList.remove('camera-active');
            canvasContainer.classList.remove('preview-mode');
            // Remove aspect ratio classes
            canvasContainer.classList.remove('aspect-3-4', 'aspect-9-16', 'aspect-1-1');

            // Reset canvas style
            const canvas = document.getElementById('proofshot-canvas');
            if (canvas) {
                canvas.style.width = '';
                canvas.style.height = '';
            }

            // Resize canvas back to normal
            setTimeout(() => {
                this.canvas.resizeCanvas();
            }, 100);
        }

        this.showNotification('Camera closed', 'info');
    },

    /**
     * Handle upload background from camera
     */
    handleCameraUploadBackground() {
        // Trigger background upload
        if (this.elements.bgFileInput) {
            this.elements.bgFileInput.click();
        }
    },

    /**
     * Handle add photocard from camera
     */
    handleCameraAddPhotocard() {
        // Trigger photocard upload
        this.triggerPhotocardFileInput();
    },

    /**
     * Handle camera reset photocard
     */
    handleCameraResetPhotocard() {
        this.canvas.resetPhotocard();
        this.syncPhotocardSliders();
        this.showNotification('Photocard position reset', 'success');
    },

    /**
     * Handle camera zoom in button
     */
    handleCameraZoomIn() {
        // Update slider immediately for visual feedback
        const currentZoom = this.canvas.getCameraZoom();
        const newZoom = Math.min(10, currentZoom + 0.5);

        if (this.elements.cameraZoomSlider) {
            this.elements.cameraZoomSlider.value = newZoom;
        }

        // Apply zoom to camera
        this.canvas.setCameraZoom(newZoom).catch(err => {
            console.error('Zoom in failed:', err);
        });
    },

    /**
     * Handle camera zoom out button
     */
    handleCameraZoomOut() {
        // Update slider immediately for visual feedback
        const currentZoom = this.canvas.getCameraZoom();
        const newZoom = Math.max(1, currentZoom - 0.5);

        if (this.elements.cameraZoomSlider) {
            this.elements.cameraZoomSlider.value = newZoom;
        }

        // Apply zoom to camera
        this.canvas.setCameraZoom(newZoom).catch(err => {
            console.error('Zoom out failed:', err);
        });
    },

    /**
     * Handle camera zoom slider input
     */
    handleCameraZoomSlider(e) {
        const zoomValue = parseFloat(e.target.value);
        this.canvas.setCameraZoom(zoomValue).catch(err => {
            console.error('Slider zoom failed:', err);
        });
    },

    /**
     * Handle aspect ratio toggle
     */
    handleAspectRatioToggle() {
        // Cycle through aspect ratios: 3:4 -> 9:16 -> 1:1 -> 3:4
        const ratios = ['3:4', '9:16', '1:1'];
        const currentIndex = ratios.indexOf(this.cameraAspectRatio);
        const nextIndex = (currentIndex + 1) % ratios.length;
        this.cameraAspectRatio = ratios[nextIndex];

        // Update button text
        if (this.elements.cameraAspectRatioBtn) {
            this.elements.cameraAspectRatioBtn.textContent = this.cameraAspectRatio;
        }

        // Apply new aspect ratio
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            this.applyAspectRatio(canvasContainer);
            // Resize canvas
            setTimeout(() => {
                this.canvas.resizeCanvas();
            }, 100);
        }

        // Hide aspect ratio notification in camera view
        // this.showNotification(`Aspect ratio: ${this.cameraAspectRatio}`, 'info');
    },

    /**
     * Apply aspect ratio class to container (for camera mode)
     */
    applyAspectRatio(container) {
        // Remove all aspect ratio classes
        container.classList.remove('aspect-3-4', 'aspect-9-16', 'aspect-1-1');

        // Add the current aspect ratio class
        switch (this.cameraAspectRatio) {
            case '3:4':
                container.classList.add('aspect-3-4');
                break;
            case '9:16':
                container.classList.add('aspect-9-16');
                break;
            case '1:1':
                container.classList.add('aspect-1-1');
                break;
        }
    },

    /**
     * Apply aspect ratio class to container (for normal canvas mode)
     */
    applyCanvasAspectRatio(container) {
        // Remove all aspect ratio classes
        container.classList.remove('aspect-3-4', 'aspect-9-16', 'aspect-1-1');

        // Add the canvas aspect ratio class
        switch (this.canvasAspectRatio) {
            case '3:4':
                container.classList.add('aspect-3-4');
                break;
            case '9:16':
                container.classList.add('aspect-9-16');
                break;
            case '1:1':
                container.classList.add('aspect-1-1');
                break;
        }
    },

    /**
     * Show camera flash effect
     */
    showCameraFlash() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: white;
            z-index: 9999;
            pointer-events: none;
            animation: cameraFlash 0.3s ease-out;
        `;

        document.body.appendChild(flash);

        setTimeout(() => {
            document.body.removeChild(flash);
        }, 300);
    },

    /**
     * Sync background sliders with canvas state
     */
    syncBackgroundSliders() {
        const bg = this.canvas.background;

        this.elements.bgXSlider.value = bg.x;
        this.elements.bgXValue.textContent = Math.round(bg.x);

        this.elements.bgYSlider.value = bg.y;
        this.elements.bgYValue.textContent = Math.round(bg.y);

        this.elements.bgScaleSlider.value = bg.scale;
        this.elements.bgScaleValue.textContent = bg.scale.toFixed(2);

        this.elements.bgRotationSlider.value = bg.rotation;
        this.elements.bgRotationValue.textContent = Math.round(bg.rotation) + '°';
    },

    /**
     * Handle camera save - saves first, then shows confirmation modal
     */
    async handleCameraSave() {
        // Save/share the image first
        try {
            // Check if we have video, GIF animation, or static image
            const hasVideo = this.canvas.hasVideo();
            const hasGif = this.canvas.hasGifAnimation();
            const exportAsVideo = hasVideo;
            const exportAsGif = !hasVideo && hasGif;

            if (exportAsVideo) {
                this.showLoading('Generating video...');
            } else if (exportAsGif) {
                this.showLoading('Generating animated GIF...');
            } else {
                this.showLoading('Preparing to share...');
            }

            let extension, mimeType, blob;

            if (exportAsVideo) {
                const videoData = await this.canvas.exportAsVideo();
                blob = videoData.blob;
                mimeType = videoData.mimeType;
                extension = videoData.extension;
            } else if (exportAsGif) {
                extension = 'gif';
                mimeType = 'image/gif';
                blob = await this.canvas.exportImage(true);
            } else {
                extension = 'png';
                mimeType = 'image/png';
                blob = await this.canvas.exportImage(false);
            }

            const filename = `proofshot-${Date.now()}.${extension}`;
            const file = new File([blob], filename, { type: mimeType });

            // Use mobile share API for images/GIFs only (except Android and videos - use direct download)
            if (!this.isAndroid() && !exportAsVideo) {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Proofshot',
                            text: 'Check out my proofshot!'
                        });
                        let message = 'Photo shared successfully!';
                        if (exportAsGif) {
                            message = 'Animated GIF shared successfully!';
                        }
                        this.showNotification(message, 'success');
                    } catch (shareError) {
                        if (shareError.name !== 'AbortError') {
                            // Fallback to download
                            this.downloadBlob(blob, filename);
                            this.showNotification('Saved!', 'success');
                        }
                    }
                } else {
                    // canShare returned false or not available, use download
                    this.downloadBlob(blob, filename);
                    this.showNotification('Saved!', 'success');
                }
            } else {
                // Android or video: direct download
                this.downloadBlob(blob, filename);
                let message = 'Saved!';
                if (exportAsVideo) {
                    message = 'Video saved!';
                } else if (exportAsGif) {
                    message = 'GIF saved!';
                }
                this.showNotification(message, 'success');
            }

            // After saving, show the "What's next?" modal
            this.openSaveConfirmationModal();
        } catch (error) {
            console.error('Error saving/sharing:', error);
            this.showNotification('Failed to save', 'error');
        } finally {
            this.hideLoading();
        }
    },

    /**
     * Handle camera discard
     */
    async handleCameraDiscard() {
        // Hide action buttons
        if (this.elements.cameraActionButtons) {
            this.elements.cameraActionButtons.classList.remove('active');
        }

        // Clear the background image but keep the photocard
        this.canvas.backgroundImage = null;

        // On mobile, return to home screen
        if (window.innerWidth <= 767) {
            // Show mobile home screen
            if (this.elements.mobileHome) {
                this.elements.mobileHome.classList.add('active');
            }

            // Reset canvas
            this.canvas.render();
            this.showNotification('Discarded', 'info');
        } else {
            // On desktop, restart camera
            // Show upload background and add photocard buttons again
            if (this.elements.cameraUploadBgBtn) {
                this.elements.cameraUploadBgBtn.style.display = '';
            }
            if (this.elements.cameraAddPhotocardBtn) {
                this.elements.cameraAddPhotocardBtn.style.display = '';
            }

            // Restart camera
            const cameraStarted = await this.initializeCamera();
            if (cameraStarted) {
                this.showNotification('Ready to take another photo', 'info');
            } else {
                this.showNotification('Failed to discard', 'error');
            }
        }
    },

    /**
     * Sync photocard sliders with canvas state
     */
    syncPhotocardSliders() {
        const photocard = this.canvas.photocard;
        const rect = this.canvas.canvas.getBoundingClientRect();

        // Update slider max values based on canvas size
        this.elements.photocardXSlider.max = rect.width;
        this.elements.photocardYSlider.max = rect.height;

        this.elements.photocardXSlider.value = photocard.x;
        this.elements.photocardXValue.textContent = Math.round(photocard.x);

        this.elements.photocardYSlider.value = photocard.y;
        this.elements.photocardYValue.textContent = Math.round(photocard.y);

        this.elements.photocardScaleSlider.value = photocard.scale;
        this.elements.photocardScaleValue.textContent = photocard.scale.toFixed(2);

        const degrees = (photocard.rotation * 180) / Math.PI;
        this.elements.photocardRotationSlider.value = degrees;
        this.elements.photocardRotationValue.textContent = Math.round(degrees) + '°';
    }
};

// Add toast animations to document
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
