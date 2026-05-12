/**
 * presets.js
 * Handles saving/loading project presets to localStorage
 */

const PresetManager = {
    STORAGE_KEY: 'objektify_presets',
    MAX_PRESETS: 20,

    /**
     * Collect current project state from CanvasManager into a serializable object
     * @returns {Object} Preset data
     */
    collectState() {
        return {
            // Card size
            currentCardSize: CanvasManager.currentCardSize,
            canvasWidth: CanvasManager.canvasWidth,
            canvasHeight: CanvasManager.canvasHeight,

            // Objekt border
            showObjektBorder: CanvasManager.showObjektBorder,

            // Overflow border
            showOverflowBorder: CanvasManager.showOverflowBorder,
            overflowBorderPercent: CanvasManager.overflowBorderPercent,

            // Border color
            accentColor: CanvasManager.accentColor,

            // Front text
            topText: CanvasManager.topText,
            middleText: CanvasManager.middleText,
            bottomText: CanvasManager.bottomText,
            textColor: CanvasManager.textColor,
            fontFamily: CanvasManager.fontFamily,
            fontWeightFront: CanvasManager.fontWeightFront,
            fontWeightBack: CanvasManager.fontWeightBack,
            fontWeightBorder: CanvasManager.fontWeightBorder,
            topTextHeight: CanvasManager.topTextHeight,
            middleTextHeight: CanvasManager.middleTextHeight,
            bottomTextHeight: CanvasManager.bottomTextHeight,

            // Front logo transform
            frontLogoZoom: CanvasManager.frontLogoZoom,
            frontLogoPosX: CanvasManager.frontLogoPosX,
            frontLogoPosY: CanvasManager.frontLogoPosY,
            frontLogoRotation: CanvasManager.frontLogoRotation,

            // Back side top logo transform
            topLogoZoom: CanvasManager.topLogoZoom,
            topLogoPosX: CanvasManager.topLogoPosX,
            topLogoPosY: CanvasManager.topLogoPosY,
            topLogoRotation: CanvasManager.topLogoRotation,

            // Back side bottom logo transform
            logoZoom: CanvasManager.logoZoom,
            logoPosX: CanvasManager.logoPosX,
            logoPosY: CanvasManager.logoPosY,
            logoRotation: CanvasManager.logoRotation,

            // Signature transform
            signatureZoom: CanvasManager.signatureZoom,
            signaturePosX: CanvasManager.signaturePosX,
            signaturePosY: CanvasManager.signaturePosY,

            // Back side enabled
            enableBackSide: CanvasManager.enableBackSide,

            // Back side labels and values
            backNameLabel: CanvasManager.backNameLabel,
            backNameValue: CanvasManager.backNameValue,
            backClassLabel: CanvasManager.backClassLabel,
            backClassValue: CanvasManager.backClassValue,
            backSeasonLabel: CanvasManager.backSeasonLabel,
            backSeasonValue: CanvasManager.backSeasonValue,
            backGroupName: CanvasManager.backGroupName,
            backTopTextHeight: CanvasManager.backTopTextHeight,
            backBottomTextHeight: CanvasManager.backBottomTextHeight,

            // QR code
            qrCodeLink: CanvasManager.qrCodeLink,

            // Corner rounding
            cornerRadius: CanvasManager.cornerRadius,

            // Template overlay settings
            templateOpacity: CanvasManager.templateOpacity,
            showTemplate: CanvasManager.showTemplate,

            // Back side template overlay settings
            templateOpacityBack: CanvasManager.templateOpacityBack,
            showTemplateBack: CanvasManager.showTemplateBack,

            // Image transform
            imageScale: CanvasManager.imageScale,
            imagePosX: CanvasManager.imagePosX,
            imagePosY: CanvasManager.imagePosY,
            imageRotation: CanvasManager.imageRotation,

            // Back image transform
            backImageScale: CanvasManager.backImageScale,
            backImagePosX: CanvasManager.backImagePosX,
            backImagePosY: CanvasManager.backImagePosY,

            // Frame properties
            frameOpacity: CanvasManager.frameOpacity,
            frameScale: CanvasManager.frameScale,
            framePosX: CanvasManager.framePosX,
            framePosY: CanvasManager.framePosY,
            frameRotation: CanvasManager.frameRotation,
            showFrame: CanvasManager.showFrame
        };
    },

    /**
     * Apply preset data to CanvasManager state
     * @param {Object} data - Preset data
     */
    applyState(data) {
        // Card size
        if (data.currentCardSize) {
            if (data.currentCardSize === 'custom' && data.canvasWidth && data.canvasHeight) {
                CanvasManager.setCardSize('custom', data.canvasWidth, data.canvasHeight);
            } else {
                CanvasManager.setCardSize(data.currentCardSize);
            }
        }

        // Objekt border
        if (data.showObjektBorder !== undefined) {
            CanvasManager.showObjektBorder = data.showObjektBorder;
        }

        // Overflow border
        if (data.showOverflowBorder !== undefined) {
            CanvasManager.showOverflowBorder = data.showOverflowBorder;
        }
        if (data.overflowBorderPercent !== undefined) {
            CanvasManager.overflowBorderPercent = data.overflowBorderPercent;
        }

        // Border color
        if (data.accentColor) CanvasManager.accentColor = data.accentColor;

        // Front text
        if (data.topText !== undefined) CanvasManager.topText = data.topText;
        if (data.middleText !== undefined) CanvasManager.middleText = data.middleText;
        if (data.bottomText !== undefined) CanvasManager.bottomText = data.bottomText;
        if (data.textColor) CanvasManager.textColor = data.textColor;
        if (data.fontFamily) CanvasManager.fontFamily = data.fontFamily;
        if (data.fontWeightFront !== undefined) CanvasManager.fontWeightFront = data.fontWeightFront;
        else if (data.fontWeight !== undefined) CanvasManager.fontWeightFront = data.fontWeight; // legacy
        if (data.fontWeightBack !== undefined) CanvasManager.fontWeightBack = data.fontWeightBack;
        else if (data.fontWeight !== undefined) CanvasManager.fontWeightBack = data.fontWeight; // legacy
        if (data.fontWeightBorder !== undefined) CanvasManager.fontWeightBorder = data.fontWeightBorder;
        if (data.topTextHeight !== undefined) CanvasManager.topTextHeight = data.topTextHeight;
        if (data.middleTextHeight !== undefined) CanvasManager.middleTextHeight = data.middleTextHeight;
        if (data.bottomTextHeight !== undefined) CanvasManager.bottomTextHeight = data.bottomTextHeight;

        // Front logo
        if (data.frontLogoZoom !== undefined) CanvasManager.frontLogoZoom = data.frontLogoZoom;
        if (data.frontLogoPosX !== undefined) CanvasManager.frontLogoPosX = data.frontLogoPosX;
        if (data.frontLogoPosY !== undefined) CanvasManager.frontLogoPosY = data.frontLogoPosY;
        if (data.frontLogoRotation !== undefined) CanvasManager.frontLogoRotation = data.frontLogoRotation;

        // Back top logo
        if (data.topLogoZoom !== undefined) CanvasManager.topLogoZoom = data.topLogoZoom;
        if (data.topLogoPosX !== undefined) CanvasManager.topLogoPosX = data.topLogoPosX;
        if (data.topLogoPosY !== undefined) CanvasManager.topLogoPosY = data.topLogoPosY;
        if (data.topLogoRotation !== undefined) CanvasManager.topLogoRotation = data.topLogoRotation;

        // Back bottom logo
        if (data.logoZoom !== undefined) CanvasManager.logoZoom = data.logoZoom;
        if (data.logoPosX !== undefined) CanvasManager.logoPosX = data.logoPosX;
        if (data.logoPosY !== undefined) CanvasManager.logoPosY = data.logoPosY;
        if (data.logoRotation !== undefined) CanvasManager.logoRotation = data.logoRotation;

        // Signature
        if (data.signatureZoom !== undefined) CanvasManager.signatureZoom = data.signatureZoom;
        if (data.signaturePosX !== undefined) CanvasManager.signaturePosX = data.signaturePosX;
        if (data.signaturePosY !== undefined) CanvasManager.signaturePosY = data.signaturePosY;

        // Back side enabled
        if (data.enableBackSide !== undefined) CanvasManager.enableBackSide = data.enableBackSide;

        // Back side labels
        if (data.backNameLabel !== undefined) CanvasManager.backNameLabel = data.backNameLabel;
        if (data.backNameValue !== undefined) CanvasManager.backNameValue = data.backNameValue;
        if (data.backClassLabel !== undefined) CanvasManager.backClassLabel = data.backClassLabel;
        if (data.backClassValue !== undefined) CanvasManager.backClassValue = data.backClassValue;
        if (data.backSeasonLabel !== undefined) CanvasManager.backSeasonLabel = data.backSeasonLabel;
        if (data.backSeasonValue !== undefined) CanvasManager.backSeasonValue = data.backSeasonValue;
        if (data.backGroupName !== undefined) CanvasManager.backGroupName = data.backGroupName;
        if (data.backTopTextHeight !== undefined) CanvasManager.backTopTextHeight = data.backTopTextHeight;
        if (data.backBottomTextHeight !== undefined) CanvasManager.backBottomTextHeight = data.backBottomTextHeight;

        // Corner rounding
        if (data.cornerRadius !== undefined) CanvasManager.cornerRadius = data.cornerRadius;

        // QR code
        if (data.qrCodeLink !== undefined) CanvasManager.qrCodeLink = data.qrCodeLink;

        // Template
        if (data.templateOpacity !== undefined) CanvasManager.templateOpacity = data.templateOpacity;
        if (data.showTemplate !== undefined) CanvasManager.showTemplate = data.showTemplate;

        // Back side template
        if (data.templateOpacityBack !== undefined) CanvasManager.templateOpacityBack = data.templateOpacityBack;
        if (data.showTemplateBack !== undefined) CanvasManager.showTemplateBack = data.showTemplateBack;

        // Image transform
        if (data.imageScale !== undefined) CanvasManager.imageScale = data.imageScale;
        if (data.imagePosX !== undefined) CanvasManager.imagePosX = data.imagePosX;
        if (data.imagePosY !== undefined) CanvasManager.imagePosY = data.imagePosY;
        if (data.imageRotation !== undefined) CanvasManager.imageRotation = data.imageRotation;

        // Back image transform
        if (data.backImageScale !== undefined) CanvasManager.backImageScale = data.backImageScale;
        if (data.backImagePosX !== undefined) CanvasManager.backImagePosX = data.backImagePosX;
        if (data.backImagePosY !== undefined) CanvasManager.backImagePosY = data.backImagePosY;

        // Frame properties
        if (data.frameOpacity !== undefined) CanvasManager.frameOpacity = data.frameOpacity;
        if (data.frameScale !== undefined) CanvasManager.frameScale = data.frameScale;
        if (data.framePosX !== undefined) CanvasManager.framePosX = data.framePosX;
        if (data.framePosY !== undefined) CanvasManager.framePosY = data.framePosY;
        if (data.frameRotation !== undefined) CanvasManager.frameRotation = data.frameRotation;
        if (data.showFrame !== undefined) CanvasManager.showFrame = data.showFrame;

        // Re-render
        CanvasManager.render();
        CanvasManager.updateBackSidePreview();
    },

    /**
     * Get all saved presets from localStorage
     * @returns {Array} Array of { name, data, timestamp }
     */
    getPresets() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to read presets:', e);
            return [];
        }
    },

    /**
     * Save a new preset
     * @param {string} name - Preset name
     * @returns {boolean} Success
     */
    savePreset(name) {
        const presets = this.getPresets();

        if (presets.length >= this.MAX_PRESETS) {
            ToastManager.warning(`Maximum of ${this.MAX_PRESETS} presets reached. Delete one first.`);
            return false;
        }

        const preset = {
            name: name.trim(),
            data: this.collectState(),
            timestamp: Date.now()
        };

        presets.push(preset);

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(presets));
            console.log('Preset saved:', name);
            return true;
        } catch (e) {
            console.error('Failed to save preset:', e);
            ToastManager.error('Failed to save preset. LocalStorage may be full.');
            return false;
        }
    },

    /**
     * Load a preset by index
     * @param {number} index - Preset index
     * @returns {boolean} Success
     */
    async loadPreset(index) {
        const presets = this.getPresets();
        if (index < 0 || index >= presets.length) return false;

        const preset = presets[index];
        this.applyState(preset.data);
        await UIManager.syncUIFromPreset(preset.data);

        console.log('Preset loaded:', preset.name);
        return true;
    },

    /**
     * Delete a preset by index
     * @param {number} index - Preset index
     * @returns {boolean} Success
     */
    deletePreset(index) {
        const presets = this.getPresets();
        if (index < 0 || index >= presets.length) return false;

        const name = presets[index].name;
        presets.splice(index, 1);

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(presets));
            console.log('Preset deleted:', name);
            return true;
        } catch (e) {
            console.error('Failed to delete preset:', e);
            return false;
        }
    },

    /**
     * Render the preset list into the given container element
     * @param {HTMLElement} container - The list container
     */
    renderPresetList(container) {
        const presets = this.getPresets();
        container.innerHTML = '';

        if (presets.length === 0) {
            container.innerHTML = '<p class="upload-hint" style="text-align: center; padding: var(--space-sm) 0;">No saved presets</p>';
            return;
        }

        presets.forEach((preset, index) => {
            const item = document.createElement('div');
            item.className = 'preset-item';

            const name = document.createElement('span');
            name.className = 'preset-item-name';
            name.textContent = preset.name;
            name.title = preset.name;

            const actions = document.createElement('div');
            actions.className = 'preset-item-actions';

            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn btn-secondary btn-small';
            loadBtn.innerHTML = '<i data-lucide="upload"></i>';
            loadBtn.title = 'Load preset';
            loadBtn.addEventListener('click', () => {
                this.loadPreset(index);
                this.renderPresetList(container);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-secondary btn-small';
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.title = 'Delete preset';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Delete preset "${preset.name}"?`)) {
                    this.deletePreset(index);
                    this.renderPresetList(container);
                }
            });

            actions.appendChild(loadBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(name);
            item.appendChild(actions);
            container.appendChild(item);
        });

        // Re-initialize lucide icons for dynamically added elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    /**
     * Initialize preset UI - bind save button and render list
     */
    initUI() {
        const saveBtn = document.getElementById('presetSaveBtn');
        const listContainer = document.getElementById('presetList');

        if (!saveBtn || !listContainer) return;

        saveBtn.addEventListener('click', () => {
            const name = prompt('Enter a name for this preset:');
            if (name && name.trim()) {
                if (this.savePreset(name)) {
                    this.renderPresetList(listContainer);
                }
            }
        });

        this.renderPresetList(listContainer);

        // Phase 5: Share Template
        const shareBtn = document.getElementById('shareTemplateBtn');
        const importBtn = document.getElementById('importShareCodeBtn');
        const shareInput = document.getElementById('shareCodeInput');

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                this.copyShareURL();
                const originalHTML = shareBtn.innerHTML;
                shareBtn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i> Copied!';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                setTimeout(() => {
                    shareBtn.innerHTML = originalHTML;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }, 2000);
            });
        }

        if (importBtn && shareInput) {
            importBtn.addEventListener('click', () => {
                const input = shareInput.value.trim();
                if (!input) return;
                // Support both full URLs and bare codes
                const match = input.match(/[?&]preset=([^&]+)/);
                const code = match ? match[1] : input;
                this.loadFromShareCode(code);
                shareInput.value = '';
            });

            shareInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    importBtn.click();
                }
            });
        }
    },

    // --- Phase 5: Template Share Codes ---

    /**
     * Encode current state as a base64url share code
     * @returns {string} Share code
     */
    generateShareCode() {
        const state = this.collectState();
        // Exclude template overlay settings (require uploaded images)
        delete state.templateOpacity;
        delete state.showTemplate;
        delete state.templateOpacityBack;
        delete state.showTemplateBack;
        const json = JSON.stringify(state);
        return btoa(json)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },

    /**
     * Decode a base64url share code back to preset data
     * @param {string} code - Share code
     * @returns {Object} Preset data
     */
    decodeShareCode(code) {
        let padded = code.replace(/-/g, '+').replace(/_/g, '/');
        const remainder = padded.length % 4;
        if (remainder) padded += '='.repeat(4 - remainder);
        return JSON.parse(atob(padded));
    },

    /**
     * Load preset from a share code
     * @param {string} code - Share code
     */
    async loadFromShareCode(code) {
        try {
            const data = this.decodeShareCode(code);
            this.applyState(data);
            await UIManager.syncUIFromPreset(data);
            console.log('Share code loaded successfully');
        } catch (e) {
            console.error('Failed to load share code:', e);
            ToastManager.error('Invalid share code. Please check and try again.');
        }
    },

    /**
     * Copy a share URL with the current state to clipboard
     */
    copyShareURL() {
        const code = this.generateShareCode();
        const url = `${location.origin}${location.pathname}?preset=${code}`;
        navigator.clipboard.writeText(url).then(() => {
            console.log('Share URL copied to clipboard');
            ToastManager.success('Share URL copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            console.log('Share URL copied to clipboard (fallback)');
            ToastManager.success('Share URL copied to clipboard!');
        });
    },

    /**
     * Check URL parameters for a share code and auto-load it
     */
    async checkURLParams() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('preset');
        if (code) {
            console.log('Found share code in URL, loading...');
            await this.loadFromShareCode(code);
            // Clean up URL without reloading
            const cleanURL = location.origin + location.pathname;
            window.history.replaceState({}, document.title, cleanURL);
        }
    }
};
