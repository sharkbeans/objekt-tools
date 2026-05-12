/**
 * bulk.js
 * BulkManager - Handles bulk card creation with a shared template
 */

const BulkManager = {
    rows: [],          // Array of { image, fileName, topText, middleText, bottomText, backNameValue, backClassValue, backSeasonValue, imageScale, imagePosX, imagePosY }
    template: null,    // Snapshot of PresetManager.collectState() + image refs
    isOpen: false,
    editingRowIndex: -1,       // Index of row currently being edited on main canvas (-1 = not editing)
    _templateBeforeEdit: null, // Deep copy of template.state before entering edit mode

    BULK_STORAGE_KEY: 'objektify_bulk_session',

    // DOM element refs
    elements: {},

    init() {
        this.elements = {
            modal: document.getElementById('bulkModal'),
            backdrop: document.querySelector('.bulk-modal-backdrop'),
            closeBtn: document.getElementById('closeBulkModal'),
            uploadZone: document.getElementById('bulkUploadZone'),
            fileInput: document.getElementById('bulkImageUpload'),
            actionsBar: document.getElementById('bulkActionsBar'),
            countLabel: document.getElementById('bulkCount'),
            applyRow1Btn: document.getElementById('bulkApplyRow1'),
            addMoreBtn: document.getElementById('bulkAddMore'),
            clearAllBtn: document.getElementById('bulkClearAll'),
            tableContainer: document.getElementById('bulkTableContainer'),
            tableBody: document.getElementById('bulkTableBody'),
            progress: document.getElementById('bulkProgress'),
            progressFill: document.getElementById('bulkProgressFill'),
            progressText: document.getElementById('bulkProgressText'),
            exportAllBtn: document.getElementById('bulkExportAll'),
            exportFrontOnlyBtn: document.getElementById('bulkExportFrontOnly'),
            exportBackOnlyBtn: document.getElementById('bulkExportBackOnly'),
            bulkCreateBtn: document.getElementById('bulkCreateBtn'),       // May be null (removed from UI)
            bulkCreateBtnMobile: document.getElementById('bulkCreateBtnMobile'), // May be null (removed from UI)
            // Bulk edit banner (on main canvas)
            backToBulkBanner: document.getElementById('bulkEditBanner'),
            backToBulkLabel: document.getElementById('bulkEditLabel'),
            backToBulkBtn: document.getElementById('backToBulkBtn'),
            // Bottom clone banner
            backToBulkBannerBottom: document.getElementById('bulkEditBannerBottom'),
            backToBulkLabelBottom: document.getElementById('bulkEditLabelBottom'),
            backToBulkBtnBottom: document.getElementById('backToBulkBtnBottom'),
            // Canvas nav (chevrons + counter)
            canvasNav: document.getElementById('bulkCanvasNav'),
            canvasPrevBtn: document.getElementById('bulkCanvasPrev'),
            canvasNextBtn: document.getElementById('bulkCanvasNext'),
            canvasCounter: document.getElementById('bulkCanvasCounter'),
            canvasCounterLabel: document.querySelector('#bulkCanvasCounter .bulk-canvas-counter-label'),
            // Side nav buttons (desktop/tablet)
            canvasSidePrevBtn: document.getElementById('bulkCanvasSidePrev'),
            canvasSideNextBtn: document.getElementById('bulkCanvasSideNext'),
        };

        this.bindEvents();
        console.log('[OK] BulkManager initialized');
    },

    bindEvents() {
        // Open modal (buttons may not exist if removed from UI)
        if (this.elements.bulkCreateBtn) {
            this.elements.bulkCreateBtn.addEventListener('click', () => this.openModal());
        }
        if (this.elements.bulkCreateBtnMobile) {
            this.elements.bulkCreateBtnMobile.addEventListener('click', () => this.openModal());
        }

        // Close modal (only via close button, not backdrop click)
        this.elements.closeBtn.addEventListener('click', () => this.closeModal());

        // File upload
        this.elements.uploadZone.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Drag and drop
        this.elements.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadZone.classList.add('drag-over');
        });
        this.elements.uploadZone.addEventListener('dragleave', () => {
            this.elements.uploadZone.classList.remove('drag-over');
        });
        this.elements.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) this.handleFiles(files);
        });

        // Action buttons
        this.elements.applyRow1Btn.addEventListener('click', () => this.applyRow1ToAll());
        this.elements.addMoreBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAll());
        this.elements.exportAllBtn.addEventListener('click', () => this.exportAll('all'));
        this.elements.exportFrontOnlyBtn.addEventListener('click', () => this.exportAll('front'));
        this.elements.exportBackOnlyBtn.addEventListener('click', () => this.exportAll('back'));

        // Back to Bulk button (on main canvas banner — top and bottom)
        const backToBulkHandler = () => {
            if (this.editingRowIndex >= 0) {
                this.exitEditMode();
            } else {
                // Not in edit mode — just reopen the modal
                this.elements.backToBulkBanner.style.display = 'none';
                this.elements.backToBulkBannerBottom.style.display = 'none';
                this.openModal();
            }
        };
        this.elements.backToBulkBtn.addEventListener('click', backToBulkHandler);
        this.elements.backToBulkBtnBottom.addEventListener('click', backToBulkHandler);
        this.elements.backToBulkBanner.addEventListener('click', backToBulkHandler);
        this.elements.backToBulkBannerBottom.addEventListener('click', backToBulkHandler);

        // Canvas nav chevrons (bottom counter + side buttons)
        const prevHandler = () => {
            if (this.editingRowIndex > 0) {
                this._saveCurrentRow();
                this.enterEditMode(this.editingRowIndex - 1);
            }
        };
        const nextHandler = () => {
            if (this.editingRowIndex < this.rows.length - 1) {
                this._saveCurrentRow();
                this.enterEditMode(this.editingRowIndex + 1);
            }
        };
        this.elements.canvasPrevBtn.addEventListener('click', prevHandler);
        this.elements.canvasNextBtn.addEventListener('click', nextHandler);
        this.elements.canvasSidePrevBtn.addEventListener('click', prevHandler);
        this.elements.canvasSideNextBtn.addEventListener('click', nextHandler);
    },

    captureTemplate() {
        this.template = {
            state: PresetManager.collectState(),
            // Store image references that aren't part of presets
            uploadedImage: CanvasManager.uploadedImage,
            borderImage: CanvasManager.borderImage,
            signatureImage: CanvasManager.signatureImage,
            topLogoImage: CanvasManager.topLogoImage,
            logoImage: CanvasManager.logoImage,
            frontLogoImage: CanvasManager.frontLogoImage,
            frameImage: CanvasManager.frameImage,
            qrCodeCanvas: CanvasManager.qrCodeCanvas,
            qrCodeImage: CanvasManager.qrCodeImage,
        };
    },

    restoreTemplate() {
        if (!this.template) return;
        PresetManager.applyState(this.template.state);
        // Restore image refs
        CanvasManager.uploadedImage = this.template.uploadedImage;
        CanvasManager.borderImage = this.template.borderImage;
        CanvasManager.signatureImage = this.template.signatureImage;
        CanvasManager.topLogoImage = this.template.topLogoImage;
        CanvasManager.logoImage = this.template.logoImage;
        CanvasManager.frontLogoImage = this.template.frontLogoImage;
        CanvasManager.frameImage = this.template.frameImage;
        CanvasManager.qrCodeCanvas = this.template.qrCodeCanvas;
        CanvasManager.qrCodeImage = this.template.qrCodeImage;
        if (CanvasManager.hasImage()) CanvasManager.render();
        CanvasManager.updateBackSidePreview();
    },

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    openModal() {
        // If already in edit mode, exit it first (save changes)
        if (this.editingRowIndex >= 0) {
            this.exitEditMode();
            return;
        }
        this.captureTemplate();
        this.isOpen = true;
        this.elements.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.updateUI();
        this.elements.exportAllBtn.innerHTML = this.isMobile()
            ? '<i data-lucide="download"></i> Save All'
            : '<i data-lucide="download"></i> Download All as ZIP';
        this.elements.exportFrontOnlyBtn.innerHTML = '<i data-lucide="download"></i> Front Only';
        this.elements.exportBackOnlyBtn.innerHTML = '<i data-lucide="download"></i> Back Only';
        lucide.createIcons();
    },

    closeModal() {
        // If in edit mode, exit first (saves changes and restores template)
        if (this.editingRowIndex >= 0) {
            this._exitEditModeAndClose();
            return;
        }
        this.isOpen = false;
        this.elements.modal.style.display = 'none';
        document.body.style.overflow = '';

        // If there are rows, show the banner so user can return to bulk mode
        if (this.rows.length > 0) {
            this.editingRowIndex = 0;
            this._templateBeforeEdit = JSON.parse(JSON.stringify(this.template.state));
            this.elements.backToBulkLabel.textContent = 'Bulk Mode';
            this.elements.backToBulkLabelBottom.textContent = 'Bulk Mode';
            this.elements.backToBulkBanner.style.display = 'flex';
            this.elements.backToBulkBannerBottom.style.display = 'flex';
            // Always show row 1 on canvas when closing without choosing
            this.applyRowToCanvas(this.rows[0]);
            CanvasManager.showTemplate = false;
            CanvasManager.showTemplateBack = false;
            CanvasManager.render();
            CanvasManager.updateBackSidePreview();
            // Show canvas nav
            document.body.classList.add('bulk-editing');
            this._updateCanvasNav();
            lucide.createIcons();
            // Persist the current template state (captured in openModal)
            this.saveBulkState();
        } else {
            this.restoreTemplate();
        }
    },

    handleFiles(fileList) {
        const files = Array.from(fileList);
        const templateState = this.template.state;

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            if (file.size > 5 * 1024 * 1024) {
                console.warn(`Skipping ${file.name}: exceeds 5MB`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const wasEmpty = this.rows.length === 0;
                    this.rows.push({
                        image: img,
                        fileName: file.name,
                        topText: templateState.topText,
                        middleText: templateState.middleText,
                        bottomText: templateState.bottomText,
                        backNameValue: templateState.backNameValue,
                        backClassValue: templateState.backClassValue,
                        backSeasonValue: templateState.backSeasonValue,
                        // Per-image transform (defaults from template)
                        imageScale: Math.round(templateState.imageScale * 100),
                        imagePosX: templateState.imagePosX,
                        imagePosY: templateState.imagePosY,
                    });
                    this.updateUI();
                    this.saveBulkState();
                    // On mobile, scroll to actionsBar when first image is added
                    if (wasEmpty && window.innerWidth <= 768) {
                        setTimeout(() => {
                            this.elements.actionsBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Reset file input so same files can be re-selected
        this.elements.fileInput.value = '';
    },

    removeRow(index) {
        this.rows.splice(index, 1);
        this.updateUI();
        this.saveBulkState();
    },

    makeFirst(index) {
        if (index <= 0 || index >= this.rows.length) return;
        const [row] = this.rows.splice(index, 1);
        this.rows.unshift(row);
        this.updateUI();
        this.saveBulkState();
    },

    applyRow1ToAll() {
        if (this.rows.length < 2) return;
        const first = this.rows[0];
        const fields = ['topText', 'middleText', 'bottomText', 'backNameValue', 'backClassValue', 'backSeasonValue'];

        // Track which cells changed: array of { rowIndex, field }
        const changed = [];
        for (let i = 1; i < this.rows.length; i++) {
            for (const field of fields) {
                if (this.rows[i][field] !== first[field]) {
                    changed.push({ rowIndex: i, field });
                }
            }
            // Apply values
            for (const field of fields) {
                this.rows[i][field] = first[field];
            }
        }
        this.renderTable();

        // Flash only the cells that actually changed
        if (changed.length > 0) {
            const changedRows = new Set(changed.map(c => c.rowIndex));
            for (const { rowIndex, field } of changed) {
                const input = this.elements.tableBody.querySelector(`input[data-index="${rowIndex}"][data-field="${field}"]`);
                if (input) {
                    input.classList.add('bulk-input-changed');
                    setTimeout(() => input.classList.remove('bulk-input-changed'), 2000);
                }
            }
            if (typeof ToastManager !== 'undefined') {
                ToastManager.success(`Copied template text to ${changedRows.size} row${changedRows.size !== 1 ? 's' : ''}`);
            }
        } else {
            if (typeof ToastManager !== 'undefined') {
                ToastManager.info('All rows already match the template');
            }
        }

        // Stop flash, show confirmation
        const applyBtn = this.elements.applyRow1Btn;
        applyBtn.classList.remove('bulk-apply-flash');
        const original = applyBtn.innerHTML;
        applyBtn.innerHTML = '<i data-lucide="check"></i> Copied to all!';
        applyBtn.disabled = true;
        lucide.createIcons();
        setTimeout(() => {
            applyBtn.innerHTML = original;
            applyBtn.disabled = false;
            lucide.createIcons();
        }, 2000);
    },

    clearAll() {
        this.rows = [];
        this.updateUI();
        this.saveBulkState();
    },

    updateUI() {
        const hasRows = this.rows.length > 0;
        this.elements.actionsBar.style.display = hasRows ? 'flex' : 'none';
        this.elements.tableContainer.style.display = hasRows ? 'block' : 'none';
        this.elements.countLabel.textContent = `${this.rows.length} card${this.rows.length !== 1 ? 's' : ''}`;
        this.elements.exportAllBtn.disabled = !hasRows;
        this.elements.exportFrontOnlyBtn.disabled = !hasRows;
        this.elements.exportBackOnlyBtn.disabled = !hasRows;

        // Hide back-side columns if objekt border is off
        const showBack = CanvasManager.showObjektBorder;
        document.querySelectorAll('.bulk-back-col').forEach(el => {
            el.style.display = showBack ? '' : 'none';
        });
        // Show/hide front/back-only buttons based on back availability
        this.elements.exportFrontOnlyBtn.style.display = showBack ? '' : 'none';
        this.elements.exportBackOnlyBtn.style.display = showBack ? '' : 'none';

        this.renderTable();
    },

    renderTable() {
        const tbody = this.elements.tableBody;
        const showBack = CanvasManager.showObjektBorder;

        tbody.innerHTML = '';

        this.rows.forEach((row, index) => {
            const tr = document.createElement('tr');
            if (index === 0) tr.classList.add('bulk-row-template');
            tr.classList.add('bulk-row-template-clickable');
            tr.innerHTML = `
                <td class="bulk-col-num">${index + 1}</td>
                <td class="bulk-col-thumb">
                    <img src="${row.image.src}" alt="Card ${index + 1}" class="bulk-thumbnail">
                    ${index === 0 ? '<span class="bulk-edit-hint">click to edit</span>' : ''}
                </td>
                <td class="bulk-col-text">
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.topText)}" data-index="${index}" data-field="topText">
                </td>
                <td class="bulk-col-text bulk-col-middletext">
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.middleText)}" data-index="${index}" data-field="middleText">
                    ${index === 0 ? '<button class="bulk-random-btn" data-action="randomizeSerials" title="Randomize serials"><i data-lucide="shuffle"></i></button>' : ''}
                </td>
                <td class="bulk-col-text">
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.bottomText)}" data-index="${index}" data-field="bottomText">
                </td>
                <td class="bulk-col-text bulk-back-col" ${!showBack ? 'style="display:none"' : ''}>
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.backNameValue)}" data-index="${index}" data-field="backNameValue">
                </td>
                <td class="bulk-col-text bulk-back-col" ${!showBack ? 'style="display:none"' : ''}>
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.backClassValue)}" data-index="${index}" data-field="backClassValue">
                </td>
                <td class="bulk-col-text bulk-back-col" ${!showBack ? 'style="display:none"' : ''}>
                    <input type="text" class="bulk-input" value="${this.escapeHtml(row.backSeasonValue)}" data-index="${index}" data-field="backSeasonValue">
                </td>
                ${index === 0 ? `
                <td class="bulk-col-actions">
                    <button class="bulk-action-btn bulk-action-apply-row1" data-action="applyRow1" title="Apply to All">
                        <i data-lucide="copy"></i> Apply to All
                    </button>
                </td>` : `
                <td class="bulk-col-actions">
                    <button class="bulk-action-btn" data-action="edit" data-index="${index}" title="Edit on Canvas">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="bulk-action-btn" data-action="makeFirst" data-index="${index}" title="Make template (row 1)">
                        <i data-lucide="arrow-up-to-line"></i>
                    </button>
                    <button class="bulk-action-btn bulk-action-delete" data-action="remove" data-index="${index}" title="Remove">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>`}
            `;
            tbody.appendChild(tr);

            // Make every row clickable (anywhere except inputs/buttons) to open canvas editor
            // Use mousedown/mouseup tracking to avoid triggering on text selection drags
            let mouseDownTarget = null;
            tr.addEventListener('mousedown', (e) => {
                mouseDownTarget = e.target;
            });
            tr.addEventListener('click', (e) => {
                if (e.target.closest('input, button')) return;
                // If mousedown started inside an input, this is a text selection drag — ignore
                if (mouseDownTarget && mouseDownTarget.closest('input')) return;
                // If user selected text (drag-highlight), don't treat as a click
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) return;
                this.enterEditMode(index);
            });

            // Add separator after row 1
            if (index === 0 && this.rows.length > 1) {
                const colCount = showBack ? 9 : 6;
                const sep = document.createElement('tr');
                sep.classList.add('bulk-row-separator');
                sep.innerHTML = `<td colspan="${colCount}"><p><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;opacity:0.7"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>Row 1 is the template. Click on the row to edit shared settings (border, signature, etc.) on the canvas. Text and image adjustments are saved per card.</p></td>`;
                tbody.appendChild(sep);
            }
        });

        // Bind input change events
        tbody.querySelectorAll('.bulk-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const field = e.target.dataset.field;
                this.rows[idx][field] = e.target.value;
            });
        });

        // Bind action buttons
        tbody.querySelectorAll('.bulk-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target.closest('.bulk-action-btn');
                const action = button.dataset.action;
                const idx = parseInt(button.dataset.index);
                switch (action) {
                    case 'applyRow1': this.applyRow1ToAll(); break;
                    case 'edit': this.enterEditMode(idx); break;
                    case 'makeFirst': this.makeFirst(idx); break;
                    case 'remove': this.removeRow(idx); break;
                }
            });
        });

        // Bind random serial button
        const randomBtn = tbody.querySelector('.bulk-random-btn');
        if (randomBtn) {
            randomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.randomizeSerials();
            });
        }

        lucide.createIcons();
    },

    applyRowToCanvas(row) {
        // Apply template state (everything except the main image)
        PresetManager.applyState(this.template.state);

        // Restore shared images (logos, signature, border, QR, frame)
        CanvasManager.borderImage = this.template.borderImage;
        CanvasManager.signatureImage = this.template.signatureImage;
        CanvasManager.topLogoImage = this.template.topLogoImage;
        CanvasManager.logoImage = this.template.logoImage;
        CanvasManager.frontLogoImage = this.template.frontLogoImage;
        CanvasManager.frameImage = this.template.frameImage;
        CanvasManager.qrCodeCanvas = this.template.qrCodeCanvas;
        CanvasManager.qrCodeImage = this.template.qrCodeImage;

        // Apply per-row overrides
        CanvasManager.uploadedImage = row.image;
        CanvasManager.topText = row.topText;
        CanvasManager.middleText = row.middleText;
        CanvasManager.bottomText = row.bottomText;
        CanvasManager.backNameValue = row.backNameValue;
        CanvasManager.backClassValue = row.backClassValue;
        CanvasManager.backSeasonValue = row.backSeasonValue;

        // Apply per-image transform
        CanvasManager.imageScale = row.imageScale / 100;
        CanvasManager.imagePosX = row.imagePosX;
        CanvasManager.imagePosY = row.imagePosY;
    },

    async enterEditMode(index) {
        if (index < 0 || index >= this.rows.length) return;

        this.editingRowIndex = index;
        const row = this.rows[index];

        // Save a deep copy of the template state before editing (to restore transforms/image later)
        this._templateBeforeEdit = JSON.parse(JSON.stringify(this.template.state));

        // Load row onto canvas
        this.applyRowToCanvas(row);
        CanvasManager.showTemplate = false;
        CanvasManager.showTemplateBack = false;
        CanvasManager.render();
        CanvasManager.updateBackSidePreview();

        // Sync sidebar UI to the loaded row state
        const mergedState = Object.assign({}, this.template.state, {
            topText: row.topText,
            middleText: row.middleText,
            bottomText: row.bottomText,
            backNameValue: row.backNameValue,
            backClassValue: row.backClassValue,
            backSeasonValue: row.backSeasonValue,
            imageScale: row.imageScale / 100,
            imagePosX: row.imagePosX,
            imagePosY: row.imagePosY,
            showTemplate: false,
            showTemplateBack: false,
        });
        await UIManager.syncUIFromPreset(mergedState);

        // Hide bulk modal (keep rows/template state intact)
        this.elements.modal.style.display = 'none';
        this.isOpen = false;
        document.body.style.overflow = '';

        // Show bulk-edit banner on canvas
        const isTemplate = index === 0;
        const editLabel = isTemplate ? `Editing # 1 (Template)` : `Editing # ${index + 1}`;
        this.elements.backToBulkLabel.textContent = editLabel;
        this.elements.backToBulkLabelBottom.textContent = editLabel;
        this.elements.backToBulkBanner.style.display = 'flex';
        this.elements.backToBulkBannerBottom.style.display = 'flex';

        // Show canvas nav
        document.body.classList.add('bulk-editing');
        this._updateCanvasNav();
        lucide.createIcons();
    },

    _updateCanvasNav() {
        const total = this.rows.length;
        const current = this.editingRowIndex;
        this.elements.canvasNav.style.display = 'flex';
        this.elements.canvasCounter.style.display = 'block'; // outer wrapper, inner div handles flex
        this.elements.canvasCounterLabel.textContent = `${current + 1} / ${total}`;
        this.elements.canvasPrevBtn.disabled = current <= 0;
        this.elements.canvasNextBtn.disabled = current >= total - 1;
        this.elements.canvasSidePrevBtn.disabled = current <= 0;
        this.elements.canvasSideNextBtn.disabled = current >= total - 1;
    },

    _hideCanvasNav() {
        this.elements.canvasNav.style.display = '';
        this.elements.canvasCounter.style.display = 'none';
    },

    // Save the current row's canvas edits back to the row data and update the template
    _saveCurrentRow() {
        if (this.editingRowIndex < 0) return;

        const row = this.rows[this.editingRowIndex];

        // Save per-row data from current canvas state
        row.topText = CanvasManager.topText;
        row.middleText = CanvasManager.middleText;
        row.bottomText = CanvasManager.bottomText;
        row.backNameValue = CanvasManager.backNameValue;
        row.backClassValue = CanvasManager.backClassValue;
        row.backSeasonValue = CanvasManager.backSeasonValue;
        row.imageScale = Math.round(CanvasManager.imageScale * 100);
        row.imagePosX = CanvasManager.imagePosX;
        row.imagePosY = CanvasManager.imagePosY;

        // Update template: capture current canvas state (picks up border, signature, logo changes)
        const originalTemplateImage = this.template.uploadedImage;
        this.captureTemplate();

        // Restore the original (non-row) template image
        this.template.uploadedImage = originalTemplateImage;

        // Restore template image transforms to pre-edit values (transforms are per-row, not template)
        this.template.state.imageScale = this._templateBeforeEdit.imageScale;
        this.template.state.imagePosX = this._templateBeforeEdit.imagePosX;
        this.template.state.imagePosY = this._templateBeforeEdit.imagePosY;
        this.template.state.imageRotation = this._templateBeforeEdit.imageRotation;

        // Template text should always reflect Row 1 (the template row)
        if (this.rows.length > 0) {
            this.template.state.topText = this.rows[0].topText;
            this.template.state.middleText = this.rows[0].middleText;
            this.template.state.bottomText = this.rows[0].bottomText;
            this.template.state.backNameValue = this.rows[0].backNameValue;
            this.template.state.backClassValue = this.rows[0].backClassValue;
            this.template.state.backSeasonValue = this.rows[0].backSeasonValue;
        }

        // Persist updated rows and template
        this.saveBulkState();
    },

    exitEditMode() {
        if (this.editingRowIndex < 0) return;

        this._saveCurrentRow();

        // Hide banner and canvas nav
        document.body.classList.remove('bulk-editing');
        this.elements.backToBulkBanner.style.display = 'none';
        this.elements.backToBulkBannerBottom.style.display = 'none';
        this._hideCanvasNav();
        this.editingRowIndex = -1;
        this._templateBeforeEdit = null;

        // Restore canvas to template state and sync sidebar UI
        this.restoreTemplate();
        UIManager.syncUIFromPreset(this.template.state);

        // Show save confirmation toast
        if (typeof ToastManager !== 'undefined') ToastManager.success('Card changes saved');

        // Reopen bulk modal
        this.isOpen = true;
        this.elements.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.updateUI();
        lucide.createIcons();

        // Flash the "Copy Template Text to All" button as a hint
        const applyBtn = this.elements.applyRow1Btn;
        applyBtn.classList.remove('bulk-apply-flash');
        void applyBtn.offsetWidth; // force reflow so re-adding the class restarts animation
        applyBtn.classList.add('bulk-apply-flash');
        applyBtn.addEventListener('animationend', () => applyBtn.classList.remove('bulk-apply-flash'), { once: true });
    },

    // Called when the modal close button is clicked while in edit mode
    _exitEditModeAndClose() {
        if (this.editingRowIndex < 0) return;

        this._saveCurrentRow();

        // Hide banner, canvas nav, and close completely
        document.body.classList.remove('bulk-editing');
        this.elements.backToBulkBanner.style.display = 'none';
        this.elements.backToBulkBannerBottom.style.display = 'none';
        this._hideCanvasNav();
        this.editingRowIndex = -1;
        this._templateBeforeEdit = null;
        this.isOpen = false;

        // Restore template on canvas
        this.restoreTemplate();
    },

    canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to create blob'));
            }, 'image/png', 0.95);
        });
    },

    async exportAll(mode = 'all') {
        if (this.rows.length === 0) return;

        const total = this.rows.length;
        const showBack = CanvasManager.showObjektBorder;
        const mobile = this.isMobile();
        const exportFront = mode === 'all' || mode === 'front';
        const exportBack = (mode === 'all' || mode === 'back') && showBack;

        // Show progress
        this.elements.progress.style.display = 'flex';
        this.elements.exportAllBtn.disabled = true;
        this.elements.exportFrontOnlyBtn.disabled = true;
        this.elements.exportBackOnlyBtn.disabled = true;

        // Find the clicked button to show generating state
        const activeBtn = mode === 'front' ? this.elements.exportFrontOnlyBtn
            : mode === 'back' ? this.elements.exportBackOnlyBtn
            : this.elements.exportAllBtn;
        const originalBtnHtml = activeBtn.innerHTML;
        activeBtn.innerHTML = '<i data-lucide="loader"></i> Generating...';
        lucide.createIcons();

        // Hide template overlays during export
        const templateWasVisible = CanvasManager.showTemplate;
        const templateBackWasVisible = CanvasManager.showTemplateBack;

        try {
            // Generate all images into a flat list
            const generatedFiles = [];

            for (let i = 0; i < total; i++) {
                const row = this.rows[i];
                const num = String(i + 1).padStart(2, '0');

                // Update progress
                const progress = Math.round((i / total) * 100);
                this.elements.progressFill.style.width = `${progress}%`;
                this.elements.progressText.textContent = `${progress}% (${i}/${total})`;

                // Apply row data
                this.applyRowToCanvas(row);
                CanvasManager.showTemplate = false;
                CanvasManager.showTemplateBack = false;
                CanvasManager.render();

                // Capture front
                if (exportFront) {
                    const mainCanvas = document.getElementById('mainCanvas');
                    const frontBlob = await this.canvasToBlob(mainCanvas);
                    generatedFiles.push({ name: `card-${num}-front.png`, blob: frontBlob });
                }

                // Capture back (if applicable)
                if (exportBack) {
                    const backCanvas = CanvasManager.renderBackSide();
                    const backBlob = await this.canvasToBlob(backCanvas);
                    generatedFiles.push({ name: `card-${num}-back.png`, blob: backBlob });
                }

                // Small delay to let UI update
                await new Promise(r => setTimeout(r, 10));
            }

            this.elements.progressFill.style.width = '100%';

            // Mobile: try Web Share API with all files
            if (mobile) {
                const shareFiles = generatedFiles.map(({ name, blob }) =>
                    new File([blob], name, { type: 'image/png' })
                );
                if (navigator.canShare && navigator.canShare({ files: shareFiles })) {
                    this.elements.progressText.textContent = '100% - Sharing...';
                    try {
                        const shareTitle = mode === 'front' ? 'Objektify Bulk Export (Front)'
                            : mode === 'back' ? 'Objektify Bulk Export (Back)'
                            : 'Objektify Bulk Export';
                        await navigator.share({ files: shareFiles, title: shareTitle });
                        this.elements.progressText.textContent = 'Done!';
                        return;
                    } catch (e) {
                        if (e.name === 'AbortError') {
                            this.elements.progressText.textContent = 'Cancelled';
                            return;
                        }
                        // Share failed — fall through to ZIP
                    }
                }
            }

            // Desktop or mobile fallback: ZIP download
            this.elements.progressText.textContent = '100% - Zipping...';
            const zip = new JSZip();
            for (const { name, blob } of generatedFiles) {
                zip.file(name, blob);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            const zipName = mode === 'front' ? 'objektify-bulk-front.zip'
                : mode === 'back' ? 'objektify-bulk-back.zip'
                : 'objektify-bulk.zip';
            link.download = zipName;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);

            this.elements.progressText.textContent = 'Done!';

        } catch (error) {
            console.error('Bulk export failed:', error);
            this.elements.progressText.textContent = 'Export failed!';
        } finally {
            // Restore original state
            this.restoreTemplate();
            if (templateWasVisible) CanvasManager.showTemplate = true;
            if (templateBackWasVisible) CanvasManager.showTemplateBack = true;
            if (CanvasManager.hasImage()) CanvasManager.render();
            CanvasManager.updateBackSidePreview();

            // Reset UI after short delay
            const btnLabel = mobile
                ? '<i data-lucide="download"></i> Save All'
                : '<i data-lucide="download"></i> Download All as ZIP';
            setTimeout(() => {
                this.elements.progress.style.display = 'none';
                this.elements.progressFill.style.width = '0%';
                this.elements.exportAllBtn.disabled = false;
                this.elements.exportFrontOnlyBtn.disabled = false;
                this.elements.exportBackOnlyBtn.disabled = false;
                this.elements.exportAllBtn.innerHTML = btnLabel;
                activeBtn.innerHTML = originalBtnHtml;
                lucide.createIcons();
            }, 2000);
        }
    },

    randomizeSerials() {
        if (this.rows.length === 0) return;

        // Generate unique random serials
        const usedSerials = new Set();
        const generateSerial = () => {
            let serial;
            do {
                serial = String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
            } while (usedSerials.has(serial));
            usedSerials.add(serial);
            return serial;
        };

        const changed = [];
        for (let i = 0; i < this.rows.length; i++) {
            const serial = generateSerial();
            const oldVal = this.rows[i].middleText;
            // Replace the #NNNNN serial portion, or trailing digits as fallback
            let newVal;
            if (/#\d+/.test(oldVal)) {
                newVal = oldVal.replace(/#\d+/, '#' + serial);
            } else {
                newVal = oldVal.replace(/\d+$/, '') + serial;
            }
            if (newVal !== oldVal) changed.push(i);
            this.rows[i].middleText = newVal;
        }
        this.renderTable();

        // Flash changed cells
        for (const rowIndex of changed) {
            const input = this.elements.tableBody.querySelector(`input[data-index="${rowIndex}"][data-field="middleText"]`);
            if (input) {
                input.classList.add('bulk-input-changed');
                setTimeout(() => input.classList.remove('bulk-input-changed'), 2000);
            }
        }
        if (typeof ToastManager !== 'undefined') {
            ToastManager.success(`Randomized serials for ${this.rows.length} card${this.rows.length !== 1 ? 's' : ''}`);
        }
    },

    /**
     * Serialize BulkManager rows and template to localStorage.
     * Images are stored as data URL strings.
     */
    saveBulkState() {
        try {
            if (this.rows.length === 0) {
                localStorage.removeItem(this.BULK_STORAGE_KEY);
                return;
            }

            const serializedRows = this.rows.map(row => ({
                imageSrc: row.image ? row.image.src : null,
                fileName: row.fileName,
                topText: row.topText,
                middleText: row.middleText,
                bottomText: row.bottomText,
                backNameValue: row.backNameValue,
                backClassValue: row.backClassValue,
                backSeasonValue: row.backSeasonValue,
                imageScale: row.imageScale,
                imagePosX: row.imagePosX,
                imagePosY: row.imagePosY,
            }));

            const serializedTemplate = this.template ? {
                state: this.template.state,
                uploadedImageSrc: this.template.uploadedImage ? this.template.uploadedImage.src : null,
                borderImageSrc: this.template.borderImage ? this.template.borderImage.src : null,
                signatureImageSrc: this.template.signatureImage ? this.template.signatureImage.src : null,
                topLogoImageSrc: this.template.topLogoImage ? this.template.topLogoImage.src : null,
                logoImageSrc: this.template.logoImage ? this.template.logoImage.src : null,
                frontLogoImageSrc: this.template.frontLogoImage ? this.template.frontLogoImage.src : null,
                frameImageSrc: this.template.frameImage ? this.template.frameImage.src : null,
            } : null;

            const data = { rows: serializedRows, template: serializedTemplate };
            localStorage.setItem(this.BULK_STORAGE_KEY, JSON.stringify(data));
            console.log('[Bulk] Session saved:', this.rows.length, 'rows');
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('[Bulk] localStorage quota exceeded, bulk session not saved');
            } else {
                console.warn('[Bulk] Failed to save bulk session:', error);
            }
        }
    },

    /**
     * Restore BulkManager rows and template from localStorage.
     * @returns {Promise<boolean>} True if bulk state was restored
     */
    async loadBulkState() {
        try {
            const saved = localStorage.getItem(this.BULK_STORAGE_KEY);
            if (!saved) return false;

            const data = JSON.parse(saved);
            if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return false;

            const loadImage = (src) => new Promise((resolve) => {
                if (!src) { resolve(null); return; }
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });

            // Restore rows
            const restoredRows = await Promise.all(data.rows.map(async (row) => ({
                image: await loadImage(row.imageSrc),
                fileName: row.fileName,
                topText: row.topText,
                middleText: row.middleText,
                bottomText: row.bottomText,
                backNameValue: row.backNameValue,
                backClassValue: row.backClassValue,
                backSeasonValue: row.backSeasonValue,
                imageScale: row.imageScale,
                imagePosX: row.imagePosX,
                imagePosY: row.imagePosY,
            })));

            // Filter out rows whose image failed to load
            this.rows = restoredRows.filter(row => row.image !== null);
            if (this.rows.length === 0) return false;

            // Restore template
            if (data.template) {
                this.template = {
                    state: data.template.state,
                    uploadedImage: await loadImage(data.template.uploadedImageSrc),
                    borderImage: await loadImage(data.template.borderImageSrc),
                    signatureImage: await loadImage(data.template.signatureImageSrc),
                    topLogoImage: await loadImage(data.template.topLogoImageSrc),
                    logoImage: await loadImage(data.template.logoImageSrc),
                    frontLogoImage: await loadImage(data.template.frontLogoImageSrc),
                    frameImage: await loadImage(data.template.frameImageSrc),
                    qrCodeCanvas: null,
                    qrCodeImage: null,
                };
            }

            console.log('[Bulk] Session restored:', this.rows.length, 'rows');
            return true;
        } catch (error) {
            console.warn('[Bulk] Failed to restore bulk session:', error);
            return false;
        }
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
