/**
 * savedcards.js
 * Manages saving complete photocards (settings + images) to IndexedDB
 */

const SavedCardsManager = {
    DB_NAME: 'objektify_db',
    DB_VERSION: 1,
    STORE_NAME: 'saved_cards',
    MAX_CARDS: 100,
    MAX_CARD_SIZE_MB: 20,
    THUMBNAIL_WIDTH: 300,
    THUMBNAIL_HEIGHT: 460,
    THUMBNAIL_QUALITY: 0.8,
    db: null,

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<void>}
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[OK] SavedCardsManager IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const objectStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('name', 'name', { unique: false });
                    console.log('[OK] Created saved_cards object store');
                }
            };
        });
    },

    /**
     * Generate a UUID v4
     * @returns {string}
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Collect complete state including all settings and image transform data
     * @returns {Object}
     */
    collectCompleteState() {
        return PresetManager.collectState();
    },

    /**
     * Extract all image data URLs from CanvasManager
     * @returns {Object} Image data URLs
     */
    extractImages() {
        const images = {};

        // Main uploaded image
        if (CanvasManager.uploadedImage && CanvasManager.uploadedImage.src) {
            images.uploadedImage = CanvasManager.uploadedImage.src;
        }

        // Border image
        if (CanvasManager.borderImage && CanvasManager.borderImage.src) {
            images.borderImage = CanvasManager.borderImage.src;
        }

        // Signature
        if (CanvasManager.signatureImage && CanvasManager.signatureImage.src) {
            images.signatureImage = CanvasManager.signatureImage.src;
        }

        // Top logo (back side)
        if (CanvasManager.topLogoImage && CanvasManager.topLogoImage.src) {
            images.topLogoImage = CanvasManager.topLogoImage.src;
        }

        // Bottom logo (back side)
        if (CanvasManager.logoImage && CanvasManager.logoImage.src) {
            images.logoImage = CanvasManager.logoImage.src;
        }

        // Front logo
        if (CanvasManager.frontLogoImage && CanvasManager.frontLogoImage.src) {
            images.frontLogoImage = CanvasManager.frontLogoImage.src;
        }

        // Frame
        if (CanvasManager.frameImage && CanvasManager.frameImage.src) {
            images.frameImage = CanvasManager.frameImage.src;
        }

        // Back uploaded image
        if (CanvasManager.backUploadedImage && CanvasManager.backUploadedImage.src) {
            images.backUploadedImage = CanvasManager.backUploadedImage.src;
        }

        // Template images (front and back)
        if (CanvasManager.templateImage && CanvasManager.templateImage.src) {
            images.templateImage = CanvasManager.templateImage.src;
        }
        if (CanvasManager.templateImageBack && CanvasManager.templateImageBack.src) {
            images.templateImageBack = CanvasManager.templateImageBack.src;
        }

        return images;
    },

    /**
     * Generate thumbnail from canvas
     * @param {HTMLCanvasElement} canvas - Source canvas
     * @returns {string} Data URL of thumbnail
     */
    generateThumbnail(canvas) {
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = this.THUMBNAIL_WIDTH;
        offscreenCanvas.height = this.THUMBNAIL_HEIGHT;
        const ctx = offscreenCanvas.getContext('2d');

        // Fill with gray background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.THUMBNAIL_WIDTH, this.THUMBNAIL_HEIGHT);

        // Calculate scaling to fit
        const scale = Math.min(
            this.THUMBNAIL_WIDTH / canvas.width,
            this.THUMBNAIL_HEIGHT / canvas.height
        );
        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;

        // Center the image
        const x = (this.THUMBNAIL_WIDTH - scaledWidth) / 2;
        const y = (this.THUMBNAIL_HEIGHT - scaledHeight) / 2;

        // Draw scaled canvas
        ctx.drawImage(canvas, x, y, scaledWidth, scaledHeight);

        return offscreenCanvas.toDataURL('image/png', this.THUMBNAIL_QUALITY);
    },

    /**
     * Save current photocard to collection
     * @param {string} name - Card name
     * @returns {Promise<string>} Card ID
     */
    async saveCard(name) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Validate: must have main image
        if (!CanvasManager.uploadedImage) {
            throw new Error('No image uploaded. Please upload an image first.');
        }

        // Check card limit
        const cards = await this.getAllCards();
        if (cards.length >= this.MAX_CARDS) {
            throw new Error(`Maximum of ${this.MAX_CARDS} cards reached. Delete some cards first.`);
        }

        // Collect data
        const settings = this.collectCompleteState();
        const images = this.extractImages();
        const history = HistoryManager.exportHistory();

        // Generate thumbnails
        const thumbnails = {
            front: this.generateThumbnail(CanvasManager.canvas)
        };

        // If back side is enabled, generate back thumbnail
        if (CanvasManager.enableBackSide) {
            const backCanvas = document.getElementById('backPreviewCanvas');
            if (backCanvas) {
                thumbnails.back = this.generateThumbnail(backCanvas);
            }
        }

        // Create card object
        const card = {
            id: this.generateUUID(),
            name: name.trim(),
            timestamp: Date.now(),
            settings,
            images,
            thumbnails,
            history
        };

        // Validate size (rough estimate)
        const cardJSON = JSON.stringify(card);
        const sizeInMB = cardJSON.length / (1024 * 1024);
        if (sizeInMB > this.MAX_CARD_SIZE_MB) {
            throw new Error(`Card size (${sizeInMB.toFixed(2)} MB) exceeds limit of ${this.MAX_CARD_SIZE_MB} MB`);
        }

        // Save to IndexedDB
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(this.STORE_NAME);
            const request = objectStore.add(card);

            request.onsuccess = () => {
                console.log('Card saved:', card.name);
                resolve(card.id);
            };

            request.onerror = () => {
                console.error('Failed to save card:', request.error);
                reject(request.error);
            };
        });
    },

    /**
     * Load a saved card by ID
     * @param {string} id - Card ID
     * @returns {Promise<void>}
     */
    async loadCard(id) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(this.STORE_NAME);
            const request = objectStore.get(id);

            request.onsuccess = async () => {
                const card = request.result;
                if (!card) {
                    reject(new Error('Card not found'));
                    return;
                }

                try {
                    // Restore images
                    await this.restoreImages(card.images);

                    // Apply settings
                    PresetManager.applyState(card.settings);
                    await UIManager.syncUIFromPreset(card.settings);

                    // Restore history if available (for backward compatibility)
                    if (card.history) {
                        HistoryManager.importHistory(card.history);
                    }

                    console.log('Card loaded:', card.name);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * Restore images from data URLs
     * @param {Object} imageData - Image data URLs
     * @returns {Promise<void>}
     */
    async restoreImages(imageData) {
        const loadImage = (src) => {
            return new Promise((resolve, reject) => {
                if (!src) {
                    resolve(null);
                    return;
                }

                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = src;
            });
        };

        // Restore main image
        if (imageData.uploadedImage) {
            CanvasManager.uploadedImage = await loadImage(imageData.uploadedImage);
        }

        // Restore border image
        if (imageData.borderImage) {
            CanvasManager.borderImage = await loadImage(imageData.borderImage);
        }

        // Restore signature
        if (imageData.signatureImage) {
            CanvasManager.signatureImage = await loadImage(imageData.signatureImage);
        }

        // Restore top logo
        if (imageData.topLogoImage) {
            CanvasManager.topLogoImage = await loadImage(imageData.topLogoImage);
        }

        // Restore bottom logo
        if (imageData.logoImage) {
            CanvasManager.logoImage = await loadImage(imageData.logoImage);
        }

        // Restore front logo
        if (imageData.frontLogoImage) {
            CanvasManager.frontLogoImage = await loadImage(imageData.frontLogoImage);
        }

        // Restore frame
        if (imageData.frameImage) {
            CanvasManager.frameImage = await loadImage(imageData.frameImage);
            CanvasManager.showFrame = true;
        }

        // Restore back uploaded image
        if (imageData.backUploadedImage) {
            CanvasManager.backUploadedImage = await loadImage(imageData.backUploadedImage);
        }

        // Restore templates
        if (imageData.templateImage) {
            CanvasManager.templateImage = await loadImage(imageData.templateImage);
        }
        if (imageData.templateImageBack) {
            CanvasManager.templateImageBack = await loadImage(imageData.templateImageBack);
        }
    },

    /**
     * Delete a card by ID
     * @param {string} id - Card ID
     * @returns {Promise<void>}
     */
    async deleteCard(id) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(this.STORE_NAME);
            const request = objectStore.delete(id);

            request.onsuccess = () => {
                console.log('Card deleted:', id);
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * Get all saved cards
     * @returns {Promise<Array>} Array of cards sorted by timestamp (newest first)
     */
    async getAllCards() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(this.STORE_NAME);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                const cards = request.result || [];
                // Sort by timestamp, newest first
                cards.sort((a, b) => b.timestamp - a.timestamp);
                resolve(cards);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    /**
     * Get storage info (count and estimated size)
     * @returns {Promise<Object>}
     */
    async getStorageInfo() {
        const cards = await this.getAllCards();
        const count = cards.length;

        // Rough size estimate
        let totalSize = 0;
        cards.forEach(card => {
            totalSize += JSON.stringify(card).length;
        });
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

        return { count, sizeMB };
    },

    /**
     * Render the saved cards grid
     */
    async renderCardsList() {
        const container = document.getElementById('savedCardsList');
        const storageInfo = document.getElementById('collectionStorageInfo');

        if (!container) return;

        try {
            const cards = await this.getAllCards();
            const info = await this.getStorageInfo();

            // Update storage info
            if (storageInfo) {
                storageInfo.textContent = `${info.count} / ${this.MAX_CARDS} cards saved (${info.sizeMB} MB used)`;
            }

            // Render grid
            if (cards.length === 0) {
                container.innerHTML = '<p class="upload-hint" style="text-align: center; padding: var(--space-md) 0;">No saved photocards yet</p>';
                return;
            }

            container.innerHTML = '';

            cards.forEach(card => {
                const item = document.createElement('div');
                item.className = 'saved-card-item';

                // Thumbnail
                const thumbnail = document.createElement('img');
                thumbnail.className = 'saved-card-thumbnail';
                thumbnail.src = card.thumbnails.front;
                thumbnail.alt = card.name;

                // Info section
                const info = document.createElement('div');
                info.className = 'saved-card-info';

                const name = document.createElement('div');
                name.className = 'saved-card-name';
                name.textContent = card.name;
                name.title = card.name;

                info.appendChild(name);

                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'saved-card-delete';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = 'Delete card';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${card.name}"?`)) {
                        try {
                            await this.deleteCard(card.id);
                            await this.renderCardsList();
                        } catch (error) {
                            ToastManager.error(`Failed to delete card: ${error.message}`);
                        }
                    }
                });

                // Load card on click
                item.addEventListener('click', async () => {
                    try {
                        await this.loadCard(card.id);
                        UIManager.updateCanvasUploadPlaceholder();
                        ToastManager.success('Card loaded!');
                    } catch (error) {
                        ToastManager.error(`Failed to load card: ${error.message}`);
                    }
                });

                item.appendChild(thumbnail);
                item.appendChild(info);
                item.appendChild(deleteBtn);
                container.appendChild(item);
            });

        } catch (error) {
            console.error('Failed to render cards list:', error);
            container.innerHTML = '<p class="upload-hint" style="text-align: center; padding: var(--space-md) 0; color: red;">Failed to load cards</p>';
        }
    },

    /**
     * Initialize the Collection UI
     */
    initUI() {
        const saveBtn = document.getElementById('saveToCollectionBtn');

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (!CanvasManager.uploadedImage) {
                    ToastManager.warning('Please upload an image first.');
                    return;
                }

                const name = prompt('Enter a name for this photocard:');
                if (!name || !name.trim()) return;

                try {
                    await this.saveCard(name.trim());
                    await this.renderCardsList();
                    ToastManager.success('Photocard saved to collection!');
                } catch (error) {
                    ToastManager.error(`Failed to save: ${error.message}`);
                }
            });
        }
    }
};
