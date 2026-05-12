/**
 * history.js
 * Undo/Redo system using state snapshots
 */

const HistoryManager = {
    MAX_HISTORY: 50,
    STORAGE_KEY: 'objektify_session_state',
    _isRestoring: false,
    _currentIndex: -1,
    _history: [],
    _sliderBeforeState: null,

    init() {
        // Use a single linear history array with a pointer
        this._history = [];
        this._currentIndex = -1;

        // Try to restore previous session
        if (!this.loadSessionState()) {
            // If no saved session, push initial state
            this.pushState('Initial state');
        }

        // Bind buttons
        this._undoBtn = document.getElementById('undoBtn');
        this._redoBtn = document.getElementById('redoBtn');
        this._historyList = document.getElementById('historyList');

        if (this._undoBtn) {
            this._undoBtn.addEventListener('click', () => this.undo());
        }
        if (this._redoBtn) {
            this._redoBtn.addEventListener('click', () => this.redo());
        }

        this.updateUI();
    },

    pushState(label) {
        if (this._isRestoring) return;

        const state = PresetManager.collectState();
        const images = SavedCardsManager.extractImages();

        // Don't push if identical to current state
        if (this._currentIndex >= 0) {
            const current = this._history[this._currentIndex];
            if (JSON.stringify(current.state) === JSON.stringify(state) &&
                JSON.stringify(current.images) === JSON.stringify(images)) {
                return;
            }
        }

        // Trim any future states (redo history) when pushing new state
        this._history = this._history.slice(0, this._currentIndex + 1);

        // Push new entry with both state and images
        this._history.push({
            state: JSON.parse(JSON.stringify(state)),
            images: JSON.parse(JSON.stringify(images)),
            label
        });
        this._currentIndex = this._history.length - 1;

        // Cap history size
        if (this._history.length > this.MAX_HISTORY) {
            this._history.shift();
            this._currentIndex--;
        }

        this.updateUI();
        this.saveSessionState();
    },

    async undo() {
        if (!this.canUndo()) return;

        this._isRestoring = true;
        this._currentIndex--;
        const entry = this._history[this._currentIndex];
        await this.restoreImages(entry.images);
        PresetManager.applyState(entry.state);
        await UIManager.syncUIFromPreset(entry.state);
        this._ensureCanvasToggleVisibility();
        this._isRestoring = false;

        this.updateUI();
        this.saveSessionState();
    },

    async redo() {
        if (!this.canRedo()) return;

        this._isRestoring = true;
        this._currentIndex++;
        const entry = this._history[this._currentIndex];
        await this.restoreImages(entry.images);
        PresetManager.applyState(entry.state);
        await UIManager.syncUIFromPreset(entry.state);
        this._ensureCanvasToggleVisibility();
        this._isRestoring = false;

        this.updateUI();
        this.saveSessionState();
    },

    async goToIndex(index) {
        if (index < 0 || index >= this._history.length || index === this._currentIndex) return;

        this._isRestoring = true;
        this._currentIndex = index;
        const entry = this._history[this._currentIndex];
        await this.restoreImages(entry.images);
        PresetManager.applyState(entry.state);
        await UIManager.syncUIFromPreset(entry.state);
        this._ensureCanvasToggleVisibility();
        this._isRestoring = false;

        this.updateUI();
        this.saveSessionState();
    },

    canUndo() {
        return this._currentIndex > 0;
    },

    canRedo() {
        return this._currentIndex < this._history.length - 1;
    },

    // Call on mousedown/touchstart of a slider to capture "before" state
    captureSliderStart() {
        if (this._isRestoring) return;
        this._sliderBeforeState = {
            state: PresetManager.collectState(),
            images: SavedCardsManager.extractImages()
        };
    },

    // Call on mouseup/touchend/change of a slider to push if changed
    captureSliderEnd(label) {
        if (this._isRestoring || !this._sliderBeforeState) return;
        const afterState = PresetManager.collectState();
        const afterImages = SavedCardsManager.extractImages();
        if (JSON.stringify(this._sliderBeforeState.state) !== JSON.stringify(afterState) ||
            JSON.stringify(this._sliderBeforeState.images) !== JSON.stringify(afterImages)) {
            this.pushState(label);
        }
        this._sliderBeforeState = null;
    },

    updateUI() {
        // Update button states
        if (this._undoBtn) {
            this._undoBtn.disabled = !this.canUndo();
        }
        if (this._redoBtn) {
            this._redoBtn.disabled = !this.canRedo();
        }

        // Update history panel
        this.renderHistoryPanel();
    },

    async restoreImages(imageData) {
        const loadImage = (src) => {
            return new Promise((resolve) => {
                if (!src) {
                    resolve(null);
                    return;
                }
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null); // Resolve with null instead of rejecting
                img.src = src;
            });
        };

        // Clear all images first
        CanvasManager.uploadedImage = null;
        CanvasManager.borderImage = null;
        CanvasManager.signatureImage = null;
        CanvasManager.topLogoImage = null;
        CanvasManager.logoImage = null;
        CanvasManager.frontLogoImage = null;
        CanvasManager.frameImage = null;
        CanvasManager.templateImage = null;
        CanvasManager.templateImageBack = null;

        // Restore images
        if (imageData.uploadedImage) {
            CanvasManager.uploadedImage = await loadImage(imageData.uploadedImage);
        }
        if (imageData.borderImage) {
            CanvasManager.borderImage = await loadImage(imageData.borderImage);
        }
        if (imageData.signatureImage) {
            CanvasManager.signatureImage = await loadImage(imageData.signatureImage);
        }
        if (imageData.topLogoImage) {
            CanvasManager.topLogoImage = await loadImage(imageData.topLogoImage);
        }
        if (imageData.logoImage) {
            CanvasManager.logoImage = await loadImage(imageData.logoImage);
        }
        if (imageData.frontLogoImage) {
            CanvasManager.frontLogoImage = await loadImage(imageData.frontLogoImage);
        }
        if (imageData.frameImage) {
            CanvasManager.frameImage = await loadImage(imageData.frameImage);
        }
        if (imageData.templateImage) {
            CanvasManager.templateImage = await loadImage(imageData.templateImage);
        }
        if (imageData.templateImageBack) {
            CanvasManager.templateImageBack = await loadImage(imageData.templateImageBack);
        }

        // Re-render canvas
        CanvasManager.render();
        CanvasManager.updateBackSidePreview();
    },

    renderHistoryPanel() {
        if (!this._historyList) return;

        this._historyList.innerHTML = '';

        // Show last 15 entries max, always including current
        const entries = this._history;
        const start = Math.max(0, entries.length - 15);

        for (let i = entries.length - 1; i >= start; i--) {
            const entry = entries[i];
            const item = document.createElement('button');
            item.className = 'history-item' + (i === this._currentIndex ? ' active' : '');
            if (i > this._currentIndex) item.classList.add('future');

            const label = document.createElement('span');
            label.className = 'history-label';
            label.textContent = entry.label;

            const index = document.createElement('span');
            index.className = 'history-index';
            index.textContent = `#${i + 1}`;

            item.appendChild(label);
            item.appendChild(index);

            const idx = i;
            item.addEventListener('click', () => this.goToIndex(idx));

            this._historyList.appendChild(item);
        }
    },

    /**
     * Save current session state to localStorage
     */
    saveSessionState() {
        try {
            const sessionData = {
                history: this._history,
                currentIndex: this._currentIndex,
                timestamp: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
            console.log('[Session] State saved to localStorage');
        } catch (error) {
            console.warn('[Session] Failed to save state:', error);
            // If localStorage is full, try clearing old data
            if (error.name === 'QuotaExceededError') {
                try {
                    localStorage.removeItem(this.STORAGE_KEY);
                    console.warn('[Session] Cleared old session data due to quota exceeded');
                } catch (e) {
                    console.error('[Session] Could not clear storage:', e);
                }
            }
        }
    },

    /**
     * Load session state from localStorage
     * @returns {boolean} True if state was loaded, false otherwise
     */
    loadSessionState() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) {
                console.log('[Session] No saved session found');
                return false;
            }

            const sessionData = JSON.parse(saved);
            if (!sessionData || !Array.isArray(sessionData.history)) {
                console.warn('[Session] Invalid session data');
                return false;
            }

            this._isRestoring = true;
            this._history = sessionData.history;
            this._currentIndex = sessionData.currentIndex;

            // Restore the current state
            if (this._currentIndex >= 0 && this._currentIndex < this._history.length) {
                const entry = this._history[this._currentIndex];

                // Restore images first
                this.restoreImages(entry.images).then(() => {
                    // Then apply state
                    PresetManager.applyState(entry.state);
                    UIManager.syncUIFromPreset(entry.state).then(() => {
                        this._ensureCanvasToggleVisibility();
                        this._isRestoring = false;
                        this.updateUI();

                        // Restore bulk session (rows + template) and update UI accordingly
                        BulkManager.loadBulkState().then((hasBulk) => {
                            if (hasBulk) {
                                // Show the "Back to Bulk" banner so the user can return to bulk mode
                                BulkManager.elements.backToBulkLabel.textContent = 'Bulk Mode';
                                BulkManager.elements.backToBulkLabelBottom.textContent = 'Bulk Mode';
                                BulkManager.elements.backToBulkBanner.style.display = 'flex';
                                BulkManager.elements.backToBulkBannerBottom.style.display = 'flex';
                                // Show the first row on the canvas
                                BulkManager.applyRowToCanvas(BulkManager.rows[0]);
                                CanvasManager.showTemplate = false;
                                CanvasManager.showTemplateBack = false;
                                CanvasManager.render();
                                CanvasManager.updateBackSidePreview();
                                if (typeof lucide !== 'undefined') lucide.createIcons();
                            }
                            UIManager.updateCanvasUploadPlaceholder();
                            console.log('[Session] State restored from localStorage');
                        });
                    });
                });

                return true;
            }

            this._isRestoring = false;
            return false;
        } catch (error) {
            console.error('[Session] Failed to load state:', error);
            this._isRestoring = false;
            return false;
        }
    },

    /**
     * Clear saved session state
     */
    clearSessionState() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            console.log('[Session] Session state cleared');
        } catch (error) {
            console.error('[Session] Failed to clear session state:', error);
        }
    },

    /**
     * Force canvas view toggle visibility to match current CanvasManager state
     * This is a comprehensive fix that always ensures correct visibility
     */
    _ensureCanvasToggleVisibility() {
        const canvasViewToggle = document.getElementById('canvasViewToggle');
        if (!canvasViewToggle) return;

        // Always keep the canvas view toggle visible so back side is accessible
        canvasViewToggle.style.display = '';
    },

    /**
     * Export history for saving to collection
     * @returns {Object} History data including stack and current index
     */
    exportHistory() {
        return {
            history: JSON.parse(JSON.stringify(this._history)),
            currentIndex: this._currentIndex
        };
    },

    /**
     * Import history when loading from collection
     * @param {Object} historyData - History data with history array and currentIndex
     */
    importHistory(historyData) {
        if (!historyData || !Array.isArray(historyData.history)) {
            console.warn('Invalid history data, skipping import');
            return;
        }

        this._isRestoring = true;
        this._history = JSON.parse(JSON.stringify(historyData.history));
        this._currentIndex = historyData.currentIndex;
        this._isRestoring = false;

        // Ensure canvas toggle visibility matches current state
        this._ensureCanvasToggleVisibility();

        this.updateUI();
        console.log('History imported:', this._history.length, 'entries');
    }
};
