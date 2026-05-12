/**
 * ui.js
 * Handles all UI interactions, DOM manipulation, and user controls
 */

const UIManager = {
    elements: {},
    currentView: 'front', // Track current view ('front' or 'back')

    // Google Fonts curated list
    googleFonts: [
        'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway', 'Poppins',
        'Nunito', 'Inter', 'Playfair Display', 'Merriweather',
        'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond',
        'Dancing Script', 'Pacifico', 'Lobster', 'Great Vibes', 'Satisfy',
        'Sacramento', 'Josefin Sans', 'Quicksand', 'Comfortaa', 'Righteous',
        'Orbitron', 'Space Grotesk', 'Syne', 'Outfit', 'Plus Jakarta Sans',
        'DM Sans', 'Figtree', 'Urbanist', 'Bebas Neue', 'Black Han Sans',
        'Noto Sans KR', 'Noto Serif KR', 'Black Ops One', 'Permanent Marker',
        'Caveat', 'Kalam'
    ],
    loadedFonts: new Set(),
    customFonts: [], // { name: string, url: string } - loaded from manifest or ZIP upload
    fontObserver: null,

    /**
     * Initialize UI manager and bind all event listeners
     */
    init() {
        // Initialize current view to null so first switch triggers animation
        this.currentView = null;
        // Cache DOM elements
        this.elements = {
            // Upload
            uploadArea: document.getElementById('uploadArea'),
            imageUpload: document.getElementById('imageUpload'),
            uploadSection: document.querySelector('.control-section:has(#uploadArea)'),

            // Canvas
            canvasContainer: document.getElementById('canvasContainer'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            canvasUploadPlaceholder: document.getElementById('canvasUploadPlaceholder'),
            backCanvasWrapper: document.getElementById('backCanvasWrapper'),
            canvasViewToggle: document.getElementById('canvasViewToggle'),
            toggleBtns: document.querySelectorAll('.toggle-btn'),
            frontSideSection: document.getElementById('frontSideSection'),
            backSideSection: document.getElementById('backSideSection'),
            backSideSectionMobile: document.getElementById('backSideSectionMobile'),

            // Adjustment controls (desktop)
            zoomSlider: document.getElementById('zoomSlider'),
            zoomValue: document.getElementById('zoomValue'),
            panXSlider: document.getElementById('panXSlider'),
            panXValue: document.getElementById('panXValue'),
            panYSlider: document.getElementById('panYSlider'),
            panYValue: document.getElementById('panYValue'),
            cornerRadiusSlider: document.getElementById('cornerRadiusSlider'),
            cornerRadiusValue: document.getElementById('cornerRadiusValue'),

            // Mobile adjustment controls
            zoomSliderMobile: document.getElementById('zoomSliderMobile'),
            zoomValueMobile: document.getElementById('zoomValueMobile'),
            panXSliderMobile: document.getElementById('panXSliderMobile'),
            panXValueMobile: document.getElementById('panXValueMobile'),
            panYSliderMobile: document.getElementById('panYSliderMobile'),
            panYValueMobile: document.getElementById('panYValueMobile'),
            mobileAdjustments: document.getElementById('mobileAdjustments'),

            // Notch color controls - Dropdown selectors for category and color
            notchColorGroupSelect: document.getElementById('notchColorGroupSelect'),
            notchColorSelect: document.getElementById('notchColorSelect'),
            notchColorPicker: document.getElementById('notchColorPicker'),
            borderColorHex: document.getElementById('borderColorHex'),

            // Border image controls
            borderImageUpload: document.getElementById('borderImageUpload'),
            clearBorderImage: document.getElementById('clearBorderImage'),

            // Objekt border toggle
            objektBorderToggle: document.getElementById('objektBorderToggle'),

            // Card size controls
            cardSizePreset: document.getElementById('cardSizePreset'),
            customSizeInputs: document.getElementById('customSizeInputs'),
            customWidthMM: document.getElementById('customWidthMM'),
            customHeightMM: document.getElementById('customHeightMM'),
            customSizePixels: document.getElementById('customSizePixels'),

            // Signature modal controls
            signatureModal: document.getElementById('signatureModal'),
            openSignatureModal: document.getElementById('openSignatureModal'),
            openSignatureModalMobile: document.getElementById('openSignatureModalMobile'),
            closeSignatureModal: document.getElementById('closeSignatureModal'),
            signatureModalDone: document.getElementById('signatureModalDone'),
            signatureImageUpload: document.getElementById('signatureImageUpload'),
            signatureZoomSlider: document.getElementById('signatureZoomSlider'),
            signatureZoomValue: document.getElementById('signatureZoomValue'),
            signaturePosXSlider: document.getElementById('signaturePosXSlider'),
            signaturePosXValue: document.getElementById('signaturePosXValue'),
            signaturePosYSlider: document.getElementById('signaturePosYSlider'),
            signaturePosYValue: document.getElementById('signaturePosYValue'),
            signatureZoomSection: document.getElementById('signatureZoomSection'),
            clearSignatureImage: document.getElementById('clearSignatureImage'),
            clearSignatureImageMobile: document.getElementById('clearSignatureImageMobile'),

            // Signature toolbar controls (desktop)
            signatureToolbarControls: document.getElementById('signatureToolbarControls'),
            signatureZoomToolbar: document.getElementById('signatureZoomToolbar'),
            signatureZoomToolbarValue: document.getElementById('signatureZoomToolbarValue'),
            signaturePosXToolbar: document.getElementById('signaturePosXToolbar'),
            signaturePosXToolbarValue: document.getElementById('signaturePosXToolbarValue'),
            signaturePosYToolbar: document.getElementById('signaturePosYToolbar'),
            signaturePosYToolbarValue: document.getElementById('signaturePosYToolbarValue'),

            // Signature toolbar controls (mobile)
            signatureToolbarControlsMobile: document.getElementById('signatureToolbarControlsMobile'),
            signatureZoomToolbarMobile: document.getElementById('signatureZoomToolbarMobile'),
            signatureZoomToolbarValueMobile: document.getElementById('signatureZoomToolbarValueMobile'),
            signaturePosXToolbarMobile: document.getElementById('signaturePosXToolbarMobile'),
            signaturePosXToolbarValueMobile: document.getElementById('signaturePosXToolbarValueMobile'),
            signaturePosYToolbarMobile: document.getElementById('signaturePosYToolbarMobile'),
            signaturePosYToolbarValueMobile: document.getElementById('signaturePosYToolbarValueMobile'),

            // Text controls
            topText: document.getElementById('topText'),
            middleText: document.getElementById('middleText'),
            bottomText: document.getElementById('bottomText'),
            textColorPicker: document.getElementById('textColorPicker'),
            textColorHex: document.getElementById('textColorHex'),
            presetColorsText: document.querySelectorAll('.preset-color-text'),

            // Font picker
            fontPickerBtn: document.getElementById('fontPickerBtn'),
            fontPickerPreview: document.getElementById('fontPickerPreview'),
            fontPickerBtnMobile: document.getElementById('fontPickerBtnMobile'),
            fontPickerPreviewMobile: document.getElementById('fontPickerPreviewMobile'),
            fontPickerModal: document.getElementById('fontPickerModal'),
            closeFontPicker: document.getElementById('closeFontPicker'),
            fontSearchInput: document.getElementById('fontSearchInput'),
            fontList: document.getElementById('fontList'),
            fontZipUpload: document.getElementById('fontZipUpload'),
            fontWeightLabel: document.getElementById('fontWeightLabel'),
            fontWeightSlider: document.getElementById('fontWeightSlider'),
            fontWeightValue: document.getElementById('fontWeightValue'),
            fontWeightLabelBack: document.getElementById('fontWeightLabelBack'),
            fontWeightSliderBack: document.getElementById('fontWeightSliderBack'),
            fontWeightValueBack: document.getElementById('fontWeightValueBack'),
            fontWeightLabelMobile: document.getElementById('fontWeightLabelMobile'),
            fontWeightSliderMobile: document.getElementById('fontWeightSliderMobile'),
            fontWeightValueMobile: document.getElementById('fontWeightValueMobile'),
            fontWeightBorderLabel: document.getElementById('fontWeightBorderLabel'),
            fontWeightBorderSlider: document.getElementById('fontWeightBorderSlider'),
            fontWeightBorderValue: document.getElementById('fontWeightBorderValue'),
            fontWeightBorderLabelBack: document.getElementById('fontWeightBorderLabelBack'),
            fontWeightBorderSliderBack: document.getElementById('fontWeightBorderSliderBack'),
            fontWeightBorderValueBack: document.getElementById('fontWeightBorderValueBack'),
            fontWeightBorderLabelMobile: document.getElementById('fontWeightBorderLabelMobile'),
            fontWeightBorderSliderMobile: document.getElementById('fontWeightBorderSliderMobile'),
            fontWeightBorderValueMobile: document.getElementById('fontWeightBorderValueMobile'),
            resetFontWeightFront: document.getElementById('resetFontWeightFront'),
            resetFontWeightBack: document.getElementById('resetFontWeightBack'),
            resetFontWeightMobile: document.getElementById('resetFontWeightMobile'),

            // Text height sliders (Front - Desktop)
            topTextHeight: document.getElementById('topTextHeight'),
            topTextHeightValue: document.getElementById('topTextHeightValue'),
            middleTextHeight: document.getElementById('middleTextHeight'),
            middleTextHeightValue: document.getElementById('middleTextHeightValue'),
            bottomTextHeight: document.getElementById('bottomTextHeight'),
            bottomTextHeightValue: document.getElementById('bottomTextHeightValue'),

            // Text height sliders (Front - Mobile)
            topTextHeightMobile: document.getElementById('topTextHeightMobile'),
            topTextHeightValueMobile: document.getElementById('topTextHeightValueMobile'),
            middleTextHeightMobile: document.getElementById('middleTextHeightMobile'),
            middleTextHeightValueMobile: document.getElementById('middleTextHeightValueMobile'),
            bottomTextHeightMobile: document.getElementById('bottomTextHeightMobile'),
            bottomTextHeightValueMobile: document.getElementById('bottomTextHeightValueMobile'),

            // Action buttons
            exportBtn: document.getElementById('exportBtn'),
            resetBtn: document.getElementById('resetBtn'),
            exportBtnMobile: document.getElementById('exportBtnMobile'),
            resetBtnMobile: document.getElementById('resetBtnMobile'),
            resetBtnCanvas: document.getElementById('resetBtnCanvas'),

            // Back image upload controls (Desktop)
            backUploadArea: document.getElementById('backUploadArea'),
            backImageUpload: document.getElementById('backImageUpload'),
            backImageAdjustments: document.getElementById('backImageAdjustments'),
            backZoomSlider: document.getElementById('backZoomSlider'),
            backZoomValue: document.getElementById('backZoomValue'),
            backPanXSlider: document.getElementById('backPanXSlider'),
            backPanXValue: document.getElementById('backPanXValue'),
            backPanYSlider: document.getElementById('backPanYSlider'),
            backPanYValue: document.getElementById('backPanYValue'),
            clearBackImageBtn: document.getElementById('clearBackImageBtn'),

            // Back image upload controls (Mobile)
            backUploadAreaMobile: document.getElementById('backUploadAreaMobile'),
            backImageUploadMobile: document.getElementById('backImageUploadMobile'),
            backImageAdjustmentsMobile: document.getElementById('backImageAdjustmentsMobile'),
            backZoomSliderMobile: document.getElementById('backZoomSliderMobile'),
            backZoomValueMobile: document.getElementById('backZoomValueMobile'),
            backPanXSliderMobile: document.getElementById('backPanXSliderMobile'),
            backPanXValueMobile: document.getElementById('backPanXValueMobile'),
            backPanYSliderMobile: document.getElementById('backPanYSliderMobile'),
            backPanYValueMobile: document.getElementById('backPanYValueMobile'),
            clearBackImageBtnMobile: document.getElementById('clearBackImageBtnMobile'),

            // Back side controls (Desktop)
            notchColorGroupSelectBack: document.getElementById('notchColorGroupSelectBack'),
            notchColorSelectBack: document.getElementById('notchColorSelectBack'),
            notchColorPickerBack: document.getElementById('notchColorPickerBack'),
            borderColorHexBack: document.getElementById('borderColorHexBack'),
            borderImageUploadBack: document.getElementById('borderImageUploadBack'),
            clearBorderImageBack: document.getElementById('clearBorderImageBack'),
            textColorPickerBack: document.getElementById('textColorPickerBack'),
            textColorHexBack: document.getElementById('textColorHexBack'),
            presetColorsTextBack: document.querySelectorAll('.preset-color-text-back'),
            backNameLabel: document.getElementById('backNameLabel'),
            backNameValue: document.getElementById('backNameValue'),
            backClassLabel: document.getElementById('backClassLabel'),
            backClassValue: document.getElementById('backClassValue'),
            backSeasonLabel: document.getElementById('backSeasonLabel'),
            backSeasonValue: document.getElementById('backSeasonValue'),
            backGroupName: document.getElementById('backGroupName'),

            // Back side controls (Mobile)
            borderColorHexBackMobile: document.getElementById('borderColorHexBackMobile'),
            textColorPickerBackMobile: document.getElementById('textColorPickerBackMobile'),
            textColorHexBackMobile: document.getElementById('textColorHexBackMobile'),
            backNameLabelMobile: document.getElementById('backNameLabelMobile'),
            backNameValueMobile: document.getElementById('backNameValueMobile'),
            backClassLabelMobile: document.getElementById('backClassLabelMobile'),
            backClassValueMobile: document.getElementById('backClassValueMobile'),
            backSeasonLabelMobile: document.getElementById('backSeasonLabelMobile'),
            backSeasonValueMobile: document.getElementById('backSeasonValueMobile'),
            backGroupNameMobile: document.getElementById('backGroupNameMobile'),

            // Back side text height sliders (Desktop)
            backTopTextHeight: document.getElementById('backTopTextHeight'),
            backTopTextHeightValue: document.getElementById('backTopTextHeightValue'),
            backBottomTextHeight: document.getElementById('backBottomTextHeight'),
            backBottomTextHeightValue: document.getElementById('backBottomTextHeightValue'),

            // Back side text height sliders (Mobile - in collapsible section)
            backTopTextHeightMobile: document.getElementById('backTopTextHeightMobile'),
            backTopTextHeightValueMobile: document.getElementById('backTopTextHeightValueMobile'),
            backBottomTextHeightMobile: document.getElementById('backBottomTextHeightMobile'),
            backBottomTextHeightValueMobile: document.getElementById('backBottomTextHeightValueMobile'),

            // Back side text height sliders (Mobile - quick adjustments)
            mobileBackAdjustments: document.getElementById('mobileBackAdjustments'),
            backTopTextHeightMobileQuick: document.getElementById('backTopTextHeightMobileQuick'),
            backTopTextHeightValueMobileQuick: document.getElementById('backTopTextHeightValueMobileQuick'),
            backBottomTextHeightMobileQuick: document.getElementById('backBottomTextHeightMobileQuick'),
            backBottomTextHeightValueMobileQuick: document.getElementById('backBottomTextHeightValueMobileQuick'),

            // Top logo upload and controls (Desktop)
            topLogoUpload: document.getElementById('topLogoUpload'),
            topLogoZoom: document.getElementById('topLogoZoom'),
            topLogoZoomValue: document.getElementById('topLogoZoomValue'),
            topLogoPosX: document.getElementById('topLogoPosX'),
            topLogoPosXValue: document.getElementById('topLogoPosXValue'),
            topLogoPosY: document.getElementById('topLogoPosY'),
            topLogoPosYValue: document.getElementById('topLogoPosYValue'),
            topLogoRotation: document.getElementById('topLogoRotation'),
            topLogoRotationValue: document.getElementById('topLogoRotationValue'),
            clearTopLogoBtn: document.getElementById('clearTopLogoBtn'),
            topLogoControlsContainer: document.getElementById('topLogoControlsContainer'),

            // Top logo upload and controls (Mobile)
            topLogoUploadMobile: document.getElementById('topLogoUploadMobile'),
            topLogoZoomMobile: document.getElementById('topLogoZoomMobile'),
            topLogoZoomValueMobile: document.getElementById('topLogoZoomValueMobile'),
            topLogoPosXMobile: document.getElementById('topLogoPosXMobile'),
            topLogoPosXValueMobile: document.getElementById('topLogoPosXValueMobile'),
            topLogoPosYMobile: document.getElementById('topLogoPosYMobile'),
            topLogoPosYValueMobile: document.getElementById('topLogoPosYValueMobile'),
            topLogoRotationMobile: document.getElementById('topLogoRotationMobile'),
            topLogoRotationValueMobile: document.getElementById('topLogoRotationValueMobile'),
            clearTopLogoBtnMobile: document.getElementById('clearTopLogoBtnMobile'),
            topLogoControlsContainerMobile: document.getElementById('topLogoControlsContainerMobile'),

            // Back side logo upload and controls (Desktop)
            logoUpload: document.getElementById('logoUpload'),
            logoZoom: document.getElementById('logoZoom'),
            logoZoomValue: document.getElementById('logoZoomValue'),
            logoPosX: document.getElementById('logoPosX'),
            logoPosXValue: document.getElementById('logoPosXValue'),
            logoPosY: document.getElementById('logoPosY'),
            logoPosYValue: document.getElementById('logoPosYValue'),
            logoRotation: document.getElementById('logoRotation'),
            logoRotationValue: document.getElementById('logoRotationValue'),
            clearLogoBtn: document.getElementById('clearLogoBtn'),
            logoControlsContainer: document.getElementById('logoControlsContainer'),

            // Back side logo upload and controls (Mobile)
            logoUploadMobile: document.getElementById('logoUploadMobile'),
            logoZoomMobile: document.getElementById('logoZoomMobile'),
            logoZoomValueMobile: document.getElementById('logoZoomValueMobile'),
            logoPosXMobile: document.getElementById('logoPosXMobile'),
            logoPosXValueMobile: document.getElementById('logoPosXValueMobile'),
            logoPosYMobile: document.getElementById('logoPosYMobile'),
            logoPosYValueMobile: document.getElementById('logoPosYValueMobile'),
            logoRotationMobile: document.getElementById('logoRotationMobile'),
            logoRotationValueMobile: document.getElementById('logoRotationValueMobile'),
            clearLogoBtnMobile: document.getElementById('clearLogoBtnMobile'),
            logoControlsContainerMobile: document.getElementById('logoControlsContainerMobile'),

            // Front side logo upload and controls (Desktop)
            frontLogoUpload: document.getElementById('frontLogoUpload'),
            frontLogoZoom: document.getElementById('frontLogoZoom'),
            frontLogoZoomValue: document.getElementById('frontLogoZoomValue'),
            frontLogoPosX: document.getElementById('frontLogoPosX'),
            frontLogoPosXValue: document.getElementById('frontLogoPosXValue'),
            frontLogoPosY: document.getElementById('frontLogoPosY'),
            frontLogoPosYValue: document.getElementById('frontLogoPosYValue'),
            frontLogoRotation: document.getElementById('frontLogoRotation'),
            frontLogoRotationValue: document.getElementById('frontLogoRotationValue'),
            clearFrontLogoBtn: document.getElementById('clearFrontLogoBtn'),
            frontLogoControlsContainer: document.getElementById('frontLogoControlsContainer'),

            // Front side logo upload and controls (Mobile)
            frontLogoUploadMobile: document.getElementById('frontLogoUploadMobile'),
            frontLogoZoomMobile: document.getElementById('frontLogoZoomMobile'),
            frontLogoZoomValueMobile: document.getElementById('frontLogoZoomValueMobile'),
            frontLogoPosXMobile: document.getElementById('frontLogoPosXMobile'),
            frontLogoPosXValueMobile: document.getElementById('frontLogoPosXValueMobile'),
            frontLogoPosYMobile: document.getElementById('frontLogoPosYMobile'),
            frontLogoPosYValueMobile: document.getElementById('frontLogoPosYValueMobile'),
            frontLogoRotationMobile: document.getElementById('frontLogoRotationMobile'),
            frontLogoRotationValueMobile: document.getElementById('frontLogoRotationValueMobile'),
            clearFrontLogoBtnMobile: document.getElementById('clearFrontLogoBtnMobile'),
            frontLogoControlsContainerMobile: document.getElementById('frontLogoControlsContainerMobile'),

            // QR Code controls
            qrCodeLink: document.getElementById('qrCodeLink'),
            qrCodeLinkMobile: document.getElementById('qrCodeLinkMobile'),

            // Reference Template controls (Phase 3)
            templateUpload: document.getElementById('templateUpload'),
            templateUploadArea: document.getElementById('templateUploadArea'),
            templateControlsContainer: document.getElementById('templateControlsContainer'),
            templateToggle: document.getElementById('templateToggle'),
            templateOpacity: document.getElementById('templateOpacity'),
            templateOpacityValue: document.getElementById('templateOpacityValue'),
            clearTemplateBtn: document.getElementById('clearTemplateBtn'),

            // Back Side Reference Template controls
            templateUploadBack: document.getElementById('templateUploadBack'),
            templateUploadAreaBack: document.getElementById('templateUploadAreaBack'),
            templateControlsContainerBack: document.getElementById('templateControlsContainerBack'),
            templateToggleBack: document.getElementById('templateToggleBack'),
            templateOpacityBack: document.getElementById('templateOpacityBack'),
            templateOpacityValueBack: document.getElementById('templateOpacityValueBack'),
            clearTemplateBackBtn: document.getElementById('clearTemplateBackBtn')
            ,
            // Custom Frame controls (user-uploaded, included in export)
            frameUpload: document.getElementById('frameUpload'),
            frameUploadArea: document.getElementById('frameUploadArea'),
            frameControlsContainer: document.getElementById('frameControlsContainer'),
            frameOpacity: document.getElementById('frameOpacity'),
            frameOpacityValue: document.getElementById('frameOpacityValue'),
            frameScale: document.getElementById('frameScale'),
            frameScaleValue: document.getElementById('frameScaleValue'),
            framePosX: document.getElementById('framePosX'),
            framePosXValue: document.getElementById('framePosXValue'),
            framePosY: document.getElementById('framePosY'),
            framePosYValue: document.getElementById('framePosYValue'),
            frameRotation: document.getElementById('frameRotation'),
            frameRotationValue: document.getElementById('frameRotationValue'),
            clearFrameBtn: document.getElementById('clearFrameBtn')
        };

        this.bindEvents();

        // Load local fonts from manifest (offline mode) -- async, non-blocking
        this.loadLocalFontsFromManifest();

        console.log('UI Manager initialized');

        // Ensure front view is shown on init (resets any stale inline styles)
        this.currentView = null;
        this.switchCanvasView('front');

        // Show mobile canvas upload placeholder if no image loaded
        this.updateCanvasUploadPlaceholder();

    },

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Upload events
        this.elements.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // Mobile canvas upload placeholder events
        if (this.elements.canvasUploadPlaceholder) {
            this.elements.canvasUploadPlaceholder.addEventListener('click', () => {
                this.elements.imageUpload.click();
            });
            this.elements.canvasUploadPlaceholder.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.canvasUploadPlaceholder.classList.add('drag-over');
            });
            this.elements.canvasUploadPlaceholder.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.elements.canvasUploadPlaceholder.classList.remove('drag-over');
            });
            this.elements.canvasUploadPlaceholder.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // Back image upload events
        if (this.elements.backImageUpload) {
            this.elements.backImageUpload.addEventListener('change', (e) => this.handleBackImageUpload(e));
        }
        if (this.elements.backUploadArea) {
            this.elements.backUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.backUploadArea.classList.add('drag-over');
            });
            this.elements.backUploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.elements.backUploadArea.classList.remove('drag-over');
            });
            this.elements.backUploadArea.addEventListener('drop', (e) => this.handleBackImageDrop(e));
        }
        if (this.elements.backImageUploadMobile) {
            this.elements.backImageUploadMobile.addEventListener('change', (e) => this.handleBackImageUpload(e));
        }
        if (this.elements.backUploadAreaMobile) {
            this.elements.backUploadAreaMobile.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.backUploadAreaMobile.classList.add('drag-over');
            });
            this.elements.backUploadAreaMobile.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.elements.backUploadAreaMobile.classList.remove('drag-over');
            });
            this.elements.backUploadAreaMobile.addEventListener('drop', (e) => this.handleBackImageDrop(e));
        }

        // Back image adjustment controls (desktop)
        if (this.elements.backZoomSlider) {
            this.elements.backZoomSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backZoomValue.textContent = `${value}%`;
                this.syncBackSliderValue('backZoom', value);
                CanvasManager.setBackZoom(value / 100);
            });
        }
        if (this.elements.backPanXSlider) {
            this.elements.backPanXSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backPanXValue.textContent = `${value}px`;
                this.syncBackSliderValue('backPanX', value);
                CanvasManager.setBackPan(parseInt(value), CanvasManager.backImagePosY);
            });
        }
        if (this.elements.backPanYSlider) {
            this.elements.backPanYSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backPanYValue.textContent = `${value}px`;
                this.syncBackSliderValue('backPanY', value);
                CanvasManager.setBackPan(CanvasManager.backImagePosX, parseInt(value));
            });
        }
        if (this.elements.clearBackImageBtn) {
            this.elements.clearBackImageBtn.addEventListener('click', () => this.clearBackImage());
        }

        // Back image adjustment controls (mobile)
        if (this.elements.backZoomSliderMobile) {
            this.elements.backZoomSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backZoomValueMobile.textContent = `${value}%`;
                this.syncBackSliderValue('backZoom', value);
                CanvasManager.setBackZoom(value / 100);
            });
        }
        if (this.elements.backPanXSliderMobile) {
            this.elements.backPanXSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backPanXValueMobile.textContent = `${value}px`;
                this.syncBackSliderValue('backPanX', value);
                CanvasManager.setBackPan(parseInt(value), CanvasManager.backImagePosY);
            });
        }
        if (this.elements.backPanYSliderMobile) {
            this.elements.backPanYSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backPanYValueMobile.textContent = `${value}px`;
                this.syncBackSliderValue('backPanY', value);
                CanvasManager.setBackPan(CanvasManager.backImagePosX, parseInt(value));
            });
        }
        if (this.elements.clearBackImageBtnMobile) {
            this.elements.clearBackImageBtnMobile.addEventListener('click', () => this.clearBackImage());
        }

        // Adjustment controls (desktop)
        this.elements.zoomSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            this.elements.zoomValue.textContent = `${value}%`;
            this.syncSliderValue('zoom', value);
            CanvasManager.setZoom(value / 100);
        });

        this.elements.panXSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            this.elements.panXValue.textContent = `${value}px`;
            this.syncSliderValue('panX', value);
            CanvasManager.setPan(parseInt(value), CanvasManager.imagePosY);
        });

        this.elements.panYSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            this.elements.panYValue.textContent = `${value}px`;
            this.syncSliderValue('panY', value);
            CanvasManager.setPan(CanvasManager.imagePosX, parseInt(value));
        });

        this.elements.cornerRadiusSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.elements.cornerRadiusValue.textContent = `${value}px`;
            this.syncSliderValue('cornerRadius', value);
            CanvasManager.cornerRadius = value;
            CanvasManager.render();
        });

        // Mobile adjustment controls
        if (this.elements.zoomSliderMobile) {
            this.elements.zoomSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.zoomValueMobile.textContent = `${value}%`;
                this.syncSliderValue('zoom', value);
                CanvasManager.setZoom(value / 100);
            });
        }

        if (this.elements.panXSliderMobile) {
            this.elements.panXSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.panXValueMobile.textContent = `${value}px`;
                this.syncSliderValue('panX', value);
                CanvasManager.setPan(parseInt(value), CanvasManager.imagePosY);
            });
        }

        if (this.elements.panYSliderMobile) {
            this.elements.panYSliderMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.panYValueMobile.textContent = `${value}px`;
                this.syncSliderValue('panY', value);
                CanvasManager.setPan(CanvasManager.imagePosX, parseInt(value));
            });
        }

        // Notch color dropdowns - Populate and handle selection changes
        this._initNotchColorDropdowns();

        // Color picker input for notch color
        this.elements.notchColorPicker.addEventListener('input', (e) => {
            const color = e.target.value.toUpperCase();
            // Update preview square, hex input, canvas, and sync dropdown
            this._updateColorPreview(color);
            this.elements.borderColorHex.value = color;
            CanvasManager.setBorderColor(color);
            this._syncDropdownWithColor(color);
        });

        // Hex input for notch color - Allow manual hex color entry
        this.elements.borderColorHex.addEventListener('input', (e) => {
            let color = e.target.value.trim();

            // Validate hex color format (#RRGGBB)
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                color = color.toUpperCase();
                // Update preview square, canvas, and sync dropdown
                this._updateColorPreview(color);
                CanvasManager.setBorderColor(color);
                this._syncDropdownWithColor(color);
            }
        });

        // Border image upload
        this.elements.borderImageUpload.addEventListener('change', (e) => this.handleBorderImageUpload(e));
        this.elements.clearBorderImage.addEventListener('click', () => this.clearBorderImage());

        // Objekt border toggle
        if (this.elements.objektBorderToggle) {
            this.elements.objektBorderToggle.addEventListener('change', (e) => {
                this.handleObjektBorderToggle(e.target.checked);
            });
        }

        // Card size controls
        if (this.elements.cardSizePreset) {
            this.elements.cardSizePreset.addEventListener('change', (e) => {
                this.handleCardSizeChange(e.target.value);
            });
        }

        if (this.elements.customWidthMM) {
            this.elements.customWidthMM.addEventListener('input', (e) => {
                this.handleCustomSizeInput();
            });
        }

        if (this.elements.customHeightMM) {
            this.elements.customHeightMM.addEventListener('input', (e) => {
                this.handleCustomSizeInput();
            });
        }

        // Top logo upload and controls (desktop)
        if (this.elements.topLogoUpload) {
            this.elements.topLogoUpload.addEventListener('change', (e) => this.handleTopLogoImageUpload(e));
        }
        if (this.elements.topLogoUploadMobile) {
            this.elements.topLogoUploadMobile.addEventListener('change', (e) => this.handleTopLogoImageUpload(e, true));
        }

        // Top logo adjustment sliders (desktop)
        if (this.elements.topLogoZoom) {
            this.elements.topLogoZoom.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoZoomValue.textContent = `${value}%`;
                this.syncTopLogoSliderValue('zoom', value);
                CanvasManager.setTopLogoZoom(value / 100);
            });
        }
        if (this.elements.topLogoPosX) {
            this.elements.topLogoPosX.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoPosXValue.textContent = `${value}px`;
                this.syncTopLogoSliderValue('posX', value);
                CanvasManager.setTopLogoPosition(value, CanvasManager.topLogoPosY);
            });
        }
        if (this.elements.topLogoPosY) {
            this.elements.topLogoPosY.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoPosYValue.textContent = `${value}px`;
                this.syncTopLogoSliderValue('posY', value);
                CanvasManager.setTopLogoPosition(CanvasManager.topLogoPosX, value);
            });
        }
        if (this.elements.topLogoRotation) {
            this.elements.topLogoRotation.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoRotationValue.textContent = `${value}°`;
                this.syncTopLogoSliderValue('rotation', value);
                CanvasManager.setTopLogoRotation(value);
            });
        }
        if (this.elements.clearTopLogoBtn) {
            this.elements.clearTopLogoBtn.addEventListener('click', () => this.clearTopLogoImage());
        }

        // Top logo adjustment sliders (mobile)
        if (this.elements.topLogoZoomMobile) {
            this.elements.topLogoZoomMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoZoomValueMobile.textContent = `${value}%`;
                this.syncTopLogoSliderValue('zoom', value, true);
                CanvasManager.setTopLogoZoom(value / 100);
            });
        }
        if (this.elements.topLogoPosXMobile) {
            this.elements.topLogoPosXMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoPosXValueMobile.textContent = `${value}px`;
                this.syncTopLogoSliderValue('posX', value, true);
                CanvasManager.setTopLogoPosition(value, CanvasManager.topLogoPosY);
            });
        }
        if (this.elements.topLogoPosYMobile) {
            this.elements.topLogoPosYMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoPosYValueMobile.textContent = `${value}px`;
                this.syncTopLogoSliderValue('posY', value, true);
                CanvasManager.setTopLogoPosition(CanvasManager.topLogoPosX, value);
            });
        }
        if (this.elements.topLogoRotationMobile) {
            this.elements.topLogoRotationMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.topLogoRotationValueMobile.textContent = `${value}°`;
                this.syncTopLogoSliderValue('rotation', value, true);
                CanvasManager.setTopLogoRotation(value);
            });
        }
        if (this.elements.clearTopLogoBtnMobile) {
            this.elements.clearTopLogoBtnMobile.addEventListener('click', () => this.clearTopLogoImage());
        }

        // Back side logo upload and controls (desktop)
        if (this.elements.logoUpload) {
            this.elements.logoUpload.addEventListener('change', (e) => this.handleLogoImageUpload(e));
        }
        if (this.elements.logoUploadMobile) {
            this.elements.logoUploadMobile.addEventListener('change', (e) => this.handleLogoImageUpload(e, true));
        }

        // Back side logo adjustment sliders (desktop)
        if (this.elements.logoZoom) {
            this.elements.logoZoom.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoZoomValue.textContent = `${value}%`;
                this.syncLogoSliderValue('zoom', value);
                CanvasManager.setLogoZoom(value / 100);
            });
        }
        if (this.elements.logoPosX) {
            this.elements.logoPosX.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoPosXValue.textContent = `${value}px`;
                this.syncLogoSliderValue('posX', value);
                CanvasManager.setLogoPosition(value, CanvasManager.logoPosY);
            });
        }
        if (this.elements.logoPosY) {
            this.elements.logoPosY.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoPosYValue.textContent = `${value}px`;
                this.syncLogoSliderValue('posY', value);
                CanvasManager.setLogoPosition(CanvasManager.logoPosX, value);
            });
        }
        if (this.elements.logoRotation) {
            this.elements.logoRotation.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoRotationValue.textContent = `${value}°`;
                this.syncLogoSliderValue('rotation', value);
                CanvasManager.setLogoRotation(value);
            });
        }
        if (this.elements.clearLogoBtn) {
            this.elements.clearLogoBtn.addEventListener('click', () => this.clearLogoImage());
        }

        // Back side logo adjustment sliders (mobile)
        if (this.elements.logoZoomMobile) {
            this.elements.logoZoomMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoZoomValueMobile.textContent = `${value}%`;
                this.syncLogoSliderValue('zoom', value, true);
                CanvasManager.setLogoZoom(value / 100);
            });
        }
        if (this.elements.logoPosXMobile) {
            this.elements.logoPosXMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoPosXValueMobile.textContent = `${value}px`;
                this.syncLogoSliderValue('posX', value, true);
                CanvasManager.setLogoPosition(value, CanvasManager.logoPosY);
            });
        }
        if (this.elements.logoPosYMobile) {
            this.elements.logoPosYMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoPosYValueMobile.textContent = `${value}px`;
                this.syncLogoSliderValue('posY', value, true);
                CanvasManager.setLogoPosition(CanvasManager.logoPosX, value);
            });
        }
        if (this.elements.logoRotationMobile) {
            this.elements.logoRotationMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.logoRotationValueMobile.textContent = `${value}°`;
                this.syncLogoSliderValue('rotation', value, true);
                CanvasManager.setLogoRotation(value);
            });
        }
        if (this.elements.clearLogoBtnMobile) {
            this.elements.clearLogoBtnMobile.addEventListener('click', () => this.clearLogoImage());
        }

        // Front side logo upload and controls (desktop)
        if (this.elements.frontLogoUpload) {
            this.elements.frontLogoUpload.addEventListener('change', (e) => this.handleFrontLogoImageUpload(e));
        }
        if (this.elements.frontLogoUploadMobile) {
            this.elements.frontLogoUploadMobile.addEventListener('change', (e) => this.handleFrontLogoImageUpload(e, true));
        }

        // Front side logo adjustment sliders (desktop)
        if (this.elements.frontLogoZoom) {
            this.elements.frontLogoZoom.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoZoomValue.textContent = `${value}%`;
                this.syncFrontLogoSliderValue('zoom', value);
                CanvasManager.setFrontLogoZoom(value / 100);
            });
        }
        if (this.elements.frontLogoPosX) {
            this.elements.frontLogoPosX.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoPosXValue.textContent = `${value}px`;
                this.syncFrontLogoSliderValue('posX', value);
                CanvasManager.setFrontLogoPosition(value, CanvasManager.frontLogoPosY);
            });
        }
        if (this.elements.frontLogoPosY) {
            this.elements.frontLogoPosY.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoPosYValue.textContent = `${value}px`;
                this.syncFrontLogoSliderValue('posY', value);
                CanvasManager.setFrontLogoPosition(CanvasManager.frontLogoPosX, value);
            });
        }
        if (this.elements.frontLogoRotation) {
            this.elements.frontLogoRotation.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoRotationValue.textContent = `${value}°`;
                this.syncFrontLogoSliderValue('rotation', value);
                CanvasManager.setFrontLogoRotation(value);
            });
        }
        if (this.elements.clearFrontLogoBtn) {
            this.elements.clearFrontLogoBtn.addEventListener('click', () => this.clearFrontLogoImage());
        }

        // Front side logo adjustment sliders (mobile)
        if (this.elements.frontLogoZoomMobile) {
            this.elements.frontLogoZoomMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoZoomValueMobile.textContent = `${value}%`;
                this.syncFrontLogoSliderValue('zoom', value, true);
                CanvasManager.setFrontLogoZoom(value / 100);
            });
        }
        if (this.elements.frontLogoPosXMobile) {
            this.elements.frontLogoPosXMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoPosXValueMobile.textContent = `${value}px`;
                this.syncFrontLogoSliderValue('posX', value, true);
                CanvasManager.setFrontLogoPosition(value, CanvasManager.frontLogoPosY);
            });
        }
        if (this.elements.frontLogoPosYMobile) {
            this.elements.frontLogoPosYMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoPosYValueMobile.textContent = `${value}px`;
                this.syncFrontLogoSliderValue('posY', value, true);
                CanvasManager.setFrontLogoPosition(CanvasManager.frontLogoPosX, value);
            });
        }
        if (this.elements.frontLogoRotationMobile) {
            this.elements.frontLogoRotationMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frontLogoRotationValueMobile.textContent = `${value}°`;
                this.syncFrontLogoSliderValue('rotation', value, true);
                CanvasManager.setFrontLogoRotation(value);
            });
        }
        if (this.elements.clearFrontLogoBtnMobile) {
            this.elements.clearFrontLogoBtnMobile.addEventListener('click', () => this.clearFrontLogoImage());
        }

        // Reference Template controls (Phase 3)
        if (this.elements.templateUpload) {
            this.elements.templateUpload.addEventListener('change', (e) => this.handleTemplateUpload(e));
        }
        if (this.elements.templateToggle) {
            this.elements.templateToggle.addEventListener('change', (e) => {
                CanvasManager.setTemplateVisible(e.target.checked);
            });
        }
        if (this.elements.templateOpacity) {
            this.elements.templateOpacity.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.templateOpacityValue.textContent = `${value}%`;
                CanvasManager.setTemplateOpacity(value / 100);
            });
        }
        if (this.elements.clearTemplateBtn) {
            this.elements.clearTemplateBtn.addEventListener('click', () => this.clearTemplate());
        }

        // Back Side Reference Template controls
        if (this.elements.templateUploadBack) {
            this.elements.templateUploadBack.addEventListener('change', (e) => this.handleTemplateUploadBack(e));
        }
        if (this.elements.templateToggleBack) {
            this.elements.templateToggleBack.addEventListener('change', (e) => {
                CanvasManager.setTemplateVisibleBack(e.target.checked);
            });
        }
        if (this.elements.templateOpacityBack) {
            this.elements.templateOpacityBack.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.templateOpacityValueBack.textContent = `${value}%`;
                CanvasManager.setTemplateOpacityBack(value / 100);
            });
        }
        if (this.elements.clearTemplateBackBtn) {
            this.elements.clearTemplateBackBtn.addEventListener('click', () => this.clearTemplateBack());
        }

        // Custom Frame controls
        if (this.elements.frameUpload) {
            this.elements.frameUpload.addEventListener('change', (e) => this.handleFrameImageUpload(e));
        }
        if (this.elements.frameOpacity) {
            this.elements.frameOpacity.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frameOpacityValue.textContent = `${value}%`;
                CanvasManager.setFrameOpacity(value / 100);
            });
        }
        if (this.elements.frameScale) {
            this.elements.frameScale.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frameScaleValue.textContent = `${value}%`;
                CanvasManager.setFrameScale(value / 100);
            });
        }
        if (this.elements.framePosX) {
            this.elements.framePosX.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.framePosXValue.textContent = `${value}px`;
                CanvasManager.setFramePosition(value, CanvasManager.framePosY);
            });
        }
        if (this.elements.framePosY) {
            this.elements.framePosY.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.framePosYValue.textContent = `${value}px`;
                CanvasManager.setFramePosition(CanvasManager.framePosX, value);
            });
        }
        if (this.elements.frameRotation) {
            this.elements.frameRotation.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.frameRotationValue.textContent = `${value}°`;
                CanvasManager.setFrameRotation(value);
            });
        }
        if (this.elements.clearFrameBtn) {
            this.elements.clearFrameBtn.addEventListener('click', () => this.clearFrameImage());
        }

        // Signature modal controls
        if (this.elements.openSignatureModal) {
            this.elements.openSignatureModal.addEventListener('click', () => this.openSignatureModal());
        }
        if (this.elements.openSignatureModalMobile) {
            this.elements.openSignatureModalMobile.addEventListener('click', () => this.openSignatureModal());
        }
        if (this.elements.closeSignatureModal) {
            this.elements.closeSignatureModal.addEventListener('click', () => this.closeSignatureModal());
        }
        if (this.elements.signatureModalDone) {
            this.elements.signatureModalDone.addEventListener('click', () => this.closeSignatureModal());
        }
        if (this.elements.signatureImageUpload) {
            this.elements.signatureImageUpload.addEventListener('change', (e) => this.handleSignatureImageUpload(e));
        }
        if (this.elements.signatureZoomSlider) {
            this.elements.signatureZoomSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signatureZoomValue.textContent = `${value}%`;
                this.syncSignatureSliderValue('zoom', value);
                CanvasManager.setSignatureZoom(value / 100);
            });
        }
        if (this.elements.signaturePosXSlider) {
            this.elements.signaturePosXSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosXValue.textContent = `${value}px`;
                this.syncSignatureSliderValue('posX', value);
                CanvasManager.setSignaturePosition(value, CanvasManager.signaturePosY);
            });
        }
        if (this.elements.signaturePosYSlider) {
            this.elements.signaturePosYSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosYValue.textContent = `${value}px`;
                this.syncSignatureSliderValue('posY', value);
                CanvasManager.setSignaturePosition(CanvasManager.signaturePosX, value);
            });
        }
        if (this.elements.clearSignatureImage) {
            this.elements.clearSignatureImage.addEventListener('click', () => this.clearSignatureImage());
        }
        if (this.elements.clearSignatureImageMobile) {
            this.elements.clearSignatureImageMobile.addEventListener('click', () => this.clearSignatureImageMobile());
        }

        // Click backdrop to close modal
        if (this.elements.signatureModal) {
            const backdrop = this.elements.signatureModal.querySelector('.signature-modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeSignatureModal());
            }

            // Setup slider transparency for signature modal sliders
            // Each slider's parent label is the container to keep visible (only the active slider)
            const modalContent = this.elements.signatureModal.querySelector('.signature-modal-content');

            if (this.elements.signatureZoomSlider) {
                this.setupSliderTransparency(this.elements.signatureZoomSlider, {
                    modal: modalContent,
                    backdrop: backdrop,
                    sliderContainer: this.elements.signatureZoomSlider.closest('label')
                });
            }
            if (this.elements.signaturePosXSlider) {
                this.setupSliderTransparency(this.elements.signaturePosXSlider, {
                    modal: modalContent,
                    backdrop: backdrop,
                    sliderContainer: this.elements.signaturePosXSlider.closest('label')
                });
            }
            if (this.elements.signaturePosYSlider) {
                this.setupSliderTransparency(this.elements.signaturePosYSlider, {
                    modal: modalContent,
                    backdrop: backdrop,
                    sliderContainer: this.elements.signaturePosYSlider.closest('label')
                });
            }
        }

        // Signature toolbar controls (desktop)
        if (this.elements.signatureZoomToolbar) {
            this.elements.signatureZoomToolbar.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signatureZoomToolbarValue.textContent = `${value}%`;
                this.syncSignatureSliderValue('zoom', value);
                CanvasManager.setSignatureZoom(value / 100);
            });
        }
        if (this.elements.signaturePosXToolbar) {
            this.elements.signaturePosXToolbar.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosXToolbarValue.textContent = `${value}px`;
                this.syncSignatureSliderValue('posX', value);
                CanvasManager.setSignaturePosition(value, CanvasManager.signaturePosY);
            });
        }
        if (this.elements.signaturePosYToolbar) {
            this.elements.signaturePosYToolbar.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosYToolbarValue.textContent = `${value}px`;
                this.syncSignatureSliderValue('posY', value);
                CanvasManager.setSignaturePosition(CanvasManager.signaturePosX, value);
            });
        }

        // Signature toolbar controls (mobile)
        if (this.elements.signatureZoomToolbarMobile) {
            this.elements.signatureZoomToolbarMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signatureZoomToolbarValueMobile.textContent = `${value}%`;
                this.syncSignatureSliderValue('zoom', value);
                CanvasManager.setSignatureZoom(value / 100);
            });
        }
        if (this.elements.signaturePosXToolbarMobile) {
            this.elements.signaturePosXToolbarMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosXToolbarValueMobile.textContent = `${value}px`;
                this.syncSignatureSliderValue('posX', value);
                CanvasManager.setSignaturePosition(value, CanvasManager.signaturePosY);
            });
        }
        if (this.elements.signaturePosYToolbarMobile) {
            this.elements.signaturePosYToolbarMobile.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.signaturePosYToolbarValueMobile.textContent = `${value}px`;
                this.syncSignatureSliderValue('posY', value);
                CanvasManager.setSignaturePosition(CanvasManager.signaturePosX, value);
            });
        }

        // Text controls
        this.elements.topText.addEventListener('input', (e) => {
            CanvasManager.setText(e.target.value, undefined, undefined);
            // Sync front name to back name
            CanvasManager.setBackSideData({ nameValue: e.target.value });
            this.elements.backNameValue.value = e.target.value;
            if (this.elements.backNameValueMobile) this.elements.backNameValueMobile.value = e.target.value;
        });

        this.elements.middleText.addEventListener('input', (e) => {
            CanvasManager.setText(undefined, e.target.value, undefined);
        });

        this.elements.bottomText.addEventListener('input', (e) => {
            CanvasManager.setText(undefined, undefined, e.target.value);
        });

        // Text color controls
        this.elements.textColorPicker.addEventListener('input', (e) => {
            const color = e.target.value.toUpperCase();
            this.elements.textColorHex.value = color;
            CanvasManager.setTextColor(color);
        });

        this.elements.textColorHex.addEventListener('input', (e) => {
            let color = e.target.value.trim();

            // Validate hex color format
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                color = color.toUpperCase();
                this.elements.textColorPicker.value = color;
                CanvasManager.setTextColor(color);
            }
        });

        // Preset text color buttons
        this.elements.presetColorsText.forEach(button => {
            button.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.elements.textColorPicker.value = color;
                this.elements.textColorHex.value = color;
                CanvasManager.setTextColor(color);
            });
        });

        // Font picker
        if (this.elements.fontPickerBtn) {
            this.elements.fontPickerBtn.addEventListener('click', () => this.openFontPicker());
        }
        if (this.elements.fontPickerBtnMobile) {
            this.elements.fontPickerBtnMobile.addEventListener('click', () => this.openFontPicker());
        }
        if (this.elements.closeFontPicker) {
            this.elements.closeFontPicker.addEventListener('click', () => this.closeFontPicker());
        }
        if (this.elements.fontPickerModal) {
            const backdrop = this.elements.fontPickerModal.querySelector('.font-picker-modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeFontPicker());
            }
        }
        if (this.elements.fontSearchInput) {
            this.elements.fontSearchInput.addEventListener('input', (e) => {
                this.renderFontList(e.target.value.trim());
            });
        }
        if (this.elements.fontPickerModal) {
            this.elements.fontPickerModal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.closeFontPicker();
            });
        }

        // Font ZIP upload
        if (this.elements.fontZipUpload) {
            this.elements.fontZipUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleFontZipUpload(file);
                    e.target.value = ''; // reset so same file can be re-uploaded
                }
            });
        }

        // Font weight sliders (front body, back main text, and shared border text)
        if (this.elements.fontWeightSlider) {
            this.elements.fontWeightSlider.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightFront(weight);
                this._syncFontWeightFrontSliders(weight);
            });
        }
        if (this.elements.fontWeightSliderBack) {
            this.elements.fontWeightSliderBack.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightBack(weight);
                this._syncFontWeightBackSliders(weight);
            });
        }
        if (this.elements.fontWeightSliderMobile) {
            this.elements.fontWeightSliderMobile.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightBack(weight);
                this._syncFontWeightBackSliders(weight);
            });
        }
        // Border weight sliders (shared between front and back border text)
        if (this.elements.fontWeightBorderSlider) {
            this.elements.fontWeightBorderSlider.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightBorder(weight);
                this._syncFontWeightBorderSliders(weight);
            });
        }
        if (this.elements.fontWeightBorderSliderBack) {
            this.elements.fontWeightBorderSliderBack.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightBorder(weight);
                this._syncFontWeightBorderSliders(weight);
            });
        }
        if (this.elements.fontWeightBorderSliderMobile) {
            this.elements.fontWeightBorderSliderMobile.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                CanvasManager.setFontWeightBorder(weight);
                this._syncFontWeightBorderSliders(weight);
            });
        }

        // Reset font & weight buttons (sidebar)
        if (this.elements.resetFontWeightFront) {
            this.elements.resetFontWeightFront.addEventListener('click', () => this.resetFontAndWeight());
        }
        if (this.elements.resetFontWeightBack) {
            this.elements.resetFontWeightBack.addEventListener('click', () => this.resetFontAndWeight());
        }
        if (this.elements.resetFontWeightMobile) {
            this.elements.resetFontWeightMobile.addEventListener('click', () => this.resetFontAndWeight());
        }

        // Text height sliders (Front - Desktop)
        if (this.elements.topTextHeight) {
            this.elements.topTextHeight.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.topTextHeightValue.textContent = `${value}px`;
                // Sync to mobile
                if (this.elements.topTextHeightMobile) {
                    this.elements.topTextHeightMobile.value = value;
                    this.elements.topTextHeightValueMobile.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('top', parseInt(value));
            });
        }

        if (this.elements.middleTextHeight) {
            this.elements.middleTextHeight.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.middleTextHeightValue.textContent = `${value}px`;
                // Sync to mobile
                if (this.elements.middleTextHeightMobile) {
                    this.elements.middleTextHeightMobile.value = value;
                    this.elements.middleTextHeightValueMobile.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('middle', parseInt(value));
            });
        }

        if (this.elements.bottomTextHeight) {
            this.elements.bottomTextHeight.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.bottomTextHeightValue.textContent = `${value}px`;
                // Sync to mobile
                if (this.elements.bottomTextHeightMobile) {
                    this.elements.bottomTextHeightMobile.value = value;
                    this.elements.bottomTextHeightValueMobile.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('bottom', parseInt(value));
            });
        }

        // Text height sliders (Front - Mobile)
        if (this.elements.topTextHeightMobile) {
            this.elements.topTextHeightMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.topTextHeightValueMobile.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.topTextHeight) {
                    this.elements.topTextHeight.value = value;
                    this.elements.topTextHeightValue.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('top', parseInt(value));
            });
        }

        if (this.elements.middleTextHeightMobile) {
            this.elements.middleTextHeightMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.middleTextHeightValueMobile.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.middleTextHeight) {
                    this.elements.middleTextHeight.value = value;
                    this.elements.middleTextHeightValue.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('middle', parseInt(value));
            });
        }

        if (this.elements.bottomTextHeightMobile) {
            this.elements.bottomTextHeightMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.bottomTextHeightValueMobile.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.bottomTextHeight) {
                    this.elements.bottomTextHeight.value = value;
                    this.elements.bottomTextHeightValue.textContent = `${value}px`;
                }
                CanvasManager.setTextHeight('bottom', parseInt(value));
            });
        }

        // Action buttons
        this.elements.exportBtn.addEventListener('click', () => this.exportImage());
        this.elements.exportBtnMobile.addEventListener('click', () => this.exportImage());

        const handleReset = () => {
            if (confirm('Are you sure? This will clear the canvas, remove all uploaded images, and revert all settings to default.')) {
                HistoryManager.clearSessionState();
                localStorage.removeItem('selectedBorderId');
                location.reload();
            }
        };
        this.elements.resetBtn.addEventListener('click', handleReset);
        this.elements.resetBtnMobile.addEventListener('click', handleReset);
        this.elements.resetBtnCanvas.addEventListener('click', handleReset);

        // Canvas view toggle buttons
        this.elements.toggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchCanvasView(view);
            });
        });

        // Back side color controls (Desktop)
        this._initNotchColorDropdownsBack();

        // Color picker for back side
        if (this.elements.notchColorPickerBack) {
            this.elements.notchColorPickerBack.addEventListener('input', (e) => {
                const color = e.target.value.toUpperCase();
                this._updateColorPreviewBack(color);
                this.elements.borderColorHexBack.value = color;
                CanvasManager.setBorderColor(color);
                this._syncDropdownWithColorBack(color);
                // Sync to front
                this._syncFrontColors(color, null);
            });
        }

        // Hex input for back side
        if (this.elements.borderColorHexBack) {
            this.elements.borderColorHexBack.addEventListener('input', (e) => {
                let color = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    color = color.toUpperCase();
                    this._updateColorPreviewBack(color);
                    CanvasManager.setBorderColor(color);
                    this._syncDropdownWithColorBack(color);
                    // Sync to front
                    this._syncFrontColors(color, null);
                }
            });
        }

        // Border image upload for back side
        if (this.elements.borderImageUploadBack) {
            this.elements.borderImageUploadBack.addEventListener('change', (e) => this.handleBorderImageUploadBack(e));
        }
        if (this.elements.clearBorderImageBack) {
            this.elements.clearBorderImageBack.addEventListener('click', () => this.clearBorderImageBack());
        }

        // Text color controls for back side
        if (this.elements.textColorPickerBack) {
            this.elements.textColorPickerBack.addEventListener('input', (e) => {
                const color = e.target.value.toUpperCase();
                this.elements.textColorHexBack.value = color;
                CanvasManager.setTextColor(color);
                // Sync to front
                this._syncFrontColors(null, color);
            });
        }

        if (this.elements.textColorHexBack) {
            this.elements.textColorHexBack.addEventListener('input', (e) => {
                let color = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    color = color.toUpperCase();
                    this.elements.textColorPickerBack.value = color;
                    CanvasManager.setTextColor(color);
                    // Sync to front
                    this._syncFrontColors(null, color);
                }
            });
        }

        // Preset text color buttons for back side
        if (this.elements.presetColorsTextBack) {
            this.elements.presetColorsTextBack.forEach(button => {
                button.addEventListener('click', (e) => {
                    const color = e.target.dataset.color;
                    this.elements.textColorPickerBack.value = color;
                    this.elements.textColorHexBack.value = color;
                    CanvasManager.setTextColor(color);
                    // Sync to front
                    this._syncFrontColors(null, color);
                });
            });
        }

        // Mobile back side color controls
        if (this.elements.borderColorHexBackMobile) {
            this.elements.borderColorHexBackMobile.addEventListener('input', (e) => {
                let color = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    color = color.toUpperCase();
                    CanvasManager.setBorderColor(color);
                    // Sync to desktop back
                    if (this.elements.borderColorHexBack) this.elements.borderColorHexBack.value = color;
                    if (this.elements.notchColorPickerBack) this.elements.notchColorPickerBack.value = color;
                    // Sync to front
                    this._syncFrontColors(color, null);
                }
            });
        }

        if (this.elements.textColorPickerBackMobile) {
            this.elements.textColorPickerBackMobile.addEventListener('input', (e) => {
                const color = e.target.value.toUpperCase();
                this.elements.textColorHexBackMobile.value = color;
                CanvasManager.setTextColor(color);
                // Sync to desktop back
                if (this.elements.textColorPickerBack) this.elements.textColorPickerBack.value = color;
                if (this.elements.textColorHexBack) this.elements.textColorHexBack.value = color;
                // Sync to front
                this._syncFrontColors(null, color);
            });
        }

        if (this.elements.textColorHexBackMobile) {
            this.elements.textColorHexBackMobile.addEventListener('input', (e) => {
                let color = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    color = color.toUpperCase();
                    this.elements.textColorPickerBackMobile.value = color;
                    CanvasManager.setTextColor(color);
                    // Sync to desktop back
                    if (this.elements.textColorPickerBack) this.elements.textColorPickerBack.value = color;
                    if (this.elements.textColorHexBack) this.elements.textColorHexBack.value = color;
                    // Sync to front
                    this._syncFrontColors(null, color);
                }
            });
        }

        // Back side controls (Desktop) - Direct input, no checkbox needed
        this.elements.backNameLabel.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ nameLabel: e.target.value });
            if (this.elements.backNameLabelMobile) this.elements.backNameLabelMobile.value = e.target.value;
        });

        this.elements.backNameValue.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ nameValue: e.target.value });
            if (this.elements.backNameValueMobile) this.elements.backNameValueMobile.value = e.target.value;
            // Sync back name to front name
            CanvasManager.setText(e.target.value, undefined, undefined);
            this.elements.topText.value = e.target.value;
        });

        this.elements.backClassLabel.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ classLabel: e.target.value });
            if (this.elements.backClassLabelMobile) this.elements.backClassLabelMobile.value = e.target.value;
        });

        this.elements.backClassValue.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ classValue: e.target.value });
            if (this.elements.backClassValueMobile) this.elements.backClassValueMobile.value = e.target.value;
        });

        this.elements.backSeasonLabel.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ seasonLabel: e.target.value });
            if (this.elements.backSeasonLabelMobile) this.elements.backSeasonLabelMobile.value = e.target.value;
        });

        this.elements.backSeasonValue.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ seasonValue: e.target.value });
            if (this.elements.backSeasonValueMobile) this.elements.backSeasonValueMobile.value = e.target.value;
        });

        this.elements.backGroupName.addEventListener('input', (e) => {
            CanvasManager.setBackSideData({ groupName: e.target.value });
            if (this.elements.backGroupNameMobile) this.elements.backGroupNameMobile.value = e.target.value;
        });

        // QR Code controls (Desktop)
        if (this.elements.qrCodeLink) {
            this.elements.qrCodeLink.addEventListener('input', async (e) => {
                await CanvasManager.setQRCodeLink(e.target.value);
                if (this.elements.qrCodeLinkMobile) this.elements.qrCodeLinkMobile.value = e.target.value;
            });
        }

        // Back side controls (Mobile) - Sync to desktop (no checkbox needed)
        if (this.elements.backNameLabelMobile) {
            this.elements.backNameLabelMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ nameLabel: e.target.value });
                this.elements.backNameLabel.value = e.target.value;
            });

            this.elements.backNameValueMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ nameValue: e.target.value });
                this.elements.backNameValue.value = e.target.value;
                // Sync back name to front name
                CanvasManager.setText(e.target.value, undefined, undefined);
                this.elements.topText.value = e.target.value;
            });

            this.elements.backClassLabelMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ classLabel: e.target.value });
                this.elements.backClassLabel.value = e.target.value;
            });

            this.elements.backClassValueMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ classValue: e.target.value });
                this.elements.backClassValue.value = e.target.value;
            });

            this.elements.backSeasonLabelMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ seasonLabel: e.target.value });
                this.elements.backSeasonLabel.value = e.target.value;
            });

            this.elements.backSeasonValueMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ seasonValue: e.target.value });
                this.elements.backSeasonValue.value = e.target.value;
            });

            this.elements.backGroupNameMobile.addEventListener('input', (e) => {
                CanvasManager.setBackSideData({ groupName: e.target.value });
                this.elements.backGroupName.value = e.target.value;
            });

            // QR Code controls (Mobile)
            if (this.elements.qrCodeLinkMobile) {
                this.elements.qrCodeLinkMobile.addEventListener('input', async (e) => {
                    await CanvasManager.setQRCodeLink(e.target.value);
                    this.elements.qrCodeLink.value = e.target.value;
                });
            }
        }

        // Back side text height sliders (Desktop)
        if (this.elements.backTopTextHeight) {
            this.elements.backTopTextHeight.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backTopTextHeightValue.textContent = `${value}px`;
                // Sync to mobile (collapsible)
                if (this.elements.backTopTextHeightMobile) {
                    this.elements.backTopTextHeightMobile.value = value;
                    this.elements.backTopTextHeightValueMobile.textContent = `${value}px`;
                }
                // Sync to mobile (quick)
                if (this.elements.backTopTextHeightMobileQuick) {
                    this.elements.backTopTextHeightMobileQuick.value = value;
                    this.elements.backTopTextHeightValueMobileQuick.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('top', parseInt(value));
            });
        }

        if (this.elements.backBottomTextHeight) {
            this.elements.backBottomTextHeight.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backBottomTextHeightValue.textContent = `${value}px`;
                // Sync to mobile (collapsible)
                if (this.elements.backBottomTextHeightMobile) {
                    this.elements.backBottomTextHeightMobile.value = value;
                    this.elements.backBottomTextHeightValueMobile.textContent = `${value}px`;
                }
                // Sync to mobile (quick)
                if (this.elements.backBottomTextHeightMobileQuick) {
                    this.elements.backBottomTextHeightMobileQuick.value = value;
                    this.elements.backBottomTextHeightValueMobileQuick.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('bottom', parseInt(value));
            });
        }

        // Back side text height sliders (Mobile - in collapsible section)
        if (this.elements.backTopTextHeightMobile) {
            this.elements.backTopTextHeightMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backTopTextHeightValueMobile.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.backTopTextHeight) {
                    this.elements.backTopTextHeight.value = value;
                    this.elements.backTopTextHeightValue.textContent = `${value}px`;
                }
                // Sync to mobile quick
                if (this.elements.backTopTextHeightMobileQuick) {
                    this.elements.backTopTextHeightMobileQuick.value = value;
                    this.elements.backTopTextHeightValueMobileQuick.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('top', parseInt(value));
            });
        }

        if (this.elements.backBottomTextHeightMobile) {
            this.elements.backBottomTextHeightMobile.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backBottomTextHeightValueMobile.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.backBottomTextHeight) {
                    this.elements.backBottomTextHeight.value = value;
                    this.elements.backBottomTextHeightValue.textContent = `${value}px`;
                }
                // Sync to mobile quick
                if (this.elements.backBottomTextHeightMobileQuick) {
                    this.elements.backBottomTextHeightMobileQuick.value = value;
                    this.elements.backBottomTextHeightValueMobileQuick.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('bottom', parseInt(value));
            });
        }

        // Back side text height sliders (Mobile - quick adjustments)
        if (this.elements.backTopTextHeightMobileQuick) {
            this.elements.backTopTextHeightMobileQuick.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backTopTextHeightValueMobileQuick.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.backTopTextHeight) {
                    this.elements.backTopTextHeight.value = value;
                    this.elements.backTopTextHeightValue.textContent = `${value}px`;
                }
                // Sync to mobile collapsible
                if (this.elements.backTopTextHeightMobile) {
                    this.elements.backTopTextHeightMobile.value = value;
                    this.elements.backTopTextHeightValueMobile.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('top', parseInt(value));
            });
        }

        if (this.elements.backBottomTextHeightMobileQuick) {
            this.elements.backBottomTextHeightMobileQuick.addEventListener('input', (e) => {
                const value = e.target.value;
                this.elements.backBottomTextHeightValueMobileQuick.textContent = `${value}px`;
                // Sync to desktop
                if (this.elements.backBottomTextHeight) {
                    this.elements.backBottomTextHeight.value = value;
                    this.elements.backBottomTextHeightValue.textContent = `${value}px`;
                }
                // Sync to mobile collapsible
                if (this.elements.backBottomTextHeightMobile) {
                    this.elements.backBottomTextHeightMobile.value = value;
                    this.elements.backBottomTextHeightValueMobile.textContent = `${value}px`;
                }
                CanvasManager.setBackTextHeight('bottom', parseInt(value));
            });
        }

        // History (undo/redo) event bindings
        this.bindHistoryEvents();

        // Collapsible sections functionality
        this.initCollapsibleSections();

        // Canvas text click event - for inline editing
        this.initCanvasTextEditor();
        
        // Initialize swipe gestures
        this.initSwipeGestures();

        // Initialize desktop navigation arrows

        // Initialize direct canvas manipulation (drag, wheel, touch, pinch)
        this.initCanvasDragPan();
        this.initCanvasWheelZoom();
        this.initCanvasDoubleClickReset();
        // Touch drag-to-pan removed for mobile - using sliders instead
        // this.initCanvasTouchPan();
        this.initCanvasPinchZoom();
        // Back canvas interactions
        this.initBackCanvasDragPan();
        this.initBackCanvasWheelZoom();
        this.initBackCanvasDoubleClickReset();
        this.initBackCanvasPinchZoom();
        this.initFloatingAdjustOverlay();
        this.initMobilePanSliders();
        this.initSliderDragListeners();

    },

    /**
     * Bind history (undo/redo) capture events to all state-changing controls.
     * Uses a generic approach: sliders capture on drag start/end, text/color/select on change.
     */
    bindHistoryEvents() {
        // Helper: get a human-readable label from an input element
        const getLabel = (el) => {
            const label = el.closest('label');
            if (label) {
                const span = label.querySelector('span:first-child');
                if (span) return span.textContent.trim();
            }
            // Fallback to id
            return el.id || 'Setting';
        };

        // --- Range sliders: capture before/after on drag ---
        const controlsPanel = document.getElementById('controlsPanel');
        const backSideMobile = document.getElementById('backSideSectionMobile');
        const signatureModal = document.querySelector('.signature-modal');
        const containers = [controlsPanel, backSideMobile, signatureModal].filter(Boolean);

        containers.forEach(container => {
            container.querySelectorAll('input[type="range"]').forEach(slider => {
                const label = getLabel(slider);

                slider.addEventListener('mousedown', () => {
                    HistoryManager.captureSliderStart();
                });
                slider.addEventListener('touchstart', () => {
                    HistoryManager.captureSliderStart();
                }, { passive: true });

                slider.addEventListener('mouseup', () => {
                    const value = slider.value;
                    const unit = slider.id.includes('zoom') || slider.id.includes('Zoom') || slider.id.includes('opacity') || slider.id.includes('Opacity') || slider.id.includes('overflow') ? '%' :
                                 slider.id.includes('rotation') || slider.id.includes('Rotation') ? '°' :
                                 slider.id.includes('radius') ? 'px' : '';
                    HistoryManager.captureSliderEnd(`${label}: ${value}${unit}`);
                });
                slider.addEventListener('touchend', () => {
                    const value = slider.value;
                    const unit = slider.id.includes('zoom') || slider.id.includes('Zoom') || slider.id.includes('opacity') || slider.id.includes('Opacity') || slider.id.includes('overflow') ? '%' :
                                 slider.id.includes('rotation') || slider.id.includes('Rotation') ? '°' :
                                 slider.id.includes('radius') ? 'px' : '';
                    HistoryManager.captureSliderEnd(`${label}: ${value}${unit}`);
                });
            });
        });

        // Also capture slider end globally (in case mouseup happens outside the slider)
        document.addEventListener('mouseup', () => {
            if (HistoryManager._sliderBeforeState) {
                HistoryManager.captureSliderEnd('Changed slider');
            }
        });
        document.addEventListener('touchend', () => {
            if (HistoryManager._sliderBeforeState) {
                HistoryManager.captureSliderEnd('Changed slider');
            }
        });

        // --- Text inputs: capture on change (blur) ---
        const textIds = [
            'topText', 'middleText', 'bottomText',
            'backNameLabel', 'backNameValue', 'backClassLabel', 'backClassValue',
            'backSeasonLabel', 'backSeasonValue', 'backGroupName', 'qrCodeLink',
            'borderColorHex', 'textColorHex',
            // Mobile variants
            'backNameLabelMobile', 'backNameValueMobile', 'backClassLabelMobile', 'backClassValueMobile',
            'backSeasonLabelMobile', 'backSeasonValueMobile', 'backGroupNameMobile', 'qrCodeLinkMobile',
            'borderColorHexBack', 'textColorHexBack',
            'borderColorHexBackMobile', 'textColorHexBackMobile',
            // Custom size
            'customWidthMM', 'customHeightMM'
        ];

        textIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    const value = el.value.trim();
                    // Use the actual value as the label, or a descriptive label if empty
                    const label = value ? `"${value}"` : `Cleared ${getLabel(el)}`;
                    HistoryManager.pushState(label);
                });
            }
        });

        // --- Color pickers: capture on change (when picker closes) ---
        const colorPickerIds = [
            'notchColorPicker', 'textColorPicker',
            'notchColorPickerBack', 'textColorPickerBack',
            'textColorPickerBackMobile'
        ];

        colorPickerIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    const color = el.value.toUpperCase();
                    HistoryManager.pushState(`Color: ${color}`);
                });
            }
        });

        // --- Preset color buttons: capture on click ---
        document.querySelectorAll('.preset-color, .preset-color-text').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color || btn.style.backgroundColor;
                setTimeout(() => HistoryManager.pushState(`Color: ${color}`), 0);
            });
        });

        // --- Checkboxes/toggles: capture on change ---
        const toggleIds = [
            'objektBorderToggle', 'overflowBorderToggle', 'overflowBorderToggleMobile',
            'templateToggle', 'templateToggleBack'
        ];

        toggleIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    const state = el.checked ? 'Enabled' : 'Disabled';
                    HistoryManager.pushState(`${state} ${getLabel(el)}`);
                });
            }
        });

        // --- Select dropdowns: capture on change ---
        const selectIds = ['cardSizePreset', 'notchCategorySelect', 'notchColorSelect'];

        selectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    const selectedText = el.options[el.selectedIndex]?.text || el.value;
                    setTimeout(() => HistoryManager.pushState(`${getLabel(el)}: ${selectedText}`), 0);
                });
            }
        });

        // --- Keyboard shortcuts ---
        document.addEventListener('keydown', (e) => {
            // Don't trigger when typing in an input/textarea
            const tag = e.target.tagName;
            const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                if (!isTyping) {
                    e.preventDefault();
                    HistoryManager.undo();
                }
            } else if (
                ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z')
            ) {
                if (!isTyping) {
                    e.preventDefault();
                    HistoryManager.redo();
                }
            }
        });
    },

    /**
     * Initialize slider drag listeners for mobile view
     * When dragging a slider, hide all controls-panel content except the active slider
     */
    initSliderDragListeners() {
        const controlsPanel = document.getElementById('controlsPanel');
        if (!controlsPanel) {
            console.warn('Controls panel not found');
            return;
        }

        // Create the overlay element that will show during slider drag
        let overlay = document.getElementById('sliderDragOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sliderDragOverlay';
            overlay.className = 'slider-drag-overlay';
            document.body.appendChild(overlay);
        }

        // Get all range inputs in the controls panel and back side mobile section
        const controlsPanelInputs = controlsPanel.querySelectorAll('input[type="range"]');
        const backSideMobile = document.getElementById('backSideSectionMobile');
        const backSideInputs = backSideMobile ? backSideMobile.querySelectorAll('input[type="range"]') : [];
        const rangeInputs = [...controlsPanelInputs, ...backSideInputs];
        console.log('Found ' + rangeInputs.length + ' range inputs for slider drag listeners');

        rangeInputs.forEach(slider => {
            // Mouse events - start drag
            slider.addEventListener('mousedown', (e) => this.handleSliderDragStart(e, slider, controlsPanel, overlay));

            // Touch events - start drag
            slider.addEventListener('touchstart', (e) => this.handleSliderDragStart(e, slider, controlsPanel, overlay));
        });

        // Global mouseup and touchend handlers to close modal after drag completes
        document.addEventListener('mouseup', (e) => this.handleSliderDragEnd(e, controlsPanel, overlay));
        document.addEventListener('touchend', (e) => this.handleSliderDragEnd(e, controlsPanel, overlay));
        document.addEventListener('touchcancel', (e) => this.handleSliderDragEnd(e, controlsPanel, overlay));
    },

    /**
     * Handle slider drag start - hide controls-panel and show overlay with slider
     */
    handleSliderDragStart(event, slider, controlsPanel, overlay) {
        // Only activate overlay on mobile
        if (window.innerWidth > 768) return;

        console.log('Slider drag started:', slider.id);

        // Hide controls panel and sidebar overlay to remove dimming
        controlsPanel.classList.add('slider-dragging');
        const sidebarOverlay = document.querySelector('.mobile-sidebar-overlay');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('visible');
        }

        // Get the label text
        let labelText = '';
        const label = slider.closest('label');
        if (label) {
            const labelSpan = label.querySelector('span:first-child');
            if (labelSpan) {
                labelText = labelSpan.textContent.trim();
            }
        }

        // Get the value display element
        let currentValue = '';
        if (label) {
            const valueSpan = label.querySelector('span:last-child');
            if (valueSpan && valueSpan !== label.querySelector('span:first-child')) {
                currentValue = valueSpan.textContent.trim();
            }
        }

        // Clear and rebuild overlay
        overlay.innerHTML = '';

        // Add label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'slider-drag-overlay-label';
        labelDiv.textContent = labelText;
        overlay.appendChild(labelDiv);

        // Add slider and value container
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-drag-overlay-slider-container';

        // Clone the slider
        const clonedSlider = slider.cloneNode(true);
        clonedSlider.className = 'slider-drag-overlay-slider';
        clonedSlider.style.margin = '0';

        // Create value display
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'slider-drag-overlay-value';
        valueDisplay.textContent = currentValue;

        sliderContainer.appendChild(clonedSlider);
        sliderContainer.appendChild(valueDisplay);
        overlay.appendChild(sliderContainer);

        // Activate overlay
        overlay.classList.add('active');

        // Track that we're dragging
        this._isActivelyDraggingSlider = true;
        this._activeSliderInfo = {
            original: slider,
            cloned: clonedSlider,
            overlay: overlay,
            controlsPanel: controlsPanel,
            valueDisplay: valueDisplay
        };

        // Sync input events from cloned slider to original
        clonedSlider.addEventListener('input', (e) => {
            slider.value = e.target.value;
            valueDisplay.textContent = e.target.value;
            // Trigger input event on original slider to update the UI
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Track when mouse/touch is released on the cloned slider
        const handleDragEnd = () => {
            this._isActivelyDraggingSlider = false;
        };

        clonedSlider.addEventListener('mouseup', handleDragEnd);
        clonedSlider.addEventListener('touchend', handleDragEnd);

        // Auto-focus the cloned slider for better UX
        setTimeout(() => clonedSlider.focus(), 0);

        event.preventDefault();
    },

    /**
     * Handle slider drag end - restore controls-panel visibility
     */
    handleSliderDragEnd(event, controlsPanel, overlay) {
        // Only close if we're not actively dragging
        if (this._isActivelyDraggingSlider) {
            console.log('Still dragging, keeping modal open');
            return;
        }

        // Check if the event target is the cloned slider (still dragging)
        if (this._activeSliderInfo && event.target === this._activeSliderInfo.cloned) {
            return;
        }

        console.log('Slider drag ended, closing modal');

        // Remove the dragging state from controls panel
        controlsPanel.classList.remove('slider-dragging');

        // Hide overlay
        overlay.classList.remove('active');

        // Restore sidebar overlay visibility if it was visible before
        const sidebarOverlay = document.querySelector('.mobile-sidebar-overlay');
        if (sidebarOverlay && controlsPanel.classList.contains('open')) {
            sidebarOverlay.classList.add('visible');
        }

        // Clear active drag reference
        this._activeSliderInfo = null;
    },

    /**
     * Setup slider transparency behavior for modal sliders
     * When a slider is interacted with (touch or mouse), hide everything except the slider for better visibility
     * @param {HTMLInputElement} slider - The range slider element
     * @param {Object} config - Configuration object
     * @param {HTMLElement} config.modal - The modal element
     * @param {HTMLElement} config.backdrop - The backdrop element (can be null)
     * @param {HTMLElement} config.sliderContainer - The container holding the slider to keep visible
     */
    setupSliderTransparency(slider, config) {
        if (!slider) return;

        const { modal, backdrop, sliderContainer } = config;
        const storageKey = `_sliderOriginal_${slider.id || Math.random().toString(36).substr(2, 9)}`;

        // Common function to activate transparency
        const activateTransparency = () => {
            // Don't activate if already active
            if (this[storageKey]) return;

            // Hide backdrop
            if (backdrop) {
                backdrop.style.display = 'none';
            }

            if (modal) {
                // Store original styles
                this[storageKey] = {
                    modalBackground: modal.style.background || '',
                    modalBoxShadow: modal.style.boxShadow || '',
                    modalPadding: modal.style.padding || '',
                    modalBorder: modal.style.border || '',
                    hiddenChildren: [],
                    transparentElements: [] // Elements that need background cleared
                };

                // Make modal transparent
                modal.style.background = 'transparent';
                modal.style.boxShadow = 'none';
                modal.style.padding = '0';
                modal.style.border = 'none';

                // Recursively hide elements that don't contain the slider or sliderContainer
                const hideNonSliderElements = (parent) => {
                    Array.from(parent.children).forEach(child => {
                        const isSliderContainer = sliderContainer && (child === sliderContainer || sliderContainer.contains(child));
                        const containsSliderContainer = sliderContainer && child.contains(sliderContainer);
                        const containsSlider = child.contains(slider);
                        const isSliderParent = child === slider.parentElement || child.contains(slider.parentElement);

                        if (isSliderContainer || child === slider.parentElement) {
                            // This is the slider container or direct parent - keep fully visible
                            child.style.display = 'block';
                            child.style.visibility = 'visible';
                            child.style.opacity = '1';
                            child.style.pointerEvents = 'auto';
                        } else if (containsSliderContainer || containsSlider || isSliderParent) {
                            // This element contains the slider/container - keep visible but make transparent
                            child.style.display = 'block';
                            child.style.visibility = 'visible';
                            child.style.opacity = '1';
                            child.style.pointerEvents = 'auto';

                            // Store and clear background/border for intermediate containers
                            this[storageKey].transparentElements.push({
                                element: child,
                                background: child.style.background || '',
                                backgroundColor: child.style.backgroundColor || '',
                                border: child.style.border || '',
                                boxShadow: child.style.boxShadow || '',
                                padding: child.style.padding || ''
                            });
                            child.style.background = 'transparent';
                            child.style.backgroundColor = 'transparent';
                            child.style.border = 'none';
                            child.style.boxShadow = 'none';
                            child.style.padding = '0';

                            hideNonSliderElements(child);
                        } else {
                            // Hide this element
                            this[storageKey].hiddenChildren.push({
                                element: child,
                                display: child.style.display
                            });
                            child.style.display = 'none';
                        }
                    });
                };

                hideNonSliderElements(modal);
            }
        };

        // Common function to deactivate transparency
        const deactivateTransparency = () => {
            // Restore backdrop
            if (backdrop) {
                backdrop.style.display = 'block';
            }

            if (modal && this[storageKey]) {
                // Restore modal styles
                modal.style.background = this[storageKey].modalBackground;
                modal.style.boxShadow = this[storageKey].modalBoxShadow;
                modal.style.padding = this[storageKey].modalPadding;
                modal.style.border = this[storageKey].modalBorder;

                // Restore transparent elements
                this[storageKey].transparentElements.forEach(({ element, background, backgroundColor, border, boxShadow, padding }) => {
                    element.style.background = background;
                    element.style.backgroundColor = backgroundColor;
                    element.style.border = border;
                    element.style.boxShadow = boxShadow;
                    element.style.padding = padding;
                });

                // Restore hidden children
                this[storageKey].hiddenChildren.forEach(({ element, display }) => {
                    element.style.display = display;
                });

                // Clear storage
                this[storageKey] = null;
            }
        };

        // Touch events
        slider.addEventListener('touchstart', activateTransparency);
        slider.addEventListener('touchend', deactivateTransparency);

        // Mouse events for desktop/tablet
        slider.addEventListener('mousedown', activateTransparency);
        // Use document-level mouseup to ensure we catch the event even if mouse moves off slider
        slider.addEventListener('mousedown', () => {
            const handleMouseUp = () => {
                deactivateTransparency();
                document.removeEventListener('mouseup', handleMouseUp);
            };
            document.addEventListener('mouseup', handleMouseUp);
        });
    },

    /**
     * Initialize collapsible section toggle functionality
     */
    initCollapsibleSections() {
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', function() {
                const section = this.closest('.collapsible-section');
                section.classList.toggle('collapsed');
            });
        });
    },

    /**
     * Notch color groups - Organized by category (e.g., First CLASS, Binary01, etc.)
     * Each category contains color options with title and hex/rgba color value
     */
    notchColorGroups: {
        "Atom01": [
            { "title": "FCO", "color": "#FFDD00" },
            { "title": "LoK", "color": "#2C3A53" },
            { "title": "Ancient8", "color": "#151646" },
            { "title": "DMM", "color": "#F49B4E" },
            { "title": "Ktown", "color": "#3D71B8" },
            { "title": "MMT", "color": "#39C3DB" },
            { "title": "SoundWave", "color": "#000000" },
            { "title": "Withmuu", "color": "#5E5FAB" },
            { "title": "World Cup 2022", "color": "#ED1941" },
            { "title": "Christmas 2022", "color": "#27550A" },
            { "title": "GS25", "color": "#0279BC" },
            { "title": "Lunar New Year", "color": "#E3F4F1" }
        ],
        "Binary01": [
            { "title": "FCO", "color": "#00FF00" },
            { "title": "DMM", "color": "#F49B4E" },
            { "title": "SoundWave", "color": "#000000" },
            { "title": "MMT", "color": "#39C3DB" },
            { "title": "GUESS", "color": "#000000" },
            { "title": "Objekt Trading Cafe 1.0", "color": "#2F6A9A" },
            { "title": "GS25", "color": "#0278BD" },
            { "title": "April Fools' Day", "color": "#000000" },
            { "title": "hellolive", "color": "#7D3AF5" },
            { "title": "Wonderwall", "color": "#000000" },
            { "title": "FLNK", "color": "#7D3AF5" },
            { "title": "All My Things (S8)", "color": "#F6ADCD" },
            { "title": "(S8) Objekt Trading Cafe 2.0", "color": "#3D71B8" },
            { "title": "(S1) COSMO the gate register", "color": "#8A8C8E" },
            { "title": "(S4) Urban Break", "color": "#F15D22" },
            { "title": "(S4) Everline", "color": "#DF2E37" },
            { "title": "LOVElution US Tour", "color": "#0C89FF" },
            { "title": "K4 Objekt Gaming Club", "color": "#3D71B8" },
            { "title": "(S15) Asian Games Hangzhou 2023", "color": "#F3486D" }
        ],
        "Cream01": [
            { "title": "FCO", "color": "#FF7477" },
            { "title": "MMT", "color": "#39C3DB" },
            { "title": "DMM", "color": "#F49B4E" },
            { "title": "AAA Anniversary", "color": "#000000" },
            { "title": "LOVE/EVOL promotion sale", "color": "#DF3174" },
            { "title": "EVOL Authentic tour", "color": "#BF4239" },
            { "title": "MAMA Best New Female Artist", "color": "#EED056" },
            { "title": "Christmas 2023", "color": "#C8161D" },
            { "title": "Season's Greeting 2024", "color": "#F0907A" },
            { "title": "(EVOL) Season's Greeting 2024", "color": "#FFF8EE" },
            { "title": "Badge War Season 1", "color": "#294A80" },
            { "title": "Aria promotion sale", "color": "#C8A2C8" },
            { "title": "Winter Meetup", "color": "#7282B9" },
            { "title": "Authentic Seoul", "color": "#C5D4FF" },
            { "title": "Rising Anniversary", "color": "#F9F8F2" },
            { "title": "Valentine's Day", "color": "#6D4633" },
            { "title": "GND gravity", "color": "#000000" },
            { "title": "Glow Pre-sale", "color": "#DEFAE9" },
            { "title": "Cherry Blossom", "color": "#F8E6FF" },
            { "title": "KRE Anniversary", "color": "#EDAFA6" },
            { "title": "Children's Day", "color": "#026009" }
        ],
        "Divine01": [
            { "title": "FCO", "color": "#B400FF" },
            { "title": "ASSEMBLE24 PB ver.", "color": "#0B3951" },
            { "title": "ASSEMBLE24 OMA ver.1", "color": "#C4C0BF" },
            { "title": "Offline event DCO", "color": "#A9CCED" },
            { "title": "HeartS Lightstick", "color": "#EEF3FF" },
            { "title": "GND gravity", "color": "#000000" },
            { "title": "MMT pob", "color": "#39C3DB" },
            { "title": "Fan-made Objekt", "color": "#C2FFE9" },
            { "title": "The Show 1st win", "color": "#A2F796" },
            { "title": "Badge War Season 2", "color": "#FFE67D" },
            { "title": "Everline pob", "color": "#DF2E37" },
            { "title": "Glow promotion sale", "color": "#D866A2" },
            { "title": "ASSEMBLE24 OMA ver.2", "color": "#000000" },
            { "title": "Mayu mini PB DCO sale", "color": "#03BD79" },
            { "title": "Summer Edition sale", "color": "#7899DD" },
            { "title": "LOVElution Anniversary", "color": "#FFF3EB" },
            { "title": "Women NGO sale", "color": "#D5D2FF" },
            { "title": "Hachi Gravity", "color": "#EFCBE2" },
            { "title": "VV Performante PB ver.", "color": "#0E2D6B" },
            { "title": "JiWoo Sofamon collab", "color": "#4F92FF" },
            { "title": "VV Performante OMA", "color": "#000000" },
            { "title": "Web drama (S1, S3)", "color": "#F1FFDE" },
            { "title": "EVOLution Anniversary", "color": "#EFCBE2" },
            { "title": "WAV 1st Fanclub", "color": "#8EBDD1" },
            { "title": "VV Sihyunhada collab DCO sale", "color": "#AB1A13" },
            { "title": "AAA 2nd Anniversary sale", "color": "#122C49" },
            { "title": "VV The Show 1st win", "color": "#A2F796" }
        ],
        "Ever01": [
            { "title": "FCO", "color": "#33ECFD" },
            { "title": "∞! Untitle album", "color": "#2A343C" },
            { "title": "WAV Japan 1st FanClub DCO", "color": "#9B1837" },
            { "title": "Offline event DCO", "color": "#FFFCE4" },
            { "title": "Season's Greeting 2025", "color": "#ECE3DB" },
            { "title": "K-monstar Trading Cafe in Taipei", "color": "#9A659D" },
            { "title": "Gravity-Rolex team DCO sale", "color": "#FDD46B" },
            { "title": "Nien Hakka Kitchen DCO sale", "color": "#DB5E1D" },
            { "title": "∞! promotion sale", "color": "#56399E" },
            { "title": "Everline pob", "color": "#DF2E37" },
            { "title": "Christmas 2024 sale", "color": "#C8161D" },
            { "title": "NXT Anniversary sale", "color": "#0B3B51" },
            { "title": "AAA ACCESS OMA", "color": "#000000" },
            { "title": "KRE AESTHETIC OMA", "color": "#000000" },
            { "title": "OT10 ASSEMBLE OMA", "color": "#000000" },
            { "title": "LOVElution MUHAN OMA", "color": "#000000" },
            { "title": "EVOLution MUJUK OMA", "color": "#000000" },
            { "title": "ASSEMBLE24 OMA ver.3", "color": "#000000" },
            { "title": "World Tour VIP pob", "color": "#AEE2FF" },
            { "title": "World Tour Attending gift", "color": "#AEE2FF" },
            { "title": "Hanlimz DCO sale", "color": "#1C2646" },
            { "title": "tripleS Awards 2024 sale", "color": "#6C87A8" },
            { "title": "Aria Anniversary sale", "color": "#E8BCEF" },
            { "title": "ASSEMBLE 2nd Anniversary sale", "color": "#F9F8F2" },
            { "title": "Valentine's Day", "color": "#6B4633" },
            { "title": "World Tour in Seoul Merch", "color": "#4d0083" },
            { "title": "World Tour BIGC streaming pob", "color": "#3F4049" },
            { "title": "1st Fanmeeting Surfing Club", "color": "#FFF0A9" },
            { "title": "Cherry Blossom", "color": "#F7E5FF" },
            { "title": "InfinityKPOP Trading Cafe in Singapore", "color": "#54C9CC" },
            { "title": "Withmuu pob", "color": "#5E5FAB" },
            { "title": "Black Soul Dress", "color": "#A2A7C2" },
            { "title": "Everline pob", "color": "#DF2E37" },
            { "title": "April Fools' Day", "color": "#E2F29E" },
            { "title": "Leader PCO (S2, S16)", "color": "#2E3192" },
            { "title": "Divine01 ranking top10", "color": "#2E3192" }
        ],
        "Atom02": [
            { "title": "FCO", "color": "#FFFF00" },
            { "title": "ASSEMBLE25 OMA ver.", "color": "#000000" },
            { "title": "ASSEMBLE25 PB ver.", "color": "#9cbb98" },
            { "title": "KRE 2nd Anniversary sale", "color": "#edafa6" },
            { "title": "Offline event DCO", "color": "#fe646b" },
            { "title": "tripleS X Woori Bank CBDC", "color": "#e6f6ff" },
            { "title": "ASSEMBLE24 1st Anniversary sale", "color": "#69738b" },
            { "title": "TikTok event", "color": "#FE2C55" },
            { "title": "MMT pob", "color": "#39C3DB" },
            { "title": "Melon event", "color": "#00CD3C" },
            { "title": "Makuhari Messe Booth DCO KCON", "color": "#ab73a8" },
            { "title": "Badge war Season 3 sale", "color": "#72F2D9" },
            { "title": "NXT Glow Spring Break sale", "color": "#E6E6E6" },
            { "title": "School Uniform", "color": "#2A4746" },
            { "title": "The Show 1st win", "color": "#A2F796" },
            { "title": "Show Champion 1 win", "color": "#1992ff" },
            { "title": "Everline pob", "color": "#DF2E37" },
            { "title": "K-monstar Trading Cafe in Taipei", "color": "#9A659D" },
            { "title": "Glow Anniversary sale", "color": "#FFCBF8" },
            { "title": "A Live 25 Concert VIP", "color": "#E35080" },
            { "title": "2025 Summer Edition", "color": "#7899DD" },
            { "title": "A Live 25 offline DCO", "color": "#C23A62" },
            { "title": "Abstract sale/event", "color": "#00C65E" },
            { "title": "Water Festival / Waterbomb", "color": "#FFE85F" },
            { "title": "Jump Up pob", "color": "#00A2E5" },
            { "title": "LOVElution 2nd Anniversary", "color": "#FFF3EB" },
            { "title": "Summer Edition Night ver.", "color": "#7899DD" },
            { "title": "Leader PCO (S1)", "color": "#2E3192" },
            { "title": "Ever01 ranking top10", "color": "#2E3192" }
        ]
    },

    /**
     * Initialize notch color dropdowns - Populates category and color selectors
     * Sets up event listeners for immediate color updates on selection
     */
    _initNotchColorDropdowns() {
        const groupSelect = this.elements.notchColorGroupSelect;
        const colorSelect = this.elements.notchColorSelect;

        if (!groupSelect || !colorSelect) return;

        // Populate category dropdown with all available groups
        const groupNames = Object.keys(this.notchColorGroups);
        groupSelect.innerHTML = '';
        groupNames.forEach((name, idx) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (idx === 0) option.selected = true;
            groupSelect.appendChild(option);
        });

        // Populate colors for the initially selected category
        this._populateColorDropdown(groupNames[0]);

        // Initialize preview square with current color from CanvasManager
        if (CanvasManager && CanvasManager.accentColor) {
            this._updateColorPreview(CanvasManager.accentColor);
        }

        // Event: Category selection changes - Update color dropdown options
        groupSelect.addEventListener('change', (e) => {
            this._populateColorDropdown(e.target.value);
        });

        // Event: Color selection changes - Apply color immediately to notch
        colorSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const color = selectedOption.value.toUpperCase();
                // Update preview square, hex input, and canvas
                this._updateColorPreview(color);
                this.elements.borderColorHex.value = color;
                CanvasManager.setBorderColor(color);
            }
        });
    },

    /**
     * Populate the color dropdown based on selected category
     * Each option displays the color name/title with a colored square preview
     * @param {string} groupName - The selected category/collection name
     */
    _populateColorDropdown(groupName) {
        const colorSelect = this.elements.notchColorSelect;
        const colors = this.notchColorGroups[groupName] || [];

        // Clear existing options and add default placeholder
        colorSelect.innerHTML = '<option value="">Select a color</option>';

        // Add color options with colored square indicator
        colors.forEach(item => {
            const option = document.createElement('option');
            option.value = item.color;

            // Display format: ■ Title (unicode square + text)
            option.textContent = `■ ${item.title}`;

            // Tooltip shows full color information on hover
            option.title = `${item.title} - ${item.color}`;

            // Store color in data attribute for styling
            option.dataset.color = item.color;
            option.dataset.title = item.title;

            colorSelect.appendChild(option);
        });

        // Apply colored square styling to each option
        this._styleColorOptions(colorSelect);
    },

    /**
     * Style dropdown options with colored unicode squares
     * The unicode box character will be colored to match the hex color
     * @param {HTMLSelectElement} selectElement - The select element containing color options
     */
    _styleColorOptions(selectElement) {
        Array.from(selectElement.options).forEach(option => {
            if (option.dataset.color) {
                const color = option.dataset.color;

                // Apply styling: Use text-shadow to create colored unicode box effect
                // The first character (■) gets the color shadow, rest of text stays white
                option.style.cssText = `
                    background: var(--surface-color);
                    padding-left: 0.2em;
                    text-shadow: 0 0 0 ${color};
                    color: ${color};
                `;
            }
        });
    },

    /**
     * Update the color preview square with the selected color
     * @param {string} color - Hex color value to display
     */
    _updateColorPreview(color) {
        if (this.elements.notchColorPicker) {
            this.elements.notchColorPicker.value = color;
        }
    },

    /**
     * Sync dropdown selection with manually entered hex color
     * Searches current category for matching color and selects it
     * @param {string} color - Hex color value to match
     */
    _syncDropdownWithColor(color) {
        const colorSelect = this.elements.notchColorSelect;
        const normalizedColor = color.toUpperCase();

        // Try to find and select matching option in current dropdown
        for (let i = 0; i < colorSelect.options.length; i++) {
            if (colorSelect.options[i].value.toUpperCase() === normalizedColor) {
                colorSelect.selectedIndex = i;
                return;
            }
        }

        // If not found, reset to default "Select a color"
        colorSelect.selectedIndex = 0;
    },

    /**
     * Initialize back side notch color dropdowns
     */
    _initNotchColorDropdownsBack() {
        const groupSelect = this.elements.notchColorGroupSelectBack;
        const colorSelect = this.elements.notchColorSelectBack;

        if (!groupSelect || !colorSelect) return;

        // Populate category dropdown
        const groupNames = Object.keys(this.notchColorGroups);
        groupSelect.innerHTML = '';
        groupNames.forEach((name, idx) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (idx === 0) option.selected = true;
            groupSelect.appendChild(option);
        });

        // Populate colors for initially selected category
        this._populateColorDropdownBack(groupNames[0]);

        // Initialize with current color from front side
        if (CanvasManager && CanvasManager.accentColor) {
            this._updateColorPreviewBack(CanvasManager.accentColor);
            this.elements.borderColorHexBack.value = CanvasManager.accentColor;
        }

        // Event: Category selection changes
        groupSelect.addEventListener('change', (e) => {
            this._populateColorDropdownBack(e.target.value);
        });

        // Event: Color selection changes
        colorSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const color = selectedOption.value.toUpperCase();
                this._updateColorPreviewBack(color);
                this.elements.borderColorHexBack.value = color;
                CanvasManager.setBorderColor(color);
                this._syncFrontColors(color, null);
            }
        });
    },

    /**
     * Populate back side color dropdown
     */
    _populateColorDropdownBack(groupName) {
        const colorSelect = this.elements.notchColorSelectBack;
        const colors = this.notchColorGroups[groupName] || [];

        colorSelect.innerHTML = '<option value="">Select a color</option>';

        colors.forEach(item => {
            const option = document.createElement('option');
            option.value = item.color;
            option.textContent = `■ ${item.title}`;
            option.title = `${item.title} - ${item.color}`;
            option.dataset.color = item.color;
            option.dataset.title = item.title;
            colorSelect.appendChild(option);
        });

        this._styleColorOptions(colorSelect);
    },

    /**
     * Update color preview for back side
     */
    _updateColorPreviewBack(color) {
        if (this.elements.notchColorPickerBack) {
            this.elements.notchColorPickerBack.value = color;
        }
    },

    /**
     * Sync dropdown selection for back side
     */
    _syncDropdownWithColorBack(color) {
        const colorSelect = this.elements.notchColorSelectBack;
        if (!colorSelect) return;

        const normalizedColor = color.toUpperCase();

        for (let i = 0; i < colorSelect.options.length; i++) {
            if (colorSelect.options[i].value.toUpperCase() === normalizedColor) {
                colorSelect.selectedIndex = i;
                return;
            }
        }

        colorSelect.selectedIndex = 0;
    },

    /**
     * Sync colors from back side to front side
     * @param {string} borderColor - Border color to sync (null to skip)
     * @param {string} textColor - Text color to sync (null to skip)
     */
    _syncFrontColors(borderColor, textColor) {
        if (borderColor) {
            if (this.elements.borderColorHex) this.elements.borderColorHex.value = borderColor;
            if (this.elements.notchColorPicker) this.elements.notchColorPicker.value = borderColor;
            this._syncDropdownWithColor(borderColor);
        }
        if (textColor) {
            if (this.elements.textColorPicker) this.elements.textColorPicker.value = textColor;
            if (this.elements.textColorHex) this.elements.textColorHex.value = textColor;
        }
    },

    /**
     * Sync front side colors to back side (called on load/switch)
     */
    syncBackColors() {
        // Sync border color
        const borderColor = CanvasManager.accentColor;
        if (borderColor) {
            if (this.elements.borderColorHexBack) this.elements.borderColorHexBack.value = borderColor;
            if (this.elements.notchColorPickerBack) this.elements.notchColorPickerBack.value = borderColor;
            if (this.elements.borderColorHexBackMobile) this.elements.borderColorHexBackMobile.value = borderColor;
            this._syncDropdownWithColorBack(borderColor);
        }

        // Sync text color
        const textColor = CanvasManager.textColor;
        if (textColor) {
            if (this.elements.textColorPickerBack) this.elements.textColorPickerBack.value = textColor;
            if (this.elements.textColorHexBack) this.elements.textColorHexBack.value = textColor;
            if (this.elements.textColorPickerBackMobile) this.elements.textColorPickerBackMobile.value = textColor;
            if (this.elements.textColorHexBackMobile) this.elements.textColorHexBackMobile.value = textColor;
        }
    },

    /**
     * Sync all UI controls from loaded preset data
     * @param {Object} data - Preset data object
     */
    async syncUIFromPreset(data) {
        // Card size
        if (data.currentCardSize && this.elements.cardSizePreset) {
            this.elements.cardSizePreset.value = data.currentCardSize;
            if (data.currentCardSize === 'custom') {
                this.elements.customSizeInputs.style.display = 'flex';
                this.elements.customSizeInputs.style.flexDirection = 'column';
                this.elements.customSizeInputs.style.gap = 'var(--space-lg)';
                if (data.canvasWidth && data.canvasHeight) {
                    const widthMM = Math.round(data.canvasWidth / (300 / 25.4));
                    const heightMM = Math.round(data.canvasHeight / (300 / 25.4));
                    this.elements.customWidthMM.value = widthMM;
                    this.elements.customHeightMM.value = heightMM;
                    this.elements.customSizePixels.textContent = `${data.canvasWidth}x${data.canvasHeight} pixels at 300 DPI`;
                }
            } else {
                this.elements.customSizeInputs.style.display = 'none';
            }
        }

        // Objekt border toggle
        if (data.showObjektBorder !== undefined && this.elements.objektBorderToggle) {
            this.elements.objektBorderToggle.checked = data.showObjektBorder;
            this.handleObjektBorderToggle(data.showObjektBorder);
        }

        // Overflow border toggle + slider
        if (data.showOverflowBorder !== undefined) {
            const overflowToggle = document.getElementById('overflowBorderToggle');
            const overflowToggleMobile = document.getElementById('overflowBorderToggleMobile');
            const overflowContainer = document.getElementById('overflowBorderSliderContainer');
            const overflowContainerMobile = document.getElementById('overflowBorderSliderContainerMobile');
            if (overflowToggle) overflowToggle.checked = data.showOverflowBorder;
            if (overflowToggleMobile) overflowToggleMobile.checked = data.showOverflowBorder;
            if (overflowContainer) overflowContainer.style.display = data.showOverflowBorder ? 'flex' : 'none';
            if (overflowContainerMobile) overflowContainerMobile.style.display = data.showOverflowBorder ? 'flex' : 'none';
        }
        if (data.overflowBorderPercent !== undefined) {
            const overflowSlider = document.getElementById('overflowBorderSlider');
            const overflowSliderMobile = document.getElementById('overflowBorderSliderMobile');
            const overflowValue = document.getElementById('overflowBorderValue');
            const overflowValueMobile = document.getElementById('overflowBorderValueMobile');
            if (overflowSlider) overflowSlider.value = data.overflowBorderPercent;
            if (overflowSliderMobile) overflowSliderMobile.value = data.overflowBorderPercent;
            if (overflowValue) overflowValue.textContent = `${data.overflowBorderPercent}%`;
            if (overflowValueMobile) overflowValueMobile.textContent = `${data.overflowBorderPercent}%`;
        }

        // Image transform sliders
        if (data.imageScale !== undefined) {
            const zoom = Math.round(data.imageScale * 100);
            this.syncSliderValue('zoom', zoom);
        }
        if (data.imagePosX !== undefined) this.syncSliderValue('panX', data.imagePosX);
        if (data.imagePosY !== undefined) this.syncSliderValue('panY', data.imagePosY);
        if (data.cornerRadius !== undefined) this.syncSliderValue('cornerRadius', data.cornerRadius);

        // Border color
        if (data.accentColor) {
            this._updateColorPreview(data.accentColor);
            if (this.elements.borderColorHex) this.elements.borderColorHex.value = data.accentColor;
            if (this.elements.notchColorPicker) this.elements.notchColorPicker.value = data.accentColor;
            this._syncDropdownWithColor(data.accentColor);
        }

        // Front text
        if (data.topText !== undefined && this.elements.topText) this.elements.topText.value = data.topText;
        if (data.middleText !== undefined && this.elements.middleText) this.elements.middleText.value = data.middleText;
        if (data.bottomText !== undefined && this.elements.bottomText) this.elements.bottomText.value = data.bottomText;

        // Text color
        if (data.textColor) {
            if (this.elements.textColorPicker) this.elements.textColorPicker.value = data.textColor;
            if (this.elements.textColorHex) this.elements.textColorHex.value = data.textColor;
        }

        // Font family
        if (data.fontFamily) {
            this.loadGoogleFont(data.fontFamily);
            if (this.elements.fontPickerPreview) {
                this.elements.fontPickerPreview.textContent = data.fontFamily;
                this.elements.fontPickerPreview.style.fontFamily = `'${data.fontFamily}', sans-serif`;
            }
            if (this.elements.fontPickerPreviewMobile) {
                this.elements.fontPickerPreviewMobile.textContent = data.fontFamily;
                this.elements.fontPickerPreviewMobile.style.fontFamily = `'${data.fontFamily}', sans-serif`;
            }
            this.updateFontWeightVisibility(data.fontFamily);
        }

        // Font weight (also handles legacy presets that used a single fontWeight)
        if (data.fontWeightFront !== undefined || data.fontWeightBack !== undefined || data.fontWeight !== undefined) {
            this.updateFontWeightVisibility();
        }

        // Text height sliders (front)
        if (data.topTextHeight !== undefined) {
            if (this.elements.topTextHeight) {
                this.elements.topTextHeight.value = data.topTextHeight;
                this.elements.topTextHeightValue.textContent = `${data.topTextHeight}px`;
            }
        }
        if (data.middleTextHeight !== undefined) {
            if (this.elements.middleTextHeight) {
                this.elements.middleTextHeight.value = data.middleTextHeight;
                this.elements.middleTextHeightValue.textContent = `${data.middleTextHeight}px`;
            }
        }
        if (data.bottomTextHeight !== undefined) {
            if (this.elements.bottomTextHeight) {
                this.elements.bottomTextHeight.value = data.bottomTextHeight;
                this.elements.bottomTextHeightValue.textContent = `${data.bottomTextHeight}px`;
            }
        }

        // Front logo sliders
        if (data.frontLogoZoom !== undefined) {
            const v = Math.round(data.frontLogoZoom * 100);
            this.syncFrontLogoSliderValue('zoom', v);
        }
        if (data.frontLogoPosX !== undefined) this.syncFrontLogoSliderValue('posX', data.frontLogoPosX);
        if (data.frontLogoPosY !== undefined) this.syncFrontLogoSliderValue('posY', data.frontLogoPosY);
        if (data.frontLogoRotation !== undefined) this.syncFrontLogoSliderValue('rotation', data.frontLogoRotation);

        // Top logo sliders (back)
        if (data.topLogoZoom !== undefined) {
            const v = Math.round(data.topLogoZoom * 100);
            this.syncTopLogoSliderValue('zoom', v);
        }
        if (data.topLogoPosX !== undefined) this.syncTopLogoSliderValue('posX', data.topLogoPosX);
        if (data.topLogoPosY !== undefined) this.syncTopLogoSliderValue('posY', data.topLogoPosY);
        if (data.topLogoRotation !== undefined) this.syncTopLogoSliderValue('rotation', data.topLogoRotation);

        // Bottom logo sliders (back)
        if (data.logoZoom !== undefined) {
            const v = Math.round(data.logoZoom * 100);
            this.syncLogoSliderValue('zoom', v);
        }
        if (data.logoPosX !== undefined) this.syncLogoSliderValue('posX', data.logoPosX);
        if (data.logoPosY !== undefined) this.syncLogoSliderValue('posY', data.logoPosY);
        if (data.logoRotation !== undefined) this.syncLogoSliderValue('rotation', data.logoRotation);

        // Signature sliders
        if (data.signatureZoom !== undefined) {
            const v = Math.round(data.signatureZoom * 100);
            this.syncSignatureSliderValue('zoom', v);
        }
        if (data.signaturePosX !== undefined) this.syncSignatureSliderValue('posX', data.signaturePosX);
        if (data.signaturePosY !== undefined) this.syncSignatureSliderValue('posY', data.signaturePosY);

        // Back side text fields (desktop + mobile)
        if (data.backNameLabel !== undefined) {
            if (this.elements.backNameLabel) this.elements.backNameLabel.value = data.backNameLabel;
            if (this.elements.backNameLabelMobile) this.elements.backNameLabelMobile.value = data.backNameLabel;
        }
        if (data.backNameValue !== undefined) {
            if (this.elements.backNameValue) this.elements.backNameValue.value = data.backNameValue;
            if (this.elements.backNameValueMobile) this.elements.backNameValueMobile.value = data.backNameValue;
        }
        if (data.backClassLabel !== undefined) {
            if (this.elements.backClassLabel) this.elements.backClassLabel.value = data.backClassLabel;
            if (this.elements.backClassLabelMobile) this.elements.backClassLabelMobile.value = data.backClassLabel;
        }
        if (data.backClassValue !== undefined) {
            if (this.elements.backClassValue) this.elements.backClassValue.value = data.backClassValue;
            if (this.elements.backClassValueMobile) this.elements.backClassValueMobile.value = data.backClassValue;
        }
        if (data.backSeasonLabel !== undefined) {
            if (this.elements.backSeasonLabel) this.elements.backSeasonLabel.value = data.backSeasonLabel;
            if (this.elements.backSeasonLabelMobile) this.elements.backSeasonLabelMobile.value = data.backSeasonLabel;
        }
        if (data.backSeasonValue !== undefined) {
            if (this.elements.backSeasonValue) this.elements.backSeasonValue.value = data.backSeasonValue;
            if (this.elements.backSeasonValueMobile) this.elements.backSeasonValueMobile.value = data.backSeasonValue;
        }
        if (data.backGroupName !== undefined) {
            if (this.elements.backGroupName) this.elements.backGroupName.value = data.backGroupName;
            if (this.elements.backGroupNameMobile) this.elements.backGroupNameMobile.value = data.backGroupName;
        }

        // Back text height sliders
        if (data.backTopTextHeight !== undefined) {
            if (this.elements.backTopTextHeight) {
                this.elements.backTopTextHeight.value = data.backTopTextHeight;
                this.elements.backTopTextHeightValue.textContent = `${data.backTopTextHeight}px`;
            }
            if (this.elements.backTopTextHeightMobile) {
                this.elements.backTopTextHeightMobile.value = data.backTopTextHeight;
                this.elements.backTopTextHeightValueMobile.textContent = `${data.backTopTextHeight}px`;
            }
        }
        if (data.backBottomTextHeight !== undefined) {
            if (this.elements.backBottomTextHeight) {
                this.elements.backBottomTextHeight.value = data.backBottomTextHeight;
                this.elements.backBottomTextHeightValue.textContent = `${data.backBottomTextHeight}px`;
            }
            if (this.elements.backBottomTextHeightMobile) {
                this.elements.backBottomTextHeightMobile.value = data.backBottomTextHeight;
                this.elements.backBottomTextHeightValueMobile.textContent = `${data.backBottomTextHeight}px`;
            }
        }

        // QR code link
        if (data.qrCodeLink !== undefined) {
            if (this.elements.qrCodeLink) this.elements.qrCodeLink.value = data.qrCodeLink;
            if (this.elements.qrCodeLinkMobile) this.elements.qrCodeLinkMobile.value = data.qrCodeLink;
            await CanvasManager.generateQRCode();
        }

        // Template overlay
        if (data.templateOpacity !== undefined && this.elements.templateOpacity) {
            const pct = Math.round(data.templateOpacity * 100);
            this.elements.templateOpacity.value = pct;
            this.elements.templateOpacityValue.textContent = `${pct}%`;
        }
        if (data.showTemplate !== undefined && this.elements.templateToggle) {
            this.elements.templateToggle.checked = data.showTemplate;
        }

        // Back side template overlay
        if (data.templateOpacityBack !== undefined && this.elements.templateOpacityBack) {
            const pct = Math.round(data.templateOpacityBack * 100);
            this.elements.templateOpacityBack.value = pct;
            this.elements.templateOpacityValueBack.textContent = `${pct}%`;
        }
        if (data.showTemplateBack !== undefined && this.elements.templateToggleBack) {
            this.elements.templateToggleBack.checked = data.showTemplateBack;
        }

        // Back image sliders
        if (data.backImageScale !== undefined) {
            const zoom = Math.round(data.backImageScale * 100);
            this.syncBackSliderValue('backZoom', zoom);
        }
        if (data.backImagePosX !== undefined) this.syncBackSliderValue('backPanX', data.backImagePosX);
        if (data.backImagePosY !== undefined) this.syncBackSliderValue('backPanY', data.backImagePosY);
        // Show/hide back image controls based on whether back image exists
        this.showBackImageControls(CanvasManager.hasBackImage());

        // Sync back side colors
        this.syncBackColors();
    },

    /**
     * Handle border image upload for back side
     */
    async handleBorderImageUploadBack(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading border image…', 'Please wait…');
        try {
            await CanvasManager.loadBorderImage(file);
            this.elements.clearBorderImageBack.style.display = 'block';
            // Also update front side button
            if (this.elements.clearBorderImage) {
                this.elements.clearBorderImage.style.display = 'block';
            }
            this.showSuccessMessage('Border image loaded successfully!');
            HistoryManager.pushState('Uploaded border image');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear border image from back side
     */
    clearBorderImageBack() {
        CanvasManager.clearBorderImage();
        this.elements.borderImageUploadBack.value = '';
        this.elements.clearBorderImageBack.style.display = 'none';
        // Also update front side
        if (this.elements.borderImageUpload) {
            this.elements.borderImageUpload.value = '';
        }
        if (this.elements.clearBorderImage) {
            this.elements.clearBorderImage.style.display = 'none';
        }
        console.log('Border image cleared');
        HistoryManager.pushState('Cleared border image');
    },

    /**
     * Sync slider values between desktop and mobile versions
     */
    syncSliderValue(type, value) {
        switch(type) {
            case 'zoom':
                if (this.elements.zoomSlider) this.elements.zoomSlider.value = value;
                if (this.elements.zoomValue) this.elements.zoomValue.textContent = `${value}%`;
                if (this.elements.zoomSliderMobile) this.elements.zoomSliderMobile.value = value;
                if (this.elements.zoomValueMobile) this.elements.zoomValueMobile.textContent = `${value}%`;
                // Floating overlay
                if (this.elements.zoomSliderFloating) this.elements.zoomSliderFloating.value = value;
                if (this.elements.zoomValueFloating) this.elements.zoomValueFloating.textContent = `${value}%`;
                break;
            case 'panX':
                if (this.elements.panXSlider) this.elements.panXSlider.value = value;
                if (this.elements.panXValue) this.elements.panXValue.textContent = `${value}px`;
                if (this.elements.panXSliderMobile) this.elements.panXSliderMobile.value = value;
                if (this.elements.panXValueMobile) this.elements.panXValueMobile.textContent = `${value}px`;
                // Floating overlay
                if (this.elements.panXSliderFloating) this.elements.panXSliderFloating.value = value;
                if (this.elements.panXValueFloating) this.elements.panXValueFloating.textContent = `${value}px`;
                // Mobile edge slider
                if (this.elements.mobilePanXSlider) this.elements.mobilePanXSlider.value = value;
                break;
            case 'panY':
                if (this.elements.panYSlider) this.elements.panYSlider.value = value;
                if (this.elements.panYValue) this.elements.panYValue.textContent = `${value}px`;
                if (this.elements.panYSliderMobile) this.elements.panYSliderMobile.value = value;
                if (this.elements.panYValueMobile) this.elements.panYValueMobile.textContent = `${value}px`;
                // Floating overlay
                if (this.elements.panYSliderFloating) this.elements.panYSliderFloating.value = value;
                if (this.elements.panYValueFloating) this.elements.panYValueFloating.textContent = `${value}px`;
                // Mobile edge slider (rotated, so negate value)
                if (this.elements.mobilePanYSlider) this.elements.mobilePanYSlider.value = -value;
                break;
            case 'cornerRadius':
                if (this.elements.cornerRadiusSlider) this.elements.cornerRadiusSlider.value = value;
                if (this.elements.cornerRadiusValue) this.elements.cornerRadiusValue.textContent = `${value}px`;
                // Floating overlay
                if (this.elements.cornerRadiusSliderFloating) this.elements.cornerRadiusSliderFloating.value = value;
                if (this.elements.cornerRadiusValueFloating) this.elements.cornerRadiusValueFloating.textContent = `${value}px`;
                break;
        }
    },

    /**
     * Sync signature slider values between modal and toolbar
     */
    syncSignatureSliderValue(type, value) {
        switch(type) {
            case 'zoom':
                // Modal
                if (this.elements.signatureZoomSlider) this.elements.signatureZoomSlider.value = value;
                if (this.elements.signatureZoomValue) this.elements.signatureZoomValue.textContent = `${value}%`;
                // Toolbar desktop
                if (this.elements.signatureZoomToolbar) this.elements.signatureZoomToolbar.value = value;
                if (this.elements.signatureZoomToolbarValue) this.elements.signatureZoomToolbarValue.textContent = `${value}%`;
                // Toolbar mobile
                if (this.elements.signatureZoomToolbarMobile) this.elements.signatureZoomToolbarMobile.value = value;
                if (this.elements.signatureZoomToolbarValueMobile) this.elements.signatureZoomToolbarValueMobile.textContent = `${value}%`;
                break;
            case 'posX':
                // Modal
                if (this.elements.signaturePosXSlider) this.elements.signaturePosXSlider.value = value;
                if (this.elements.signaturePosXValue) this.elements.signaturePosXValue.textContent = `${value}px`;
                // Toolbar desktop
                if (this.elements.signaturePosXToolbar) this.elements.signaturePosXToolbar.value = value;
                if (this.elements.signaturePosXToolbarValue) this.elements.signaturePosXToolbarValue.textContent = `${value}px`;
                // Toolbar mobile
                if (this.elements.signaturePosXToolbarMobile) this.elements.signaturePosXToolbarMobile.value = value;
                if (this.elements.signaturePosXToolbarValueMobile) this.elements.signaturePosXToolbarValueMobile.textContent = `${value}px`;
                break;
            case 'posY':
                // Modal
                if (this.elements.signaturePosYSlider) this.elements.signaturePosYSlider.value = value;
                if (this.elements.signaturePosYValue) this.elements.signaturePosYValue.textContent = `${value}px`;
                // Toolbar desktop
                if (this.elements.signaturePosYToolbar) this.elements.signaturePosYToolbar.value = value;
                if (this.elements.signaturePosYToolbarValue) this.elements.signaturePosYToolbarValue.textContent = `${value}px`;
                // Toolbar mobile
                if (this.elements.signaturePosYToolbarMobile) this.elements.signaturePosYToolbarMobile.value = value;
                if (this.elements.signaturePosYToolbarValueMobile) this.elements.signaturePosYToolbarValueMobile.textContent = `${value}px`;
                break;
        }
    },

    /**
     * Scroll to canvas/preview section
     */
    scrollToPreview() {
        if (this.elements.canvasContainer) {
            // Small delay to ensure canvas is rendered
            setTimeout(() => {
                this.elements.canvasContainer.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                // Note: Button visibility is now controlled by scroll event listener
            }, 100);
        }
    },

    /**
     * Handle image file upload
     */
    async handleImageUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Multiple images → bulk create mode
        if (files.length > 1) {
            this.startBulkFromFiles(files);
            this.updateCanvasUploadPlaceholder();
            // Reset input so same files can be re-selected
            event.target.value = '';
            return;
        }

        // Single image → default single canvas
        const file = files[0];
        const isLargeMedia = file.type === 'image/gif' || file.type === 'video/mp4';
        const uploadSub = isLargeMedia ? 'This may take a moment for large GIFs and videos.' : 'Please wait…';
        this.showMediaLoadingOverlay('Uploading image…', uploadSub);
        try {
            await CanvasManager.loadImage(file);
            this.showCanvas();
            this.scrollToPreview();
            this.showSuccessMessage('Image loaded successfully!');
            HistoryManager.pushState('Uploaded main image');

            // Show tooltip for top text field (only once per session)
            this.showTopTextTooltip();

            // Show mobile pan controls
            this.updateMobilePanControlsVisibility();

            // Hide mobile canvas upload placeholder
            this.updateCanvasUploadPlaceholder();
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Handle back side image upload
     */
    async handleBackImageUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        const file = files[0];
        this.showMediaLoadingOverlay('Uploading image…', 'Please wait…');
        try {
            await CanvasManager.loadBackImage(file);
            this.showBackImageControls(true);
            this.showSuccessMessage('Back image loaded successfully!');
            HistoryManager.pushState('Uploaded back image');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
        event.target.value = '';
    },

    /**
     * Handle drop on back image upload area
     */
    async handleBackImageDrop(event) {
        event.preventDefault();
        const target = event.currentTarget;
        target.classList.remove('drag-over');

        const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;

        const file = files[0];
        this.showMediaLoadingOverlay('Uploading image…', 'Please wait…');
        try {
            await CanvasManager.loadBackImage(file);
            this.showBackImageControls(true);
            this.showSuccessMessage('Back image loaded successfully!');
            HistoryManager.pushState('Uploaded back image');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Show/hide back image adjustment controls
     */
    showBackImageControls(show) {
        if (this.elements.backImageAdjustments) {
            this.elements.backImageAdjustments.style.display = show ? '' : 'none';
        }
        if (this.elements.backImageAdjustmentsMobile) {
            this.elements.backImageAdjustmentsMobile.style.display = show ? '' : 'none';
        }
        // Update back canvas cursor
        if (this._updateBackCanvasCursor) {
            this._updateBackCanvasCursor();
        }
    },

    /**
     * Clear the uploaded back image
     */
    clearBackImage() {
        CanvasManager.backUploadedImage = null;
        CanvasManager.backImageScale = 1;
        CanvasManager.backImagePosX = 0;
        CanvasManager.backImagePosY = 0;
        CanvasManager.updateBackSidePreview();
        this.showBackImageControls(false);

        // Reset sliders
        if (this.elements.backZoomSlider) {
            this.elements.backZoomSlider.value = 100;
            this.elements.backZoomValue.textContent = '100%';
        }
        if (this.elements.backPanXSlider) {
            this.elements.backPanXSlider.value = 0;
            this.elements.backPanXValue.textContent = '0px';
        }
        if (this.elements.backPanYSlider) {
            this.elements.backPanYSlider.value = 0;
            this.elements.backPanYValue.textContent = '0px';
        }
        if (this.elements.backZoomSliderMobile) {
            this.elements.backZoomSliderMobile.value = 100;
            this.elements.backZoomValueMobile.textContent = '100%';
        }
        if (this.elements.backPanXSliderMobile) {
            this.elements.backPanXSliderMobile.value = 0;
            this.elements.backPanXValueMobile.textContent = '0px';
        }
        if (this.elements.backPanYSliderMobile) {
            this.elements.backPanYSliderMobile.value = 0;
            this.elements.backPanYValueMobile.textContent = '0px';
        }

        this.showSuccessMessage('Back image cleared');
        HistoryManager.pushState('Cleared back image');
    },

    /**
     * Sync back image slider values between desktop and mobile
     */
    syncBackSliderValue(type, value) {
        const val = parseInt(value);
        switch (type) {
            case 'backZoom':
                if (this.elements.backZoomSlider) this.elements.backZoomSlider.value = val;
                if (this.elements.backZoomValue) this.elements.backZoomValue.textContent = `${val}%`;
                if (this.elements.backZoomSliderMobile) this.elements.backZoomSliderMobile.value = val;
                if (this.elements.backZoomValueMobile) this.elements.backZoomValueMobile.textContent = `${val}%`;
                break;
            case 'backPanX':
                if (this.elements.backPanXSlider) this.elements.backPanXSlider.value = val;
                if (this.elements.backPanXValue) this.elements.backPanXValue.textContent = `${val}px`;
                if (this.elements.backPanXSliderMobile) this.elements.backPanXSliderMobile.value = val;
                if (this.elements.backPanXValueMobile) this.elements.backPanXValueMobile.textContent = `${val}px`;
                break;
            case 'backPanY':
                if (this.elements.backPanYSlider) this.elements.backPanYSlider.value = val;
                if (this.elements.backPanYValue) this.elements.backPanYValue.textContent = `${val}px`;
                if (this.elements.backPanYSliderMobile) this.elements.backPanYSliderMobile.value = val;
                if (this.elements.backPanYValueMobile) this.elements.backPanYValueMobile.textContent = `${val}px`;
                break;
        }
    },

    /**
     * Start bulk create mode from multiple files selected via main upload
     */
    startBulkFromFiles(files) {
        // Capture template and open bulk modal
        BulkManager.captureTemplate();
        BulkManager.isOpen = true;
        BulkManager.elements.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        BulkManager.updateUI();
        BulkManager.elements.exportAllBtn.innerHTML = BulkManager.isMobile()
            ? '<i data-lucide="download"></i> Save All'
            : '<i data-lucide="download"></i> Download All as ZIP';
        lucide.createIcons();

        // Feed files into BulkManager
        BulkManager.handleFiles(files);
    },

    /**
     * Handle border image upload
     */
    async handleBorderImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading border image…', 'Please wait…');
        try {
            await CanvasManager.loadBorderImage(file);
            this.elements.clearBorderImage.style.display = 'block';
            this.showSuccessMessage('Border image loaded successfully!');
            HistoryManager.pushState('Uploaded border image');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear border image
     */
    clearBorderImage() {
        CanvasManager.clearBorderImage();
        this.elements.borderImageUpload.value = '';
        this.elements.clearBorderImage.style.display = 'none';
        console.log('Border image cleared');
        HistoryManager.pushState('Cleared border image');
    },

    /**
     * Handle objekt border toggle
     * When disabled: hides accent bar, hides objekt-specific controls
     * Back side remains accessible regardless of border state
     * @param {boolean} enabled - Whether objekt border is enabled
     */
    handleObjektBorderToggle(enabled) {
        CanvasManager.showObjektBorder = enabled;
        CanvasManager.render();

        // Show/hide objekt-only controls (border color, border image, front text)
        const objektOnlyControls = document.querySelectorAll('.objekt-only-control');

        if (enabled) {
            // Show objekt-only controls
            objektOnlyControls.forEach(control => {
                control.style.display = '';
            });
        } else {
            // Hide objekt-only controls
            objektOnlyControls.forEach(control => {
                control.style.display = 'none';
            });
        }

        // Re-render back side if currently viewing it
        if (this.currentView === 'back') {
            CanvasManager.updateBackSidePreview();
        }

        console.log('Objekt border toggled:', enabled ? 'ON' : 'OFF');
    },

    /**
     * Handle card size preset change
     * @param {string} preset - Selected preset ('objekt', 'standard', 'credit', 'instax', 'custom')
     */
    handleCardSizeChange(preset) {
        if (preset === 'custom') {
            // Show custom size inputs
            this.elements.customSizeInputs.style.display = 'flex';
            this.elements.customSizeInputs.style.flexDirection = 'column';
            this.elements.customSizeInputs.style.gap = 'var(--space-lg)';

            // Apply custom size if values are already entered
            this.handleCustomSizeInput();
        } else {
            // Hide custom size inputs
            this.elements.customSizeInputs.style.display = 'none';

            // Apply preset size
            CanvasManager.setCardSize(preset);
        }

        console.log('Card size changed to:', preset);
    },

    /**
     * Handle custom size input (mm to pixels conversion)
     */
    handleCustomSizeInput() {
        const widthMM = parseFloat(this.elements.customWidthMM.value);
        const heightMM = parseFloat(this.elements.customHeightMM.value);

        if (widthMM > 0 && heightMM > 0) {
            // Convert mm to pixels at 300 DPI
            const widthPx = CanvasManager.mmToPixels(widthMM);
            const heightPx = CanvasManager.mmToPixels(heightMM);

            // Update pixel display
            this.elements.customSizePixels.textContent = `${widthPx}x${heightPx} pixels at 300 DPI`;

            // Apply custom size
            CanvasManager.setCardSize('custom', widthPx, heightPx);

            console.log(`Custom size: ${widthMM}x${heightMM}mm = ${widthPx}x${heightPx}px`);
        } else {
            this.elements.customSizePixels.textContent = 'Enter dimensions to see pixel size';
        }
    },

    /**
     * Handle back side logo image upload
     */
    async handleLogoImageUpload(event, isMobile = false) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading logo…', 'Please wait…');
        try {
            // Clear bottom text (tripleS) before loading logo
            CanvasManager.backGroupName = '';
            if (this.elements.backGroupName) {
                this.elements.backGroupName.value = '';
            }
            if (this.elements.backGroupNameMobile) {
                this.elements.backGroupNameMobile.value = '';
            }

            await CanvasManager.loadLogoImage(file);

            // Show controls container
            this.elements.logoControlsContainer.style.display = 'block';
            if (this.elements.logoControlsContainerMobile) {
                this.elements.logoControlsContainerMobile.style.display = 'block';
            }

            // Reset sliders to neutral position (0) - base position is handled internally
            this.syncLogoSliderValue('zoom', 100);
            this.syncLogoSliderValue('posX', 0);
            this.syncLogoSliderValue('posY', 0);
            this.syncLogoSliderValue('rotation', 90);
            CanvasManager.setLogoZoom(1);
            CanvasManager.setLogoPosition(0, 0);
            CanvasManager.setLogoRotation(90);

            CanvasManager.render();
            this.showSuccessMessage('Logo image loaded successfully!');
            HistoryManager.pushState('Uploaded back logo');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear back side logo image
     */
    clearLogoImage() {
        CanvasManager.clearLogoImage();
        if (this.elements.logoUpload) {
            this.elements.logoUpload.value = '';
        }
        if (this.elements.logoUploadMobile) {
            this.elements.logoUploadMobile.value = '';
        }
        this.elements.logoControlsContainer.style.display = 'none';
        if (this.elements.logoControlsContainerMobile) {
            this.elements.logoControlsContainerMobile.style.display = 'none';
        }
        console.log('Logo image cleared');
        HistoryManager.pushState('Cleared back logo');
    },

    /**
     * Handle top logo image upload (replaces hex cube)
     */
    async handleTopLogoImageUpload(event, isMobile = false) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading logo…', 'Please wait…');
        try {
            await CanvasManager.loadTopLogoImage(file);

            // Show controls container
            this.elements.topLogoControlsContainer.style.display = 'block';
            if (this.elements.topLogoControlsContainerMobile) {
                this.elements.topLogoControlsContainerMobile.style.display = 'block';
            }

            // Reset sliders to neutral position (0)
            this.syncTopLogoSliderValue('zoom', 100);
            this.syncTopLogoSliderValue('posX', 0);
            this.syncTopLogoSliderValue('posY', 0);
            this.syncTopLogoSliderValue('rotation', 0);
            CanvasManager.setTopLogoZoom(1);
            CanvasManager.setTopLogoPosition(0, 0);
            CanvasManager.setTopLogoRotation(0);

            this.showSuccessMessage('Top logo image loaded successfully!');
            HistoryManager.pushState('Uploaded top logo');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear top logo image
     */
    clearTopLogoImage() {
        CanvasManager.clearTopLogoImage();
        if (this.elements.topLogoUpload) {
            this.elements.topLogoUpload.value = '';
        }
        if (this.elements.topLogoUploadMobile) {
            this.elements.topLogoUploadMobile.value = '';
        }
        this.elements.topLogoControlsContainer.style.display = 'none';
        if (this.elements.topLogoControlsContainerMobile) {
            this.elements.topLogoControlsContainerMobile.style.display = 'none';
        }
        console.log('Top logo image cleared');
        HistoryManager.pushState('Cleared top logo');
    },

    /**
     * Sync top logo slider values between desktop and mobile
     */
    syncTopLogoSliderValue(sliderType, value, isMobile = false) {
        if (sliderType === 'zoom') {
            if (!isMobile && this.elements.topLogoZoomMobile) {
                this.elements.topLogoZoomMobile.value = value;
                this.elements.topLogoZoomValueMobile.textContent = `${value}%`;
            } else if (isMobile && this.elements.topLogoZoom) {
                this.elements.topLogoZoom.value = value;
                this.elements.topLogoZoomValue.textContent = `${value}%`;
            }
        } else if (sliderType === 'posX') {
            if (!isMobile && this.elements.topLogoPosXMobile) {
                this.elements.topLogoPosXMobile.value = value;
                this.elements.topLogoPosXValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.topLogoPosX) {
                this.elements.topLogoPosX.value = value;
                this.elements.topLogoPosXValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'posY') {
            if (!isMobile && this.elements.topLogoPosYMobile) {
                this.elements.topLogoPosYMobile.value = value;
                this.elements.topLogoPosYValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.topLogoPosY) {
                this.elements.topLogoPosY.value = value;
                this.elements.topLogoPosYValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'rotation') {
            if (!isMobile && this.elements.topLogoRotationMobile) {
                this.elements.topLogoRotationMobile.value = value;
                this.elements.topLogoRotationValueMobile.textContent = `${value}°`;
            } else if (isMobile && this.elements.topLogoRotation) {
                this.elements.topLogoRotation.value = value;
                this.elements.topLogoRotationValue.textContent = `${value}°`;
            }
        }
    },

    /**
     * Handle front side logo image upload
     */
    async handleFrontLogoImageUpload(event, isMobile = false) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading logo…', 'Please wait…');
        try {
            // Clear bottom text before loading logo
            CanvasManager.bottomText = '';
            if (this.elements.bottomText) {
                this.elements.bottomText.value = '';
            }
            if (this.elements.bottomTextMobile) {
                this.elements.bottomTextMobile.value = '';
            }
            // Clear canvas text editor if open
            const editorInput = document.querySelector('.canvas-text-editor-input');
            if (editorInput) {
                editorInput.value = '';
            }

            await CanvasManager.loadFrontLogoImage(file);

            // Show controls container
            this.elements.frontLogoControlsContainer.style.display = 'block';
            if (this.elements.frontLogoControlsContainerMobile) {
                this.elements.frontLogoControlsContainerMobile.style.display = 'block';
            }

            // Reset sliders to neutral position (0) - base position is handled internally
            this.syncFrontLogoSliderValue('zoom', 100);
            this.syncFrontLogoSliderValue('posX', 0);
            this.syncFrontLogoSliderValue('posY', 0);
            this.syncFrontLogoSliderValue('rotation', 90);
            CanvasManager.setFrontLogoZoom(1);
            CanvasManager.setFrontLogoPosition(0, 0);
            CanvasManager.setFrontLogoRotation(90);

            CanvasManager.render();
            this.showSuccessMessage('Front logo image loaded successfully!');
            HistoryManager.pushState('Uploaded front logo');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Handle custom frame image upload
     */
    async handleFrameImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading frame…', 'Please wait…');
        try {
            await CanvasManager.loadFrameImage(file);

            // Show controls container
            if (this.elements.frameControlsContainer) {
                this.elements.frameControlsContainer.style.display = 'block';
            }

            // Reset sliders to defaults
            if (this.elements.frameOpacity) {
                this.syncFrameSliderValue('opacity', 100);
            }
            if (this.elements.frameScale) {
                this.syncFrameSliderValue('scale', 100);
            }
            if (this.elements.framePosX) {
                this.syncFrameSliderValue('posX', 0);
            }
            if (this.elements.framePosY) {
                this.syncFrameSliderValue('posY', 0);
            }
            if (this.elements.frameRotation) {
                this.syncFrameSliderValue('rotation', 0);
            }

            CanvasManager.render();
            this.showSuccessMessage('Frame image loaded successfully!');
            HistoryManager.pushState('Uploaded frame');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear frame and hide controls
     */
    clearFrameImage() {
        CanvasManager.clearFrameImage();
        if (this.elements.frameControlsContainer) {
            this.elements.frameControlsContainer.style.display = 'none';
        }
        // Reset UI values
        if (this.elements.frameOpacityValue) this.elements.frameOpacityValue.textContent = '100%';
        if (this.elements.frameScaleValue) this.elements.frameScaleValue.textContent = '100%';
        if (this.elements.framePosXValue) this.elements.framePosXValue.textContent = '0px';
        if (this.elements.framePosYValue) this.elements.framePosYValue.textContent = '0px';
        if (this.elements.frameRotationValue) this.elements.frameRotationValue.textContent = '0°';
        HistoryManager.pushState('Cleared frame');
    },

    /**
     * Sync frame slider values (helper) - mirrors pattern used for other sync helpers
     */
    syncFrameSliderValue(type, value) {
        if (type === 'opacity') {
            if (this.elements.frameOpacity) this.elements.frameOpacity.value = value;
            if (this.elements.frameOpacityValue) this.elements.frameOpacityValue.textContent = `${value}%`;
        } else if (type === 'scale') {
            if (this.elements.frameScale) this.elements.frameScale.value = value;
            if (this.elements.frameScaleValue) this.elements.frameScaleValue.textContent = `${value}%`;
        } else if (type === 'posX') {
            if (this.elements.framePosX) this.elements.framePosX.value = value;
            if (this.elements.framePosXValue) this.elements.framePosXValue.textContent = `${value}px`;
        } else if (type === 'posY') {
            if (this.elements.framePosY) this.elements.framePosY.value = value;
            if (this.elements.framePosYValue) this.elements.framePosYValue.textContent = `${value}px`;
        } else if (type === 'rotation') {
            if (this.elements.frameRotation) this.elements.frameRotation.value = value;
            if (this.elements.frameRotationValue) this.elements.frameRotationValue.textContent = `${value}°`;
        }
    },

    /**
     * Clear front side logo image
     */
    clearFrontLogoImage() {
        CanvasManager.clearFrontLogoImage();
        if (this.elements.frontLogoUpload) {
            this.elements.frontLogoUpload.value = '';
        }
        if (this.elements.frontLogoUploadMobile) {
            this.elements.frontLogoUploadMobile.value = '';
        }
        this.elements.frontLogoControlsContainer.style.display = 'none';
        if (this.elements.frontLogoControlsContainerMobile) {
            this.elements.frontLogoControlsContainerMobile.style.display = 'none';
        }
        console.log('Front logo image cleared');
        HistoryManager.pushState('Cleared front logo');
    },

    /**
     * Handle template image upload (Phase 3)
     */
    async handleTemplateUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading template…', 'Please wait…');
        try {
            await CanvasManager.loadTemplateImage(file);
            // Show template controls
            if (this.elements.templateControlsContainer) {
                this.elements.templateControlsContainer.style.display = 'block';
            }
            // Hide upload area
            if (this.elements.templateUploadArea) {
                this.elements.templateUploadArea.style.display = 'none';
            }
            // Ensure toggle is checked
            if (this.elements.templateToggle) {
                this.elements.templateToggle.checked = true;
            }
            console.log('Template image loaded');
            HistoryManager.pushState('Uploaded template');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear template image (Phase 3)
     */
    clearTemplate() {
        CanvasManager.clearTemplateImage();
        if (this.elements.templateUpload) {
            this.elements.templateUpload.value = '';
        }
        // Hide controls, show upload area
        if (this.elements.templateControlsContainer) {
            this.elements.templateControlsContainer.style.display = 'none';
        }
        if (this.elements.templateUploadArea) {
            this.elements.templateUploadArea.style.display = 'block';
        }
        // Reset slider to default
        if (this.elements.templateOpacity) {
            this.elements.templateOpacity.value = 50;
        }
        if (this.elements.templateOpacityValue) {
            this.elements.templateOpacityValue.textContent = '50%';
        }
        console.log('Template image cleared');
        HistoryManager.pushState('Cleared template');
    },

    /**
     * Handle back side template image upload
     */
    async handleTemplateUploadBack(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading template…', 'Please wait…');
        try {
            await CanvasManager.loadTemplateImageBack(file);
            // Show template controls
            if (this.elements.templateControlsContainerBack) {
                this.elements.templateControlsContainerBack.style.display = 'block';
            }
            // Hide upload area
            if (this.elements.templateUploadAreaBack) {
                this.elements.templateUploadAreaBack.style.display = 'none';
            }
            // Ensure toggle is checked
            if (this.elements.templateToggleBack) {
                this.elements.templateToggleBack.checked = true;
            }
            console.log('Back side template image loaded');
            HistoryManager.pushState('Uploaded back template');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear back side template image
     */
    clearTemplateBack() {
        CanvasManager.clearTemplateImageBack();
        if (this.elements.templateUploadBack) {
            this.elements.templateUploadBack.value = '';
        }
        // Hide controls, show upload area
        if (this.elements.templateControlsContainerBack) {
            this.elements.templateControlsContainerBack.style.display = 'none';
        }
        if (this.elements.templateUploadAreaBack) {
            this.elements.templateUploadAreaBack.style.display = 'block';
        }
        // Reset slider to default
        if (this.elements.templateOpacityBack) {
            this.elements.templateOpacityBack.value = 50;
        }
        if (this.elements.templateOpacityValueBack) {
            this.elements.templateOpacityValueBack.textContent = '50%';
        }
        console.log('Back side template image cleared');
        HistoryManager.pushState('Cleared back template');
    },

    /**
     * Sync logo slider values between desktop and mobile
     */
    syncLogoSliderValue(sliderType, value, isMobile = false) {
        if (sliderType === 'zoom') {
            if (!isMobile && this.elements.logoZoomMobile) {
                this.elements.logoZoomMobile.value = value;
                this.elements.logoZoomValueMobile.textContent = `${value}%`;
            } else if (isMobile && this.elements.logoZoom) {
                this.elements.logoZoom.value = value;
                this.elements.logoZoomValue.textContent = `${value}%`;
            }
        } else if (sliderType === 'posX') {
            if (!isMobile && this.elements.logoPosXMobile) {
                this.elements.logoPosXMobile.value = value;
                this.elements.logoPosXValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.logoPosX) {
                this.elements.logoPosX.value = value;
                this.elements.logoPosXValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'posY') {
            if (!isMobile && this.elements.logoPosYMobile) {
                this.elements.logoPosYMobile.value = value;
                this.elements.logoPosYValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.logoPosY) {
                this.elements.logoPosY.value = value;
                this.elements.logoPosYValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'rotation') {
            if (!isMobile && this.elements.logoRotationMobile) {
                this.elements.logoRotationMobile.value = value;
                this.elements.logoRotationValueMobile.textContent = `${value}°`;
            } else if (isMobile && this.elements.logoRotation) {
                this.elements.logoRotation.value = value;
                this.elements.logoRotationValue.textContent = `${value}°`;
            }
        }
    },

    /**
     * Sync front logo slider values between desktop and mobile
     */
    syncFrontLogoSliderValue(sliderType, value, isMobile = false) {
        if (sliderType === 'zoom') {
            if (!isMobile && this.elements.frontLogoZoomMobile) {
                this.elements.frontLogoZoomMobile.value = value;
                this.elements.frontLogoZoomValueMobile.textContent = `${value}%`;
            } else if (isMobile && this.elements.frontLogoZoom) {
                this.elements.frontLogoZoom.value = value;
                this.elements.frontLogoZoomValue.textContent = `${value}%`;
            }
        } else if (sliderType === 'posX') {
            if (!isMobile && this.elements.frontLogoPosXMobile) {
                this.elements.frontLogoPosXMobile.value = value;
                this.elements.frontLogoPosXValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.frontLogoPosX) {
                this.elements.frontLogoPosX.value = value;
                this.elements.frontLogoPosXValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'posY') {
            if (!isMobile && this.elements.frontLogoPosYMobile) {
                this.elements.frontLogoPosYMobile.value = value;
                this.elements.frontLogoPosYValueMobile.textContent = `${value}px`;
            } else if (isMobile && this.elements.frontLogoPosY) {
                this.elements.frontLogoPosY.value = value;
                this.elements.frontLogoPosYValue.textContent = `${value}px`;
            }
        } else if (sliderType === 'rotation') {
            if (!isMobile && this.elements.frontLogoRotationMobile) {
                this.elements.frontLogoRotationMobile.value = value;
                this.elements.frontLogoRotationValueMobile.textContent = `${value}°`;
            } else if (isMobile && this.elements.frontLogoRotation) {
                this.elements.frontLogoRotation.value = value;
                this.elements.frontLogoRotationValue.textContent = `${value}°`;
            }
        }
    },

    /**
     * Open signature modal
     */
    openSignatureModal() {
        if (!this.elements.signatureModal) return;

        // Show zoom controls if signature is already uploaded
        if (CanvasManager.signatureImage) {
            this.elements.signatureZoomSection.style.display = 'block';
            // Set current values
            const currentZoom = Math.round(CanvasManager.signatureZoom * 100);
            const currentPosX = CanvasManager.signaturePosX;
            const currentPosY = CanvasManager.signaturePosY;

            this.elements.signatureZoomSlider.value = currentZoom;
            this.elements.signatureZoomValue.textContent = `${currentZoom}%`;
            this.elements.signaturePosXSlider.value = currentPosX;
            this.elements.signaturePosXValue.textContent = `${currentPosX}px`;
            this.elements.signaturePosYSlider.value = currentPosY;
            this.elements.signaturePosYValue.textContent = `${currentPosY}px`;
        } else {
            this.elements.signatureZoomSection.style.display = 'none';
        }

        // Show modal
        this.elements.signatureModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        // Re-initialize icons for modal content
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    /**
     * Close signature modal
     */
    closeSignatureModal() {
        if (!this.elements.signatureModal) return;

        this.elements.signatureModal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scroll
    },

    /**
     * Load fonts declared in fonts/manifest.json (offline / local release mode).
     * Silently no-ops when fetch fails (online hosted environment or file:// restrictions).
     */
    async loadLocalFontsFromManifest() {
        let entries;
        try {
            const resp = await fetch('fonts/manifest.json');
            if (!resp.ok) return;
            entries = await resp.json();
        } catch (e) {
            return;
        }
        if (!Array.isArray(entries) || entries.length === 0) return;

        const style = document.createElement('style');
        const rules = [];

        for (const entry of entries) {
            if (!entry.name || !entry.file) continue;
            const url = `fonts/${entry.file}`;
            rules.push(`@font-face { font-family: '${entry.name}'; src: url('${url}'); }`);
            this.customFonts.push({ name: entry.name, url });
        }

        if (rules.length === 0) return;
        style.textContent = rules.join('\n');
        document.head.appendChild(style);
        console.log(`[Fonts] Loaded ${rules.length} font(s) from manifest.json`);
    },

    /**
     * Extract font files from a user-supplied ZIP and register them via @font-face.
     * Font name is derived from the ZIP filename (strip extension).
     */
    async handleFontZipUpload(file) {
        if (!window.JSZip) {
            ToastManager.error('JSZip library not available.');
            return;
        }

        const zipBaseName = file.name.replace(/\.zip$/i, '').trim();

        let zip;
        try {
            zip = await JSZip.loadAsync(file);
        } catch (e) {
            ToastManager.error('Could not read ZIP file.');
            return;
        }

        const fontExtensions = /\.(ttf|otf|woff|woff2)$/i;
        const fontFiles = [];
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && fontExtensions.test(relativePath)) {
                fontFiles.push({ path: relativePath, entry: zipEntry });
            }
        });

        if (fontFiles.length === 0) {
            ToastManager.warning('No font files found in ZIP.');
            return;
        }

        const style = document.createElement('style');
        const rules = [];
        let addedCount = 0;

        const mimeTypes = {
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
        };
        const formatNames = {
            '.ttf': 'truetype',
            '.otf': 'opentype',
            '.woff': 'woff',
            '.woff2': 'woff2',
        };

        for (const { path, entry } of fontFiles) {
            const fileName = path.split('/').pop();
            const ext = fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
            const baseName = fileName.replace(fontExtensions, '').trim();
            const fontName = fontFiles.length === 1 ? zipBaseName : `${zipBaseName} ${baseName}`;

            if (this.customFonts.some(f => f.name === fontName)) continue;

            const rawBlob = await entry.async('blob');
            // Re-type the blob with the correct font MIME type so browsers
            // accept it in @font-face over HTTPS (avoids MIME mismatch rejection).
            const blob = new Blob([rawBlob], { type: mimeTypes[ext] ?? 'font/ttf' });
            const objectUrl = URL.createObjectURL(blob);
            const format = formatNames[ext] ?? 'truetype';

            rules.push(`@font-face { font-family: '${fontName}'; src: url('${objectUrl}') format('${format}'); }`);
            this.customFonts.push({ name: fontName, url: objectUrl });
            addedCount++;
        }

        if (addedCount === 0) {
            ToastManager.info('All fonts from this ZIP were already loaded.');
            return;
        }

        style.textContent = rules.join('\n');
        document.head.appendChild(style);

        this.renderFontList(this.elements.fontSearchInput?.value?.trim() ?? '');
        ToastManager.success(`${addedCount} font${addedCount > 1 ? 's' : ''} loaded from ZIP.`);
    },

    /**
     * Load a Google Font by injecting a stylesheet link
     */
    loadGoogleFont(fontName) {
        if (this.loadedFonts.has(fontName)) return;
        this.loadedFonts.add(fontName);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        const familyName = fontName.replace(/ /g, '+');
        link.href = `https://fonts.googleapis.com/css2?family=${familyName}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
        document.head.appendChild(link);
    },

    /**
     * Open the font picker modal
     */
    openFontPicker() {
        if (!this.elements.fontPickerModal) return;
        this.elements.fontPickerModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.elements.fontSearchInput.value = '';
        this.renderFontList('');
        this.elements.fontSearchInput.focus();
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Close the font picker modal
     */
    closeFontPicker() {
        if (!this.elements.fontPickerModal) return;
        this.elements.fontPickerModal.style.display = 'none';
        document.body.style.overflow = '';
        // Clean up observer
        if (this.fontObserver) {
            this.fontObserver.disconnect();
            this.fontObserver = null;
        }
    },

    /**
     * Render the font list with optional search filter.
     * Custom fonts (manifest / ZIP uploads) appear at the top,
     * followed by the standard Helvetica Neue + Google Fonts list.
     */
    renderFontList(filter) {
        const container = this.elements.fontList;
        if (!container) return;

        container.innerHTML = '';

        if (this.fontObserver) {
            this.fontObserver.disconnect();
        }

        const currentFont = CanvasManager.fontFamily;
        const lowerFilter = filter.toLowerCase();

        // --- Custom fonts section (manifest + ZIP uploads) ---
        const filteredCustom = this.customFonts.filter(f =>
            f.name.toLowerCase().includes(lowerFilter)
        );

        const standardFonts = ['Helvetica Neue', ...this.googleFonts];
        const filteredStandard = standardFonts.filter(f => f.toLowerCase().includes(lowerFilter));
        const hasCustom = filteredCustom.length > 0;
        const hasStandard = filteredStandard.length > 0;

        if (hasCustom) {
            const label = document.createElement('div');
            label.className = 'font-list-section-label';
            label.textContent = 'Custom Fonts';
            container.appendChild(label);

            filteredCustom.forEach(({ name }) => {
                const item = document.createElement('div');
                item.className = 'font-list-item';
                if (name === currentFont) item.classList.add('active');
                item.textContent = name;
                item.dataset.font = name;
                item.style.fontFamily = `'${name}', sans-serif`; // already loaded, apply immediately
                item.addEventListener('click', () => this._selectFont(name));
                container.appendChild(item);
            });
        }

        if (hasStandard) {
            if (hasCustom) {
                const label = document.createElement('div');
                label.className = 'font-list-section-label';
                label.textContent = 'Standard Fonts';
                container.appendChild(label);
            }

            // Create IntersectionObserver for lazy Google Font loading
            this.fontObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const item = entry.target;
                        const fontName = item.dataset.font;
                        if (fontName !== 'Helvetica Neue') {
                            this.loadGoogleFont(fontName);
                        }
                        item.style.fontFamily = `'${fontName}', sans-serif`;
                        this.fontObserver.unobserve(item);
                    }
                });
            }, { root: container, rootMargin: '50px' });

            filteredStandard.forEach(fontName => {
                const item = document.createElement('div');
                item.className = 'font-list-item';
                if (fontName === currentFont) item.classList.add('active');
                item.textContent = fontName;
                item.dataset.font = fontName;
                item.addEventListener('click', () => this._selectFont(fontName));
                container.appendChild(item);
                this.fontObserver.observe(item);
            });
        }
    },

    /**
     * Select a font: load if needed, update canvas + UI, close picker, push history.
     */
    _selectFont(fontName) {
        // Only load from Google for standard Google Fonts (not custom fonts)
        if (fontName !== 'Helvetica Neue' && !this.customFonts.some(f => f.name === fontName)) {
            this.loadGoogleFont(fontName);
        }
        CanvasManager.setFontFamily(fontName);

        if (this.elements.fontPickerPreview) {
            this.elements.fontPickerPreview.textContent = fontName;
            this.elements.fontPickerPreview.style.fontFamily = `'${fontName}', sans-serif`;
        }
        if (this.elements.fontPickerPreviewMobile) {
            this.elements.fontPickerPreviewMobile.textContent = fontName;
            this.elements.fontPickerPreviewMobile.style.fontFamily = `'${fontName}', sans-serif`;
        }
        const editorFontBtn = document.querySelector('#canvasTextEditor .font-picker-btn span');
        if (editorFontBtn) {
            editorFontBtn.textContent = fontName;
            editorFontBtn.style.fontFamily = `'${fontName}', sans-serif`;
        }
        this.updateFontWeightVisibility(fontName);
        this.closeFontPicker();
        HistoryManager.pushState(`Font: ${fontName}`);
    },

    updateFontWeightVisibility() {
        if (this.elements.fontWeightLabel) this.elements.fontWeightLabel.style.display = '';
        if (this.elements.fontWeightLabelBack) this.elements.fontWeightLabelBack.style.display = '';
        if (this.elements.fontWeightLabelMobile) this.elements.fontWeightLabelMobile.style.display = '';
        if (this.elements.fontWeightBorderLabel) this.elements.fontWeightBorderLabel.style.display = '';
        if (this.elements.fontWeightBorderLabelBack) this.elements.fontWeightBorderLabelBack.style.display = '';
        if (this.elements.fontWeightBorderLabelMobile) this.elements.fontWeightBorderLabelMobile.style.display = '';
        if (this.elements.resetFontWeightFront) this.elements.resetFontWeightFront.style.display = '';
        if (this.elements.resetFontWeightBack) this.elements.resetFontWeightBack.style.display = '';
        if (this.elements.resetFontWeightMobile) this.elements.resetFontWeightMobile.style.display = '';
        const isHelvetica = CanvasManager.fontFamily === 'Helvetica Neue';
        // Front body weight (middle text / 100A)
        if (CanvasManager.fontWeightFront === null) {
            if (!isHelvetica) {
                CanvasManager.setFontWeightFront(500);
                this._syncFontWeightFrontSliders(500);
            } else {
                this._syncFontWeightFrontSliders(550); // representative for Helvetica per-role (frontMiddle default)
            }
        } else {
            this._syncFontWeightFrontSliders(CanvasManager.fontWeightFront);
        }
        // Back main text weight (name/class/season)
        if (CanvasManager.fontWeightBack === null) {
            if (!isHelvetica) {
                CanvasManager.setFontWeightBack(500);
                this._syncFontWeightBackSliders(500);
            } else {
                this._syncFontWeightBackSliders(500); // representative for Helvetica per-role (backValue default)
            }
        } else {
            this._syncFontWeightBackSliders(CanvasManager.fontWeightBack);
        }
        // Border text weight (shared: front top/bottom + back rotated)
        if (CanvasManager.fontWeightBorder === null) {
            if (!isHelvetica) {
                CanvasManager.setFontWeightBorder(500);
                this._syncFontWeightBorderSliders(500);
            } else {
                this._syncFontWeightBorderSliders(600); // representative for Helvetica per-role (frontTop/backRotated default)
            }
        } else {
            this._syncFontWeightBorderSliders(CanvasManager.fontWeightBorder);
        }
    },

    _syncFontWeightFrontSliders(weight) {
        if (this.elements.fontWeightSlider) this.elements.fontWeightSlider.value = weight;
        if (this.elements.fontWeightValue) this.elements.fontWeightValue.textContent = weight;
    },

    _syncFontWeightBackSliders(weight) {
        if (this.elements.fontWeightSliderBack) this.elements.fontWeightSliderBack.value = weight;
        if (this.elements.fontWeightSliderMobile) this.elements.fontWeightSliderMobile.value = weight;
        if (this.elements.fontWeightValueBack) this.elements.fontWeightValueBack.textContent = weight;
        if (this.elements.fontWeightValueMobile) this.elements.fontWeightValueMobile.textContent = weight;
    },

    _syncFontWeightBorderSliders(weight) {
        if (this.elements.fontWeightBorderSlider) this.elements.fontWeightBorderSlider.value = weight;
        if (this.elements.fontWeightBorderSliderBack) this.elements.fontWeightBorderSliderBack.value = weight;
        if (this.elements.fontWeightBorderSliderMobile) this.elements.fontWeightBorderSliderMobile.value = weight;
        if (this.elements.fontWeightBorderValue) this.elements.fontWeightBorderValue.textContent = weight;
        if (this.elements.fontWeightBorderValueBack) this.elements.fontWeightBorderValueBack.textContent = weight;
        if (this.elements.fontWeightBorderValueMobile) this.elements.fontWeightBorderValueMobile.textContent = weight;
    },

    resetFontAndWeight() {
        const defaultFont = 'Helvetica Neue';
        CanvasManager.setFontFamily(defaultFont);
        CanvasManager.setFontWeightFront(null);
        CanvasManager.setFontWeightBack(null);
        CanvasManager.setFontWeightBorder(null);

        // Update sidebar font preview buttons
        if (this.elements.fontPickerPreview) {
            this.elements.fontPickerPreview.textContent = `${defaultFont} (Default)`;
            this.elements.fontPickerPreview.style.fontFamily = `'${defaultFont}', sans-serif`;
        }
        if (this.elements.fontPickerPreviewMobile) {
            this.elements.fontPickerPreviewMobile.textContent = `${defaultFont} (Default)`;
            this.elements.fontPickerPreviewMobile.style.fontFamily = `'${defaultFont}', sans-serif`;
        }

        // Update canvas-text-editor font button if open
        const editorFontBtn = document.querySelector('#canvasTextEditor .font-picker-btn span');
        if (editorFontBtn) {
            editorFontBtn.textContent = defaultFont;
            editorFontBtn.style.fontFamily = `'${defaultFont}', sans-serif`;
        }

        // Re-sync weight sliders to default values
        this.updateFontWeightVisibility();
        HistoryManager.pushState('Reset Font & Weight');
    },

    /**
     * Handle signature image upload
     */
    async handleSignatureImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showMediaLoadingOverlay('Uploading signature…', 'Please wait…');
        try {
            await CanvasManager.loadSignatureImage(file);

            // Show zoom controls in modal
            this.elements.signatureZoomSection.style.display = 'block';

            // Reset zoom and position to defaults
            this.syncSignatureSliderValue('zoom', 100);
            this.syncSignatureSliderValue('posX', 0);
            this.syncSignatureSliderValue('posY', 0);
            CanvasManager.setSignatureZoom(1);
            CanvasManager.setSignaturePosition(0, 0);

            // Show clear buttons
            this.elements.clearSignatureImage.style.display = 'block';
            if (this.elements.clearSignatureImageMobile) {
                this.elements.clearSignatureImageMobile.style.display = 'block';
            }

            // Show toolbar controls
            if (this.elements.signatureToolbarControls) {
                this.elements.signatureToolbarControls.style.display = 'block';
            }
            if (this.elements.signatureToolbarControlsMobile) {
                this.elements.signatureToolbarControlsMobile.style.display = 'block';
            }

            this.showSuccessMessage('Signature image loaded successfully!');
            HistoryManager.pushState('Uploaded signature');
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Clear signature image
     */
    clearSignatureImage() {
        CanvasManager.clearSignatureImage();
        this.elements.signatureImageUpload.value = '';
        this.elements.clearSignatureImage.style.display = 'none';
        if (this.elements.clearSignatureImageMobile) {
            this.elements.clearSignatureImageMobile.style.display = 'none';
        }

        // Hide zoom section and reset values
        if (this.elements.signatureZoomSection) {
            this.elements.signatureZoomSection.style.display = 'none';
        }

        // Reset all values to defaults
        this.syncSignatureSliderValue('zoom', 100);
        this.syncSignatureSliderValue('posX', 0);
        this.syncSignatureSliderValue('posY', 0);

        // Hide toolbar controls
        if (this.elements.signatureToolbarControls) {
            this.elements.signatureToolbarControls.style.display = 'none';
        }
        if (this.elements.signatureToolbarControlsMobile) {
            this.elements.signatureToolbarControlsMobile.style.display = 'none';
        }

        console.log('Signature image cleared');
        HistoryManager.pushState('Cleared signature');
    },

    /**
     * Clear signature image (Mobile - just calls the main clear function)
     */
    clearSignatureImageMobile() {
        this.clearSignatureImage();
    },

    /**
     * Handle drag over event
     */
    handleDragOver(event) {
        event.preventDefault();
        this.elements.uploadArea.classList.add('drag-over');
    },

    /**
     * Handle drag leave event
     */
    handleDragLeave(event) {
        event.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
    },

    /**
     * Handle file drop
     */
    async handleDrop(event) {
        event.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
        if (this.elements.canvasUploadPlaceholder) {
            this.elements.canvasUploadPlaceholder.classList.remove('drag-over');
        }

        const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        if (!files.length) return;

        // Multiple images → bulk create mode
        if (files.length > 1) {
            this.startBulkFromFiles(files);
            this.updateCanvasUploadPlaceholder();
            return;
        }

        // Single image → default single canvas
        const file = files[0];
        const isLargeMedia = file.type === 'image/gif' || file.type === 'video/mp4';
        const dropSub = isLargeMedia ? 'This may take a moment for large GIFs and videos.' : 'Please wait…';
        this.showMediaLoadingOverlay('Uploading image…', dropSub);
        try {
            await CanvasManager.loadImage(file);
            this.showCanvas();
            this.scrollToPreview();
            this.showSuccessMessage('Image loaded successfully!');
            this.updateCanvasUploadPlaceholder();
        } catch (error) {
            this.showErrorMessage(error.message);
        } finally {
            this.hideMediaLoadingOverlay();
        }
    },

    /**
     * Show canvas and hide placeholder
     */
    showCanvas() {
        this.elements.canvasWrapper.classList.add('active');
    },

    /**
     * Hide canvas and show placeholder
     */
    hideCanvas() {
        this.elements.canvasWrapper.classList.remove('active');
    },

    /**
     * Update mobile canvas upload placeholder visibility.
     * Shows when no image is loaded (single or bulk) on mobile.
     */
    updateCanvasUploadPlaceholder() {
        const el = this.elements.canvasUploadPlaceholder;
        if (!el) return;
        const isBulkOpen = BulkManager.isOpen || (BulkManager.rows && BulkManager.rows.length > 0);
        const hasImage = CanvasManager.hasImage() || isBulkOpen;
        el.classList.toggle('visible', !hasImage);
    },

    /**
     * Export image - Downloads only the currently active view (front or back)
     * Enhanced for mobile devices to save directly to gallery
     */
    async exportImage() {
        // Only require front image when exporting front side
        if (this.currentView === 'front' && !CanvasManager.hasImage()) {
            this.showErrorMessage('Please upload an image first');
            return;
        }

        // Temporarily hide template overlays during export (template is for lineup only)
        const templateWasVisible = CanvasManager.showTemplate;
        const templateBackWasVisible = CanvasManager.showTemplateBack;
        if (this.currentView === 'front' && templateWasVisible) {
            CanvasManager.showTemplate = false;
            CanvasManager.render();
        }
        if (this.currentView === 'back' && templateBackWasVisible) {
            CanvasManager.showTemplateBack = false;
            CanvasManager.updateBackSidePreview();
        }

        const isAnimated = this.currentView === 'front' && CanvasManager.isAnimated();
        const downloadTitle = isAnimated ? 'Exporting video…' : 'Downloading image…';
        const downloadSub = isAnimated ? 'This may take a moment.' : 'Please wait…';
        this.showMediaLoadingOverlay(downloadTitle, downloadSub, true);
        this.updateMediaLoadingProgress(10);

        try {
            // Set exporting flag so placeholder drawings are suppressed
            CanvasManager.isExporting = true;
            if (this.currentView === 'back') {
                CanvasManager.updateBackSidePreview();
            }

            // Determine which canvas to export based on current view
            const canvas = this.currentView === 'front'
                ? document.getElementById('mainCanvas')
                : document.getElementById('backCanvas');

            // Use 'photocard' when objekt border is off, 'objekt' when on
            const baseName = CanvasManager.showObjektBorder ? 'objekt' : 'photocard';

            // Check if we're on mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // If front side is animated, export as video
            if (isAnimated) {
                this.updateMediaLoadingProgress(20, '20%');
                const videoResult = await CanvasManager.exportAsVideo();
                this.updateMediaLoadingProgress(80, '80%');
                const filename = `${baseName}-front.${videoResult.extension}`;
                if (isMobile && navigator.canShare) {
                    const file = new File([videoResult.blob], filename, { type: videoResult.mimeType });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'Objekt Video' });
                    } else {
                        await this.exportBlobStandard(videoResult.blob, filename);
                    }
                } else {
                    await this.exportBlobStandard(videoResult.blob, filename);
                }
            } else {
                this.updateMediaLoadingProgress(40, '40%');
                const filename = `${baseName}-${this.currentView}.png`;
                if (isMobile && navigator.canShare) {
                    await this.exportImageShare(canvas, filename);
                } else {
                    await this.exportImageStandard(canvas, filename);
                }
            }

            this.updateMediaLoadingProgress(100, '100%');
            this.showSuccessMessage(`${this.currentView === 'front' ? 'Front' : 'Back'} side downloaded!`);
        } catch (error) {
            this.showErrorMessage('Failed to export image');
            console.error(error);
        } finally {
            this.hideMediaLoadingOverlay();
            // Clear exporting flag and restore canvas to preview state
            CanvasManager.isExporting = false;
            // Restore template visibility after export
            if (this.currentView === 'front' && templateWasVisible) {
                CanvasManager.showTemplate = true;
                CanvasManager.render();
            }
            if (this.currentView === 'back') {
                if (templateBackWasVisible) {
                    CanvasManager.showTemplateBack = true;
                }
                CanvasManager.updateBackSidePreview();
            }
        }
    },

    /**
     * Export image using Web Share API - Allows saving to gallery on mobile
     * @param {HTMLCanvasElement} canvas - The canvas to export
     * @param {string} filename - Filename with extension
     */
    async exportImageShare(canvas, filename) {
        return new Promise((resolve, reject) => {
            try {
                // Convert canvas to blob
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        reject(new Error('Failed to create image blob'));
                        return;
                    }

                    try {
                        // Create a File object from the blob
                        const file = new File([blob], filename, { type: 'image/png' });

                        // Check if the browser supports sharing files
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: 'Objekt Image',
                                text: 'Download your objekt image'
                            });
                            resolve(true);
                        } else {
                            // Fallback to standard download if file sharing not supported
                            await this.exportImageStandard(canvas, filename);
                            resolve(true);
                        }
                    } catch (shareError) {
                        // User cancelled share or error occurred - try standard download
                        if (shareError.name === 'AbortError') {
                            console.log('Share cancelled by user');
                            resolve(false);
                        } else {
                            console.warn('Share failed, falling back to download:', shareError);
                            await this.exportImageStandard(canvas, filename);
                            resolve(true);
                        }
                    }
                }, 'image/png', 0.95);
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Export image using standard download method
     * @param {HTMLCanvasElement} canvas - The canvas to export
     * @param {string} filename - Filename with extension
     */
    async exportImageStandard(canvas, filename) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Failed to create image blob'));
                        return;
                    }

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = filename;
                    link.href = url;
                    link.click();

                    // Clean up
                    URL.revokeObjectURL(url);
                    resolve(true);
                }, 'image/png', 0.95);
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Download a blob directly by URL
     * @param {Blob} blob
     * @param {string} filename
     */
    async exportBlobStandard(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Reset all settings and canvas
     */
    resetAll() {
        if (!confirm('Are you sure you want to reset everything?')) {
            return;
        }

        // Clear saved session state from localStorage
        HistoryManager.clearSessionState();

        // Refresh the page to reset everything
        location.reload();
    },

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        console.log('[SUCCESS]', message);
        ToastManager.success(message);
    },

    /**
     * Show error message
     */
    showErrorMessage(message) {
        console.error('[ERROR]', message);
        ToastManager.error(message);
    },

    showMediaLoadingOverlay(title = 'Loading file…', sub = 'Please wait…', showProgress = false) {
        const el = document.getElementById('mediaLoadingOverlay');
        if (!el) return;
        const titleEl = document.getElementById('mediaLoadingTitle');
        const subEl = document.getElementById('mediaLoadingSub');
        const progressEl = document.getElementById('mediaLoadingProgress');
        const fillEl = document.getElementById('mediaLoadingProgressFill');
        const textEl = document.getElementById('mediaLoadingProgressText');
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = sub;
        if (progressEl) progressEl.style.display = showProgress ? 'flex' : 'none';
        if (fillEl) fillEl.style.width = '0%';
        if (textEl) textEl.textContent = '0%';
        el.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    updateMediaLoadingProgress(percent, label = null) {
        const fillEl = document.getElementById('mediaLoadingProgressFill');
        const textEl = document.getElementById('mediaLoadingProgressText');
        if (fillEl) fillEl.style.width = `${percent}%`;
        if (textEl) textEl.textContent = label !== null ? label : `${percent}%`;
    },

    hideMediaLoadingOverlay() {
        const el = document.getElementById('mediaLoadingOverlay');
        if (el) el.style.display = 'none';
        document.body.style.overflow = '';
    },

    /**
     * Switch between front and back canvas views
     * @param {string} view - 'front' or 'back'
     */
    async switchCanvasView(view, direction = null) {
        // Track current view
        const previousView = this.currentView;
        this.currentView = view;

        // Update toggle button states
        this.elements.toggleBtns.forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Get current and target canvas wrappers
        const frontWrapper = this.elements.canvasWrapper;
        const backWrapper = this.elements.backCanvasWrapper;
        const currentWrapper = previousView === 'front' ? frontWrapper : backWrapper;
        const targetWrapper = view === 'front' ? frontWrapper : backWrapper;

        // Prepare back canvas operations before animation if switching to back
        const prepareBackCanvas = async () => {
            if (view === 'back') {
                CanvasManager.setBackSideEnabled(true);
                // Always regenerate QR code when switching to back view to ensure it displays
                await CanvasManager.generateQRCode();
                CanvasManager.updateBackSidePreview();
                this.syncBackColors();
            }
        };

        // Only animate if switching between different views
        if (previousView && previousView !== view) {
            // Hide mobile adjustments immediately and keep them hidden during animation
            if (this.elements.mobileAdjustments) {
                this.elements.mobileAdjustments.style.setProperty('display', 'none', 'important');
            }
            if (this.elements.mobileBackAdjustments) {
                this.elements.mobileBackAdjustments.style.setProperty('display', 'none', 'important');
            }
            
            // Prepare back canvas before animation starts
            await prepareBackCanvas();
            
            // Determine rotation direction
            let outClass = 'rotating-out';
            let inAnimation = 'rotateIn';
            
            if (direction === 'left') {
                outClass = 'rotating-out-left';
                inAnimation = 'rotateInFromRight';
            } else if (direction === 'right') {
                outClass = 'rotating-out-right';
                inAnimation = 'rotateIn';
            }
            
            // Start rotation out animation for current wrapper
            currentWrapper.classList.add(outClass);
            
            // After rotation out completes, switch to new wrapper
            setTimeout(() => {
                // Hide current wrapper completely
                currentWrapper.classList.remove('active', 'rotating-out', 'rotating-out-left', 'rotating-out-right');
                currentWrapper.style.display = 'none';

                // Show target wrapper and immediately start in animation
                targetWrapper.style.display = 'flex';
                targetWrapper.classList.add('active');
                // Force a reflow to ensure the element is rendered before animation
                targetWrapper.offsetHeight;
                targetWrapper.style.animation = `${inAnimation} 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;

                // Clean up animation after completion but keep opacity and transform
                setTimeout(() => {
                    targetWrapper.style.animation = '';
                    // Ensure final state is preserved
                    targetWrapper.style.opacity = '1';
                    targetWrapper.style.transform = 'none';
                }, 400);
            }, 250); // Match the rotateOut animation duration
            
            // Show mobile adjustments after complete animation (700ms total)
            setTimeout(() => {
                this.updateControlsVisibility(view);
            }, 700);
        } else {
            // First time or same view - just show without animation
            await prepareBackCanvas();

            if (view === 'front') {
                frontWrapper.classList.add('active');
                frontWrapper.style.display = 'flex';
                frontWrapper.style.opacity = '1';
                frontWrapper.style.transform = 'none';
                backWrapper.classList.remove('active');
                backWrapper.style.display = 'none';
            } else {
                backWrapper.classList.add('active');
                backWrapper.style.display = 'flex';
                backWrapper.style.opacity = '1';
                backWrapper.style.transform = 'none';
                frontWrapper.classList.remove('active');
                frontWrapper.style.display = 'none';
            }
        }

        // Update mobile navigation
        this.updateMobileNavigation(view);

        // Only update controls immediately if no animation is running
        if (!previousView || previousView === view) {
            this.updateControlsVisibility(view);
        }
    },

    /**
     * Update controls visibility based on current view
     * @param {string} view - 'front' or 'back'
     */
    updateControlsVisibility(view) {
        if (view === 'front') {
            // Show upload section on front view
            if (this.elements.uploadSection) {
                this.elements.uploadSection.style.display = 'block';
            }

            // Show front side controls, hide back side controls
            if (this.elements.frontSideSection) {
                this.elements.frontSideSection.style.display = 'block';
            }
            if (this.elements.backSideSection) {
                this.elements.backSideSection.style.display = 'none';
            }
            if (this.elements.backSideSectionMobile) {
                this.elements.backSideSectionMobile.style.display = 'none';
            }
            // Show mobile adjustments on front view (only on mobile)
            if (this.elements.mobileAdjustments) {
                this.elements.mobileAdjustments.style.removeProperty('display');
            }
            // Hide mobile back adjustments on front view
            if (this.elements.mobileBackAdjustments) {
                this.elements.mobileBackAdjustments.style.setProperty('display', 'none', 'important');
            }
            // Show mobile pan sliders on front view (if image is loaded)
            if (this.elements.mobilePanYContainer) {
                this.elements.mobilePanYContainer.classList.remove('hidden');
            }
            if (this.elements.mobilePanXContainer) {
                this.elements.mobilePanXContainer.classList.remove('hidden');
            }
        } else {
            // Hide upload section on back view
            if (this.elements.uploadSection) {
                this.elements.uploadSection.style.display = 'none';
            }

            // Hide front side controls, show back side controls
            if (this.elements.frontSideSection) {
                this.elements.frontSideSection.style.display = 'none';
            }
            if (this.elements.backSideSection) {
                this.elements.backSideSection.style.display = 'block';
            }
            if (this.elements.backSideSectionMobile) {
                this.elements.backSideSectionMobile.style.display = 'block';
            }
            // Hide mobile front adjustments on back view
            if (this.elements.mobileAdjustments) {
                this.elements.mobileAdjustments.style.setProperty('display', 'none', 'important');
            }
            // Show mobile back adjustments on back view (only on mobile)
            if (this.elements.mobileBackAdjustments) {
                this.elements.mobileBackAdjustments.style.removeProperty('display');
            }
            // Hide mobile pan sliders on back view
            if (this.elements.mobilePanYContainer) {
                this.elements.mobilePanYContainer.classList.add('hidden');
            }
            if (this.elements.mobilePanXContainer) {
                this.elements.mobilePanXContainer.classList.add('hidden');
            }
        }
    },

    /**
     * Update toggle navigation visibility based on back side enabled state
     * Note: Toggle is now always visible, but we keep this for back side generation logic
     * @param {boolean} enabled - Whether back side is enabled
     */
    updateToggleVisibility(enabled) {
        // Toggle is always visible now, just ensure back canvas is generated
        if (!enabled) {
            // Reset to front view when disabling back side generation
            this.switchCanvasView('front');
        }
    },

    /**
     * Initialize canvas text editor for inline text editing
     * Allows clicking text on canvas previews to edit them directly
     */
    initCanvasTextEditor() {
        // Get both canvas wrappers
        const frontWrapper = document.getElementById('canvasWrapper');
        const backWrapper = document.getElementById('backCanvasWrapper');

        if (!frontWrapper || !backWrapper) return;

        // Add click/touch listener to front canvas
        const frontCanvas = document.getElementById('mainCanvas');
        if (frontCanvas) {
            frontCanvas.addEventListener('click', (e) => this.handleCanvasClick(e, 'front'));
            frontCanvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleCanvasClick(e, 'front');
            });
            frontCanvas.style.cursor = 'pointer';
        }

        // Add click/touch listener to back canvas
        const backCanvas = document.getElementById('backCanvas');
        if (backCanvas) {
            backCanvas.addEventListener('click', (e) => this.handleCanvasClick(e, 'back'));
            backCanvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleCanvasClick(e, 'back');
            });
            backCanvas.style.cursor = 'pointer';
        }
    },

    /**
     * Handle click on canvas to detect text area clicks
     * @param {MouseEvent|TouchEvent} event - Click or touch event
     * @param {string} side - 'front' or 'back'
     */
    handleCanvasClick(event, side) {
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();

        // Get clientX and clientY from touch or mouse event
        let clientX, clientY;
        if (event.type === 'touchend' && event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        // Calculate click position relative to canvas (accounting for canvas scaling)
        const scaleX = CanvasManager.canvasWidth / rect.width;
        const scaleY = CanvasManager.canvasHeight / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        let clickedTextType = null;

        if (side === 'front') {
            clickedTextType = CanvasManager.getClickedText(x, y);
            if (clickedTextType) {
                this.showTextEditor(canvas, rect, clickedTextType, side);
            }
        } else if (side === 'back') {
            clickedTextType = CanvasManager.getClickedBackText(x, y);
            if (clickedTextType) {
                // If signature area is clicked, open signature modal instead of text editor
                if (clickedTextType === 'signature') {
                    this.openSignatureModal();
                } else if (clickedTextType === 'qrcode') {
                    this.showQRCodeEditor();
                } else if (clickedTextType === 'toplogo') {
                    this.openTopLogoModal();
                } else {
                    this.showTextEditor(canvas, rect, clickedTextType, side);
                }
            }
        }
    },

    /**
     * Show QR code editor modal
     */
    showQRCodeEditor() {
        // Remove any existing editor
        this.removeTextEditor();

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'canvas-text-editor-backdrop';
        backdrop.id = 'qrCodeEditorBackdrop';

        // Create editor container
        const editor = document.createElement('div');
        editor.className = 'canvas-text-editor';
        editor.id = 'qrCodeEditor';
        editor.style.position = 'fixed';
        editor.style.top = '50%';
        editor.style.left = '50%';
        editor.style.transform = 'translate(-50%, -50%)';
        editor.style.zIndex = '1000';

        // Create title
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.style.marginBottom = 'var(--space-sm)';
        title.textContent = 'Edit QR Code Link';

        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.value = CanvasManager.qrCodeLink || '';
        input.placeholder = 'https://sharkbeans.github.io/objekt-maker/';
        input.style.width = '100%';
        input.style.marginBottom = 'var(--space-sm)';

        // Create hint text
        const hint = document.createElement('div');
        hint.className = 'upload-hint';
        hint.textContent = 'Enter a URL to generate a QR code';
        hint.style.textAlign = 'center';
        hint.style.marginTop = 'var(--space-xs)';

        // Append elements
        editor.appendChild(title);
        editor.appendChild(input);
        editor.appendChild(hint);

        // Add to document
        document.body.appendChild(backdrop);
        document.body.appendChild(editor);

        // Focus input and select all
        input.focus();
        input.select();

        // Handle input changes
        const updateQRCode = async () => {
            await CanvasManager.setQRCodeLink(input.value);
            // Update toolbar inputs
            const toolbarInput = document.getElementById('qrCodeLink');
            const toolbarInputMobile = document.getElementById('qrCodeLinkMobile');
            if (toolbarInput) toolbarInput.value = input.value;
            if (toolbarInputMobile) toolbarInputMobile.value = input.value;
        };

        // Handle enter key
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await updateQRCode();
                this.removeQRCodeEditor();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.removeQRCodeEditor();
            }
        });

        // Handle backdrop click (close editor)
        backdrop.addEventListener('click', async () => {
            await updateQRCode();
            this.removeQRCodeEditor();
        });
    },

    /**
     * Remove QR code editor
     */
    removeQRCodeEditor() {
        const editor = document.getElementById('qrCodeEditor');
        const backdrop = document.getElementById('qrCodeEditorBackdrop');
        if (editor) editor.remove();
        if (backdrop) backdrop.remove();
    },

    /**
     * Open top logo modal
     */
    openTopLogoModal() {
        // Remove any existing modal
        this.removeTopLogoModal();

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'canvas-text-editor-backdrop';
        backdrop.id = 'topLogoModalBackdrop';
        backdrop.style.backdropFilter = 'blur(4px)';
        backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'canvas-text-editor';
        modal.id = 'topLogoModal';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.zIndex = '1000';
        modal.style.maxWidth = '400px';
        modal.style.width = '90%';

        // Create title
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.style.marginBottom = 'var(--space-md)';
        title.style.display = 'flex';
        title.style.alignItems = 'center';
        title.style.gap = '8px';
        title.innerHTML = '<i data-lucide="image" style="width: 18px; height: 18px;"></i> Top Logo';

        // Create upload section
        const uploadSection = document.createElement('div');
        uploadSection.style.marginBottom = 'var(--space-md)';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/jpg';
        fileInput.style.display = 'none';
        fileInput.id = 'topLogoModalUpload';

        const uploadButton = document.createElement('button');
        uploadButton.type = 'button';
        uploadButton.className = 'btn btn-secondary';
        uploadButton.style.width = '100%';
        uploadButton.style.marginBottom = 'var(--space-sm)';
        uploadButton.innerHTML = '<i data-lucide="upload" style="width: 16px; height: 16px;"></i> Upload Logo';
        uploadButton.addEventListener('click', () => fileInput.click());

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn btn-secondary';
        clearButton.style.width = '100%';
        clearButton.style.display = CanvasManager.topLogoImage ? 'block' : 'none';
        clearButton.innerHTML = '<i data-lucide="x" style="width: 16px; height: 16px;"></i> Clear Logo';
        clearButton.addEventListener('click', () => {
            CanvasManager.clearTopLogoImage();
            controlsContainer.style.display = 'none';
            clearButton.style.display = 'none';
        });

        // Handle file upload
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await CanvasManager.loadTopLogoImage(file);
                    controlsContainer.style.display = 'block';
                    clearButton.style.display = 'block';
                    // Reset controls to default values
                    zoomSlider.value = 150;
                    zoomValue.textContent = '150%';
                    posXSlider.value = 0;
                    posXValue.textContent = '0px';
                    posYSlider.value = 0;
                    posYValue.textContent = '0px';
                    rotationSlider.value = 0;
                    rotationValue.textContent = '0°';
                } catch (error) {
                    ToastManager.error(error.message);
                }
            }
        });

        uploadSection.appendChild(fileInput);
        uploadSection.appendChild(uploadButton);
        uploadSection.appendChild(clearButton);

        // Create controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = CanvasManager.topLogoImage ? 'block' : 'none';

        // Helper function to create slider
        const createSlider = (label, min, max, value, unit, onChange) => {
            const container = document.createElement('div');
            container.style.marginBottom = 'var(--space-sm)';

            const labelEl = document.createElement('label');
            labelEl.style.display = 'block';
            labelEl.style.marginBottom = '4px';
            labelEl.style.fontWeight = '500';
            labelEl.textContent = label;

            const sliderWrapper = document.createElement('div');
            sliderWrapper.style.display = 'flex';
            sliderWrapper.style.alignItems = 'center';
            sliderWrapper.style.gap = 'var(--space-sm)';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.value = value;
            slider.style.flex = '1';

            const valueDisplay = document.createElement('span');
            valueDisplay.style.minWidth = '50px';
            valueDisplay.style.textAlign = 'right';
            valueDisplay.style.fontSize = '0.875rem';
            valueDisplay.textContent = value + unit;

            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                valueDisplay.textContent = val + unit;
                onChange(val);
            });

            // Setup slider transparency (will be called after slider is added to DOM)
            slider._setupTransparency = () => {
                const modalElement = document.getElementById('topLogoModal');
                const backdrop = document.getElementById('topLogoModalBackdrop');
                this.setupSliderTransparency(slider, {
                    modal: modalElement,
                    backdrop: backdrop,
                    sliderContainer: container
                });
            };

            sliderWrapper.appendChild(slider);
            sliderWrapper.appendChild(valueDisplay);
            container.appendChild(labelEl);
            container.appendChild(sliderWrapper);

            return { container, slider, valueDisplay };
        };

        // Create zoom slider
        const { container: zoomContainer, slider: zoomSlider, valueDisplay: zoomValue } = createSlider(
            'Zoom', 20, 300, Math.round(CanvasManager.topLogoZoom * 100), '%',
            (value) => {
                CanvasManager.setTopLogoZoom(value / 100);
                this.syncTopLogoSliderValue('zoom', value);
            }
        );
        controlsContainer.appendChild(zoomContainer);

        // Create position X slider
        const { container: posXContainer, slider: posXSlider, valueDisplay: posXValue } = createSlider(
            'Position X', -100, 100, CanvasManager.topLogoPosX, 'px',
            (value) => {
                CanvasManager.setTopLogoPosition(value, CanvasManager.topLogoPosY);
                this.syncTopLogoSliderValue('posX', value);
            }
        );
        controlsContainer.appendChild(posXContainer);

        // Create position Y slider
        const { container: posYContainer, slider: posYSlider, valueDisplay: posYValue } = createSlider(
            'Position Y', -100, 100, CanvasManager.topLogoPosY, 'px',
            (value) => {
                CanvasManager.setTopLogoPosition(CanvasManager.topLogoPosX, value);
                this.syncTopLogoSliderValue('posY', value);
            }
        );
        controlsContainer.appendChild(posYContainer);

        // Create rotation slider
        const { container: rotationContainer, slider: rotationSlider, valueDisplay: rotationValue } = createSlider(
            'Rotation', 0, 360, CanvasManager.topLogoRotation, '°',
            (value) => {
                CanvasManager.setTopLogoRotation(value);
                this.syncTopLogoSliderValue('rotation', value);
            }
        );
        controlsContainer.appendChild(rotationContainer);

        // Create done button
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'btn btn-primary';
        doneButton.style.width = '100%';
        doneButton.style.marginTop = 'var(--space-md)';
        doneButton.textContent = 'Done';
        doneButton.addEventListener('click', () => this.removeTopLogoModal());

        // Assemble modal
        modal.appendChild(title);
        modal.appendChild(uploadSection);
        modal.appendChild(controlsContainer);
        modal.appendChild(doneButton);

        // Add to document
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        // Handle backdrop click
        backdrop.addEventListener('click', () => this.removeTopLogoModal());

        // Prevent modal content clicks from closing modal
        modal.addEventListener('click', (e) => e.stopPropagation());

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        // Setup slider transparency for all sliders (must be done after adding to DOM)
        zoomSlider._setupTransparency();
        posXSlider._setupTransparency();
        posYSlider._setupTransparency();
        rotationSlider._setupTransparency();

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    },

    /**
     * Remove top logo modal
     */
    removeTopLogoModal() {
        const modal = document.getElementById('topLogoModal');
        const backdrop = document.getElementById('topLogoModalBackdrop');
        if (modal) modal.remove();
        if (backdrop) backdrop.remove();
        document.body.style.overflow = '';
    },

    /**
     * Show inline text editor at clicked position
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {DOMRect} canvasRect - Canvas bounding rect
     * @param {string} textType - Type of text clicked
     * @param {string} side - 'front' or 'back'
     */
    showTextEditor(canvas, canvasRect, textType, side) {
        // Remove any existing editor
        this.removeTextEditor();

        // Flag to track if a slider is being actively dragged
        this._isSliderDragging = false;

        // Create editor container
        const editor = document.createElement('div');
        editor.className = 'canvas-text-editor-overlay';
        editor.id = 'canvasTextEditor';

        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'canvas-text-editor-input';

        // Get current value and height info based on side and text type
        let currentValue = '';
        let inputElement = null;
        let hasHeightSlider = false;
        let currentHeight = 0;
        let heightSliderElement = null;

        if (side === 'front') {
            switch (textType) {
                case 'top':
                    currentValue = CanvasManager.topText;
                    inputElement = this.elements.topText;
                    hasHeightSlider = true;
                    currentHeight = CanvasManager.topTextHeight;
                    heightSliderElement = this.elements.topTextHeight;
                    break;
                case 'middle':
                    currentValue = CanvasManager.middleText;
                    inputElement = this.elements.middleText;
                    hasHeightSlider = true;
                    currentHeight = CanvasManager.middleTextHeight;
                    heightSliderElement = this.elements.middleTextHeight;
                    break;
                case 'bottom':
                    currentValue = CanvasManager.bottomText;
                    inputElement = this.elements.bottomText;
                    hasHeightSlider = true;
                    currentHeight = CanvasManager.bottomTextHeight;
                    heightSliderElement = this.elements.bottomTextHeight;
                    break;
            }
        } else if (side === 'back') {
            switch (textType) {
                case 'nameLabel':
                    currentValue = CanvasManager.backNameLabel;
                    inputElement = this.elements.backNameLabel;
                    break;
                case 'nameValue':
                    currentValue = CanvasManager.backNameValue;
                    inputElement = this.elements.backNameValue;
                    break;
                case 'classLabel':
                    currentValue = CanvasManager.backClassLabel;
                    inputElement = this.elements.backClassLabel;
                    break;
                case 'classValue':
                    currentValue = CanvasManager.backClassValue;
                    inputElement = this.elements.backClassValue;
                    break;
                case 'seasonLabel':
                    currentValue = CanvasManager.backSeasonLabel;
                    inputElement = this.elements.backSeasonLabel;
                    break;
                case 'seasonValue':
                    currentValue = CanvasManager.backSeasonValue;
                    inputElement = this.elements.backSeasonValue;
                    break;
                case 'topRotated':
                    currentValue = CanvasManager.backNameValue;
                    inputElement = this.elements.backNameValue;
                    hasHeightSlider = true;
                    currentHeight = CanvasManager.backTopTextHeight;
                    heightSliderElement = this.elements.backTopTextHeight;
                    break;
                case 'bottomRotated':
                    currentValue = CanvasManager.backGroupName;
                    inputElement = this.elements.backGroupName;
                    hasHeightSlider = true;
                    currentHeight = CanvasManager.backBottomTextHeight;
                    heightSliderElement = this.elements.backBottomTextHeight;
                    break;
            }
        }

        input.value = currentValue;
        input.placeholder = 'Enter text...';

        // Create editor content container
        const editorContent = document.createElement('div');
        editorContent.className = 'canvas-text-editor';

        // Add text input
        editorContent.appendChild(input);

        // Add height slider if applicable
        let heightSlider = null;
        let heightValueDisplay = null;
        if (hasHeightSlider) {
            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'canvas-editor-slider-container';

            const sliderLabel = document.createElement('label');
            sliderLabel.className = 'canvas-editor-slider-label';
            sliderLabel.textContent = 'Text Height';

            const sliderWrapper = document.createElement('div');
            sliderWrapper.className = 'canvas-editor-slider-wrapper';

            heightSlider = document.createElement('input');
            heightSlider.type = 'range';
            heightSlider.className = 'canvas-editor-slider';
            heightSlider.min = '-200';
            heightSlider.max = '200';
            heightSlider.value = currentHeight;

            heightValueDisplay = document.createElement('span');
            heightValueDisplay.className = 'canvas-editor-slider-value';
            heightValueDisplay.textContent = `${currentHeight}px`;

            sliderWrapper.appendChild(heightSlider);
            sliderWrapper.appendChild(heightValueDisplay);

            sliderContainer.appendChild(sliderLabel);
            sliderContainer.appendChild(sliderWrapper);
            editorContent.appendChild(sliderContainer);

            // Track slider dragging state (only for mouse/desktop, not touch/mobile)
            heightSlider.addEventListener('mousedown', (e) => {
                this._isSliderDragging = true;
                e.stopPropagation();
            });
            heightSlider.addEventListener('mouseup', (e) => {
                this._isSliderDragging = false;
                e.stopPropagation();
            });
            heightSlider.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Setup slider transparency (deferred until editor is added to DOM)
            heightSlider._setupTransparency = () => {
                this.setupSliderTransparency(heightSlider, {
                    modal: editorContent,
                    backdrop: document.getElementById('canvasTextEditorBackdrop'),
                    sliderContainer: sliderContainer
                });
            };

            // Handle slider input
            heightSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                heightValueDisplay.textContent = `${value}px`;

                // Update canvas in real-time
                if (side === 'front') {
                    CanvasManager.setTextHeight(textType, value);
                    // Sync to sliders
                    if (heightSliderElement) heightSliderElement.value = value;
                    if (textType === 'top' && this.elements.topTextHeightValue) {
                        this.elements.topTextHeightValue.textContent = `${value}px`;
                    } else if (textType === 'middle' && this.elements.middleTextHeightValue) {
                        this.elements.middleTextHeightValue.textContent = `${value}px`;
                    } else if (textType === 'bottom' && this.elements.bottomTextHeightValue) {
                        this.elements.bottomTextHeightValue.textContent = `${value}px`;
                    }
                    // Sync to mobile
                    if (textType === 'top' && this.elements.topTextHeightMobile) {
                        this.elements.topTextHeightMobile.value = value;
                        this.elements.topTextHeightValueMobile.textContent = `${value}px`;
                    } else if (textType === 'middle' && this.elements.middleTextHeightMobile) {
                        this.elements.middleTextHeightMobile.value = value;
                        this.elements.middleTextHeightValueMobile.textContent = `${value}px`;
                    } else if (textType === 'bottom' && this.elements.bottomTextHeightMobile) {
                        this.elements.bottomTextHeightMobile.value = value;
                        this.elements.bottomTextHeightValueMobile.textContent = `${value}px`;
                    }
                } else if (side === 'back') {
                    const position = textType === 'topRotated' ? 'top' : 'bottom';
                    CanvasManager.setBackTextHeight(position, value);
                    // Sync to sliders
                    if (heightSliderElement) heightSliderElement.value = value;
                    if (textType === 'topRotated' && this.elements.backTopTextHeightValue) {
                        this.elements.backTopTextHeightValue.textContent = `${value}px`;
                    } else if (textType === 'bottomRotated' && this.elements.backBottomTextHeightValue) {
                        this.elements.backBottomTextHeightValue.textContent = `${value}px`;
                    }
                    // Sync to mobile
                    if (textType === 'topRotated') {
                        if (this.elements.backTopTextHeightMobile) {
                            this.elements.backTopTextHeightMobile.value = value;
                            this.elements.backTopTextHeightValueMobile.textContent = `${value}px`;
                        }
                        if (this.elements.backTopTextHeightMobileQuick) {
                            this.elements.backTopTextHeightMobileQuick.value = value;
                            this.elements.backTopTextHeightValueMobileQuick.textContent = `${value}px`;
                        }
                    } else if (textType === 'bottomRotated') {
                        if (this.elements.backBottomTextHeightMobile) {
                            this.elements.backBottomTextHeightMobile.value = value;
                            this.elements.backBottomTextHeightValueMobile.textContent = `${value}px`;
                        }
                        if (this.elements.backBottomTextHeightMobileQuick) {
                            this.elements.backBottomTextHeightMobileQuick.value = value;
                            this.elements.backBottomTextHeightValueMobileQuick.textContent = `${value}px`;
                        }
                    }
                }
            });
        }

        // Add text color picker for front and back side text
        const isFrontText = side === 'front' && (textType === 'top' || textType === 'middle' || textType === 'bottom');
        const isBackText = side === 'back' && (textType === 'nameLabel' || textType === 'nameValue' || textType === 'classLabel' || textType === 'classValue' || textType === 'seasonLabel' || textType === 'seasonValue' || textType === 'topRotated' || textType === 'bottomRotated');
        if (isFrontText || isBackText) {
            const colorContainer = document.createElement('div');
            colorContainer.className = 'canvas-editor-color-container';
            colorContainer.style.cssText = 'margin-top: 16px;';

            const colorLabel = document.createElement('label');
            colorLabel.className = 'canvas-editor-slider-label';
            colorLabel.textContent = 'Text Color';
            colorLabel.style.cssText = 'display: block; margin-bottom: 8px;';

            const colorInputWrapper = document.createElement('div');
            colorInputWrapper.className = 'canvas-editor-color-wrapper';
            colorInputWrapper.style.cssText = 'display: flex; gap: 12px; align-items: center;';

            // Color picker input
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.className = 'canvas-editor-color-picker';
            colorPicker.value = CanvasManager.textColor || '#000000';
            colorPicker.style.cssText = 'width: 50px; height: 40px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: transparent;';

            // Hex input
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.className = 'canvas-editor-hex-input';
            hexInput.value = CanvasManager.textColor || '#000000';
            hexInput.placeholder = '#000000';
            hexInput.maxLength = 7;
            hexInput.style.cssText = 'flex: 1; padding: 10px; font-size: 0.9rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace;';

            // Sync text color to all UI controls
            const syncTextColorUI = (color) => {
                if (this.elements.textColorPicker) this.elements.textColorPicker.value = color;
                if (this.elements.textColorHex) this.elements.textColorHex.value = color;
                if (this.elements.textColorPickerBack) this.elements.textColorPickerBack.value = color;
                if (this.elements.textColorHexBack) this.elements.textColorHexBack.value = color;
                if (this.elements.textColorPickerBackMobile) this.elements.textColorPickerBackMobile.value = color;
                if (this.elements.textColorHexBackMobile) this.elements.textColorHexBackMobile.value = color;
            };

            // Handle color picker input
            colorPicker.addEventListener('input', (e) => {
                const color = e.target.value.toUpperCase();
                hexInput.value = color;
                CanvasManager.setTextColor(color);
                syncTextColorUI(color);
            });

            // Handle hex input
            hexInput.addEventListener('input', (e) => {
                let color = e.target.value.trim();

                // Validate hex color format
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    color = color.toUpperCase();
                    colorPicker.value = color;
                    CanvasManager.setTextColor(color);
                    syncTextColorUI(color);
                }
            });

            // Prevent event bubbling
            colorPicker.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            hexInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // On mobile/touch, just stop propagation so the color picker opens normally
            colorPicker.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            });

            // Similar events for hex input
            hexInput.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            });

            colorInputWrapper.appendChild(colorPicker);
            colorInputWrapper.appendChild(hexInput);

            colorContainer.appendChild(colorLabel);
            colorContainer.appendChild(colorInputWrapper);
            editorContent.appendChild(colorContainer);
        }

        // Add font picker for front and back side text
        let weightSlider = null;
        if (isFrontText || isBackText) {
            const fontContainer = document.createElement('div');
            fontContainer.className = 'canvas-editor-font-container';
            fontContainer.style.cssText = 'margin-top: 16px;';

            const fontLabel = document.createElement('label');
            fontLabel.className = 'canvas-editor-slider-label';
            fontLabel.textContent = 'Font';
            fontLabel.style.cssText = 'display: block; margin-bottom: 8px;';

            const fontBtn = document.createElement('button');
            fontBtn.type = 'button';
            fontBtn.className = 'font-picker-btn';
            fontBtn.innerHTML = `<span style="font-family: '${CanvasManager.fontFamily}', sans-serif;">${CanvasManager.fontFamily}</span><i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>`;

            fontBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFontPicker();
            });

            fontBtn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            });

            fontContainer.appendChild(fontLabel);
            fontContainer.appendChild(fontBtn);
            editorContent.appendChild(fontContainer);

            // Font weight slider
            const weightContainer = document.createElement('div');
            weightContainer.style.cssText = 'margin-top: 16px;';

            const weightLabel = document.createElement('label');
            weightLabel.className = 'canvas-editor-slider-label';
            weightLabel.textContent = 'Font Weight';
            weightLabel.style.cssText = 'display: block; margin-bottom: 8px;';

            const weightWrapper = document.createElement('div');
            weightWrapper.className = 'canvas-editor-slider-wrapper';

            weightSlider = document.createElement('input');
            weightSlider.type = 'range';
            weightSlider.className = 'canvas-editor-slider';
            weightSlider.min = '100';
            weightSlider.max = '900';
            weightSlider.step = '50';
            // Determine which weight property to use based on text type
            const isBorderText = (side === 'front' && (textType === 'top' || textType === 'bottom')) ||
                                  (side === 'back' && (textType === 'topRotated' || textType === 'bottomRotated'));
            const isBackMainText = side === 'back' && !isBorderText;
            weightLabel.textContent = isBorderText ? 'Border Weight' : (isBackMainText ? 'Main Text Weight' : 'Body Weight');
            let popupWeightCurrent;
            let popupDefaultWeight;
            if (isBorderText) {
                popupWeightCurrent = CanvasManager.fontWeightBorder;
                popupDefaultWeight = 600;
            } else if (isBackMainText) {
                popupWeightCurrent = CanvasManager.fontWeightBack;
                popupDefaultWeight = 500;
            } else {
                // front middle text
                popupWeightCurrent = CanvasManager.fontWeightFront;
                popupDefaultWeight = 550;
            }
            const popupWeight = popupWeightCurrent ?? (CanvasManager.fontFamily === 'Helvetica Neue' ? popupDefaultWeight : 500);
            weightSlider.value = popupWeight;

            const weightValueDisplay = document.createElement('span');
            weightValueDisplay.className = 'canvas-editor-slider-value';
            weightValueDisplay.textContent = popupWeight;

            // Track slider dragging state (only for mouse/desktop, not touch/mobile)
            weightSlider.addEventListener('mousedown', (e) => {
                this._isSliderDragging = true;
                e.stopPropagation();
            });
            weightSlider.addEventListener('mouseup', (e) => {
                this._isSliderDragging = false;
                e.stopPropagation();
            });
            weightSlider.addEventListener('click', (e) => e.stopPropagation());
            weightSlider.addEventListener('touchstart', (e) => e.stopPropagation());

            // Setup slider transparency (deferred until editor is added to DOM)
            weightSlider._setupTransparency = () => {
                this.setupSliderTransparency(weightSlider, {
                    modal: editorContent,
                    backdrop: document.getElementById('canvasTextEditorBackdrop'),
                    sliderContainer: weightContainer
                });
            };
            weightSlider.addEventListener('input', (e) => {
                const weight = parseInt(e.target.value);
                weightValueDisplay.textContent = weight;
                if (isBorderText) {
                    CanvasManager.setFontWeightBorder(weight);
                    this._syncFontWeightBorderSliders(weight);
                } else if (isBackMainText) {
                    CanvasManager.setFontWeightBack(weight);
                    this._syncFontWeightBackSliders(weight);
                } else {
                    CanvasManager.setFontWeightFront(weight);
                    this._syncFontWeightFrontSliders(weight);
                }
            });

            weightWrapper.appendChild(weightSlider);
            weightWrapper.appendChild(weightValueDisplay);
            weightContainer.appendChild(weightLabel);
            weightContainer.appendChild(weightWrapper);

            // Reset font & weight button
            const resetFontWeightBtn = document.createElement('button');
            resetFontWeightBtn.type = 'button';
            resetFontWeightBtn.className = 'btn btn-secondary btn-small';
            resetFontWeightBtn.style.cssText = 'margin-top: 10px; width: 100%;';
            resetFontWeightBtn.innerHTML = '<i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i> Reset Font & Weight';
            resetFontWeightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetFontAndWeight();
                // Update slider in modal to reflect new weight
                const newWeight = isBorderText
                    ? (CanvasManager.fontWeightBorder ?? 600)
                    : isBackMainText
                        ? (CanvasManager.fontWeightBack ?? 500)
                        : (CanvasManager.fontWeightFront ?? 550);
                weightSlider.value = newWeight;
                weightValueDisplay.textContent = newWeight;
                // Update font button label
                fontBtn.innerHTML = `<span style="font-family: '${CanvasManager.fontFamily}', sans-serif;">${CanvasManager.fontFamily}</span><i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>`;
                if (window.lucide) lucide.createIcons();
            });
            resetFontWeightBtn.addEventListener('touchstart', (e) => e.stopPropagation());
            weightContainer.appendChild(resetFontWeightBtn);

            editorContent.appendChild(weightContainer);
        }

        // Add logo upload section for bottom text on both front and back sides
        const isBottomText = (side === 'front' && textType === 'bottom') || (side === 'back' && textType === 'bottomRotated');
        // Track logo sliders for transparency setup later
        const logoSliders = [];
        if (isBottomText) {
            // Create logo section container
            const logoSection = document.createElement('div');
            logoSection.className = 'canvas-editor-logo-section';
            logoSection.style.cssText = 'margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);';

            // Create logo section title
            const logoTitle = document.createElement('div');
            logoTitle.className = 'canvas-editor-logo-title';
            logoTitle.style.cssText = 'font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;';
            logoTitle.innerHTML = '<i data-lucide="image" style="width: 16px; height: 16px;"></i> Logo';
            logoSection.appendChild(logoTitle);

            // Determine which logo we're working with
            const isFrontSide = side === 'front';
            const logoImage = isFrontSide ? CanvasManager.frontLogoImage : CanvasManager.logoImage;

            // Create upload area
            const uploadArea = document.createElement('div');
            uploadArea.className = 'canvas-editor-logo-upload';
            uploadArea.style.cssText = 'margin-bottom: 12px;';

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/png,image/jpeg,image/jpg';
            fileInput.style.display = 'none';
            fileInput.id = 'canvasEditorLogoUpload';

            const uploadButton = document.createElement('button');
            uploadButton.type = 'button';
            uploadButton.className = 'btn btn-secondary btn-small';
            uploadButton.style.cssText = 'width: 100%; margin-bottom: 8px;';
            uploadButton.innerHTML = '<i data-lucide="upload" style="width: 14px; height: 14px;"></i> Upload Logo';

            uploadButton.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (isFrontSide) {
                        CanvasManager.loadFrontLogoImage(file);
                    } else {
                        CanvasManager.loadLogoImage(file);
                    }
                    // Update the UI to show controls
                    logoControlsContainer.style.display = 'block';
                    clearButton.style.display = 'block';
                }
            });

            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.className = 'btn btn-secondary btn-small';
            clearButton.style.cssText = 'width: 100%;';
            clearButton.style.display = logoImage ? 'block' : 'none';
            clearButton.innerHTML = '<i data-lucide="x" style="width: 14px; height: 14px;"></i> Clear Logo';

            clearButton.addEventListener('click', () => {
                if (isFrontSide) {
                    CanvasManager.clearFrontLogoImage();
                } else {
                    CanvasManager.clearLogoImage();
                }
                logoControlsContainer.style.display = 'none';
                clearButton.style.display = 'none';
            });

            uploadArea.appendChild(fileInput);
            uploadArea.appendChild(uploadButton);
            uploadArea.appendChild(clearButton);
            logoSection.appendChild(uploadArea);

            // Create logo controls container (zoom, position, rotation)
            const logoControlsContainer = document.createElement('div');
            logoControlsContainer.className = 'canvas-editor-logo-controls';
            logoControlsContainer.style.display = logoImage ? 'block' : 'none';

            // Helper function to create a slider control
            const createSlider = (label, min, max, value, onChange) => {
                const container = document.createElement('div');
                container.className = 'canvas-editor-slider-container';
                container.style.cssText = 'margin-bottom: 8px;';

                const sliderLabel = document.createElement('label');
                sliderLabel.className = 'canvas-editor-slider-label';
                sliderLabel.textContent = label;

                const sliderWrapper = document.createElement('div');
                sliderWrapper.className = 'canvas-editor-slider-wrapper';

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.className = 'canvas-editor-slider';
                slider.min = min;
                slider.max = max;
                slider.value = value;

                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'canvas-editor-slider-value';
                valueDisplay.textContent = label.includes('Rotation') ? `${value}°` : label.includes('Zoom') ? `${value}%` : `${value}px`;

                // Track slider dragging state (only for mouse/desktop, not touch/mobile)
                slider.addEventListener('mousedown', (e) => {
                    this._isSliderDragging = true;
                    e.stopPropagation();
                });
                slider.addEventListener('mouseup', (e) => {
                    this._isSliderDragging = false;
                    e.stopPropagation();
                });
                slider.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                slider.addEventListener('input', (e) => {
                    const val = parseInt(e.target.value);
                    valueDisplay.textContent = label.includes('Rotation') ? `${val}°` : label.includes('Zoom') ? `${val}%` : `${val}px`;
                    onChange(val);
                });

                // Setup slider transparency (deferred until editor is added to DOM)
                slider._setupTransparency = () => {
                    this.setupSliderTransparency(slider, {
                        modal: editorContent,
                        backdrop: document.getElementById('canvasTextEditorBackdrop'),
                        sliderContainer: container
                    });
                };

                sliderWrapper.appendChild(slider);
                sliderWrapper.appendChild(valueDisplay);
                container.appendChild(sliderLabel);
                container.appendChild(sliderWrapper);

                // Track slider for later transparency setup
                logoSliders.push(slider);

                return { container, slider };
            };

            // Add zoom slider
            const currentZoom = isFrontSide ? CanvasManager.frontLogoZoom * 100 : CanvasManager.logoZoom * 100;
            const { container: zoomContainer } = createSlider('Logo Zoom', 20, 300, currentZoom, (value) => {
                if (isFrontSide) {
                    CanvasManager.setFrontLogoZoom(value / 100);
                } else {
                    CanvasManager.setLogoZoom(value / 100);
                }
            });
            logoControlsContainer.appendChild(zoomContainer);

            // Add position X slider
            const currentPosX = isFrontSide ? CanvasManager.frontLogoPosX : CanvasManager.logoPosX;
            const { container: posXContainer } = createSlider('Position X', -100, 100, currentPosX, (value) => {
                const currentY = isFrontSide ? CanvasManager.frontLogoPosY : CanvasManager.logoPosY;
                if (isFrontSide) {
                    CanvasManager.setFrontLogoPosition(value, currentY);
                } else {
                    CanvasManager.setLogoPosition(value, currentY);
                }
            });
            logoControlsContainer.appendChild(posXContainer);

            // Add position Y slider
            const currentPosY = isFrontSide ? CanvasManager.frontLogoPosY : CanvasManager.logoPosY;
            const { container: posYContainer } = createSlider('Position Y', -100, 100, currentPosY, (value) => {
                const currentX = isFrontSide ? CanvasManager.frontLogoPosX : CanvasManager.logoPosX;
                if (isFrontSide) {
                    CanvasManager.setFrontLogoPosition(currentX, value);
                } else {
                    CanvasManager.setLogoPosition(currentX, value);
                }
            });
            logoControlsContainer.appendChild(posYContainer);

            // Add rotation slider
            const currentRotation = isFrontSide ? CanvasManager.frontLogoRotation : CanvasManager.logoRotation;
            const { container: rotationContainer } = createSlider('Rotation', 0, 360, currentRotation, (value) => {
                if (isFrontSide) {
                    CanvasManager.setFrontLogoRotation(value);
                } else {
                    CanvasManager.setLogoRotation(value);
                }
            });
            logoControlsContainer.appendChild(rotationContainer);

            logoSection.appendChild(logoControlsContainer);
            editorContent.appendChild(logoSection);
        }

        // Create hint text
        const hint = document.createElement('div');
        hint.className = 'canvas-text-editor-hint';
        hint.textContent = 'Press Enter or click outside to save, Esc to cancel';

        editorContent.appendChild(hint);
        editor.appendChild(editorContent);

        // Create save function with access to all necessary variables
        const saveTextChanges = () => {
            const newValue = input.value;

            if (side === 'front') {
                switch (textType) {
                    case 'top':
                        CanvasManager.setText(newValue, undefined, undefined);
                        if (inputElement) inputElement.value = newValue;
                        // Sync front name to back name
                        CanvasManager.setBackSideData({ nameValue: newValue });
                        this.elements.backNameValue.value = newValue;
                        if (this.elements.backNameValueMobile) this.elements.backNameValueMobile.value = newValue;
                        break;
                    case 'middle':
                        CanvasManager.setText(undefined, newValue, undefined);
                        if (inputElement) inputElement.value = newValue;
                        break;
                    case 'bottom':
                        // Don't restore bottom text if front logo is present
                        if (!CanvasManager.frontLogoImage) {
                            CanvasManager.setText(undefined, undefined, newValue);
                        }
                        if (inputElement) inputElement.value = newValue;
                        break;
                }
            } else if (side === 'back') {
                const updateData = {};
                switch (textType) {
                    case 'nameLabel':
                        updateData.nameLabel = newValue;
                        break;
                    case 'nameValue':
                        updateData.nameValue = newValue;
                        // Sync back name to front name
                        CanvasManager.setText(newValue, undefined, undefined);
                        this.elements.topText.value = newValue;
                        break;
                    case 'classLabel':
                        updateData.classLabel = newValue;
                        break;
                    case 'classValue':
                        updateData.classValue = newValue;
                        break;
                    case 'seasonLabel':
                        updateData.seasonLabel = newValue;
                        break;
                    case 'seasonValue':
                        updateData.seasonValue = newValue;
                        break;
                    case 'topRotated':
                        updateData.nameValue = newValue;
                        // Sync back name to front name
                        CanvasManager.setText(newValue, undefined, undefined);
                        this.elements.topText.value = newValue;
                        break;
                    case 'bottomRotated':
                        // Don't restore bottom text if back logo is present
                        if (!CanvasManager.logoImage) {
                            updateData.groupName = newValue;
                        }
                        break;
                }
                CanvasManager.setBackSideData(updateData);
                if (inputElement) inputElement.value = newValue;

                // Sync to mobile if needed
                if (textType === 'nameValue' && this.elements.backNameValueMobile) {
                    this.elements.backNameValueMobile.value = newValue;
                } else if (textType === 'nameLabel' && this.elements.backNameLabelMobile) {
                    this.elements.backNameLabelMobile.value = newValue;
                } else if (textType === 'classValue' && this.elements.backClassValueMobile) {
                    this.elements.backClassValueMobile.value = newValue;
                } else if (textType === 'classLabel' && this.elements.backClassLabelMobile) {
                    this.elements.backClassLabelMobile.value = newValue;
                } else if (textType === 'seasonValue' && this.elements.backSeasonValueMobile) {
                    this.elements.backSeasonValueMobile.value = newValue;
                } else if (textType === 'seasonLabel' && this.elements.backSeasonLabelMobile) {
                    this.elements.backSeasonLabelMobile.value = newValue;
                } else if (textType === 'bottomRotated' && this.elements.backGroupNameMobile) {
                    this.elements.backGroupNameMobile.value = newValue;
                }
            }
        };

        // Wrap save to also push history
        const originalSave = saveTextChanges;
        const saveAndRecord = () => {
            originalSave();
            const value = input.value.trim();
            const label = value ? `"${value}"` : 'Cleared text';
            HistoryManager.pushState(label);
        };

        // Store save function for access from outside click handler
        this._currentEditorSaveFunction = saveAndRecord;

        // Create and add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'canvas-text-editor-backdrop';
        backdrop.id = 'canvasTextEditorBackdrop';
        backdrop.addEventListener('click', () => {
            saveAndRecord();
            this.removeTextEditor();
        });

        document.body.appendChild(backdrop);
        document.body.appendChild(editor);

        // Initialize Lucide icons for dynamically created elements
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        // Setup slider transparency for all sliders (must be done after adding to DOM)
        if (heightSlider && heightSlider._setupTransparency) {
            heightSlider._setupTransparency();
        }
        if (weightSlider && weightSlider._setupTransparency) {
            weightSlider._setupTransparency();
        }
        // Setup transparency for all logo sliders
        logoSliders.forEach(slider => {
            if (slider._setupTransparency) {
                slider._setupTransparency();
            }
        });

        // Focus input and select all text
        input.focus();
        input.select();

        // Handle input events
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Save changes
                saveAndRecord();
                this.removeTextEditor();
            } else if (e.key === 'Escape') {
                // Cancel without saving
                this.removeTextEditor();
            }
        });

        // Add global listeners to handle drag end anywhere (only for mouse/desktop, not touch/mobile)
        const globalMouseUpHandler = () => {
            if (this._isSliderDragging) {
                this._isSliderDragging = false;
            }
        };

        document.addEventListener('mouseup', globalMouseUpHandler);

        // Store handler for cleanup
        this._globalMouseUpHandler = globalMouseUpHandler;

        // Remove editor when clicking outside
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick, true);
        }, 10);
    },

    /**
     * Handle clicks outside the text editor
     * Saves changes before closing
     */
    handleOutsideClick(event) {
        const editor = document.getElementById('canvasTextEditor');
        const backdrop = document.getElementById('canvasTextEditorBackdrop');

        // Detect if this is a touch event (mobile) or mouse event (desktop)
        const isTouchEvent = event.sourceCapabilities?.firesTouchEvents ||
                            event.pointerType === 'touch' ||
                            ('ontouchstart' in window && event.type.includes('touch'));

        // Only apply desktop protections for mouse events, not touch events
        if (!isTouchEvent) {
            // Don't close if a slider is being actively dragged (desktop only)
            if (UIManager._isSliderDragging) {
                return;
            }

            // Don't close if the event is from a slider being dragged (desktop only)
            if (event.target && event.target.type === 'range') {
                return;
            }

            // Don't close if clicking on slider-related elements (desktop only)
            if (event.target && (
                event.target.classList.contains('canvas-editor-slider') ||
                event.target.classList.contains('canvas-editor-slider-value') ||
                event.target.classList.contains('canvas-editor-slider-wrapper') ||
                event.target.classList.contains('canvas-editor-slider-container') ||
                event.target.classList.contains('canvas-editor-slider-label')
            )) {
                return;
            }
        }

        // Check if click is outside editor (but allow backdrop clicks to be handled by backdrop listener)
        if (editor && !editor.contains(event.target) && event.target !== backdrop) {
            // Save changes before removing
            if (UIManager._currentEditorSaveFunction) {
                UIManager._currentEditorSaveFunction();
            }
            UIManager.removeTextEditor();
        }
    },

    /**
     * Remove the text editor overlay
     */
    removeTextEditor() {
        const editor = document.getElementById('canvasTextEditor');
        const backdrop = document.getElementById('canvasTextEditorBackdrop');
        if (editor) {
            editor.remove();
        }
        if (backdrop) {
            backdrop.remove();
        }
        document.removeEventListener('click', this.handleOutsideClick, true);

        // Clean up global event listeners
        if (this._globalMouseUpHandler) {
            document.removeEventListener('mouseup', this._globalMouseUpHandler);
            this._globalMouseUpHandler = null;
        }

        // Clean up save function reference
        this._currentEditorSaveFunction = null;
        // Clean up slider dragging flag
        this._isSliderDragging = false;
    },

    /**
     * Show tooltip for top text field
     */
    showTopTextTooltip() {
        const tooltip = document.getElementById('topTextTooltip');
        const closeBtn = document.getElementById('closeTooltip');

        if (!tooltip) return;

        // Only show tooltip once per session
        const tooltipShown = sessionStorage.getItem('topTextTooltipShown');
        if (tooltipShown) return;

        // Show tooltip after a short delay
        setTimeout(() => {
            tooltip.style.display = 'block';

            // Re-initialize Lucide icons for the close button
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Mark as shown
            sessionStorage.setItem('topTextTooltipShown', 'true');

            // Auto-hide after 60 seconds
            this.tooltipTimeout = setTimeout(() => {
                this.hideTopTextTooltip();
            }, 60000);
        }, 1000);

        // Close button click handler
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideTopTextTooltip();
            });
        }
    },

    /**
     * Hide tooltip for top text field
     */
    hideTopTextTooltip() {
        const tooltip = document.getElementById('topTextTooltip');

        if (!tooltip) return;

        // Add fade-out class for smooth animation
        tooltip.classList.add('fade-out');

        // Remove after animation completes
        setTimeout(() => {
            tooltip.style.display = 'none';
            tooltip.classList.remove('fade-out');
        }, 300);

        // Clear timeout if exists
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
    },

    /**
     * Update mobile navigation visibility
     */
    updateMobileNavigation(view) {
        const frontNavSection = document.getElementById('frontNavSection');
        const backNavSection = document.getElementById('backNavSection');
        
        if (frontNavSection && backNavSection) {
            if (view === 'front') {
                frontNavSection.style.display = 'flex';
                backNavSection.style.display = 'none';
            } else {
                frontNavSection.style.display = 'none';
                backNavSection.style.display = 'flex';
            }
        }
    },

    /**
     * Initialize desktop navigation arrows
     */
    initDesktopArrows() {
        const canvasContainer = document.querySelector('.canvas-container');
        if (!canvasContainer) return;
        
        // Create left arrow
        const leftArrow = document.createElement('button');
        leftArrow.className = 'canvas-nav-arrow left';
        leftArrow.innerHTML = '<i data-lucide="chevron-left"></i>';
        leftArrow.addEventListener('click', () => this.switchCanvasView('front', 'right'));
        
        // Create right arrow
        const rightArrow = document.createElement('button');
        rightArrow.className = 'canvas-nav-arrow right';
        rightArrow.innerHTML = '<i data-lucide="chevron-right"></i>';
        rightArrow.addEventListener('click', () => this.switchCanvasView('back', 'left'));
        
        canvasContainer.appendChild(leftArrow);
        canvasContainer.appendChild(rightArrow);
        
        // Initialize icons
        if (window.lucide) lucide.createIcons();
    },

    /**
     * Initialize swipe gestures for canvas flipping
     */
    initSwipeGestures() {
        const canvasContainer = document.querySelector('.canvas-container');
        if (!canvasContainer) return;

        let startX = 0;
        let startY = 0;
        let startTime = 0;

        canvasContainer.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
        }, { passive: true });

        canvasContainer.addEventListener('touchend', (e) => {
            if (!e.changedTouches[0]) return;
            
            const touch = e.changedTouches[0];
            const endX = touch.clientX;
            const endY = touch.clientY;
            const endTime = Date.now();
            
            const deltaX = endX - startX;
            const deltaY = endY - startY;
            const deltaTime = endTime - startTime;
            
            // Check if it's a valid swipe (horizontal, fast enough, long enough)
            if (Math.abs(deltaX) > Math.abs(deltaY) && // More horizontal than vertical
                Math.abs(deltaX) > 50 && // Minimum distance
                deltaTime < 300) { // Maximum time
                
                if (deltaX > 0) {
                    // Swipe right - show front
                    this.switchCanvasView('front', 'right');
                    this.updateMobileNavigation('front');
                } else {
                    // Swipe left - show back
                    this.switchCanvasView('back', 'left');
                    this.updateMobileNavigation('back');
                }
            }
        }, { passive: true });
    },

    /**
     * Initialize drag-to-pan functionality on canvas (desktop)
     */
    initCanvasDragPan() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        let isDragging = false;
        let startX, startY, initialPanX, initialPanY;

        // Set initial cursor
        canvas.style.cursor = CanvasManager.hasImage() ? 'grab' : 'pointer';

        canvas.addEventListener('mousedown', (e) => {
            // Only start drag if image is loaded
            if (!CanvasManager.hasImage()) return;

            // Check if click is on a text area (let text editing take precedence)
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;

            if (CanvasManager.getClickedText(canvasX, canvasY)) {
                return; // Let text editor handle this click
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialPanX = CanvasManager.imagePosX;
            initialPanY = CanvasManager.imagePosY;
            canvas.style.cursor = 'grabbing';
            HistoryManager.captureSliderStart();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;

            const deltaX = (e.clientX - startX) * scaleX;
            const deltaY = (e.clientY - startY) * scaleX; // Use same scale for uniform movement

            const newPanX = Math.max(-300, Math.min(300, initialPanX + deltaX));
            const newPanY = Math.max(-300, Math.min(300, initialPanY + deltaY));

            CanvasManager.setPan(Math.round(newPanX), Math.round(newPanY));
            this.syncSliderValue('panX', Math.round(newPanX));
            this.syncSliderValue('panY', Math.round(newPanY));
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = CanvasManager.hasImage() ? 'grab' : 'pointer';
                const x = Math.round(CanvasManager.imagePosX);
                const y = Math.round(CanvasManager.imagePosY);
                HistoryManager.captureSliderEnd(`Pan: ${x}, ${y}`);
            }
        });

        // Update cursor when image is loaded/removed
        this._updateCanvasCursor = () => {
            if (!isDragging) {
                canvas.style.cursor = CanvasManager.hasImage() ? 'grab' : 'pointer';
            }
        };
    },

    /**
     * Initialize mouse wheel zoom on canvas (desktop)
     */
    initCanvasWheelZoom() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        let wheelTimeout = null;

        canvas.addEventListener('wheel', (e) => {
            if (!CanvasManager.hasImage()) return;
            e.preventDefault();

            // Capture before state on first wheel in a series
            if (!wheelTimeout) {
                HistoryManager.captureSliderStart();
            }

            const currentZoom = CanvasManager.imageScale * 100;
            // Scroll down = zoom out, scroll up = zoom in
            const zoomDelta = e.deltaY > 0 ? -10 : 10;
            const newZoom = Math.max(50, Math.min(200, currentZoom + zoomDelta));

            CanvasManager.setZoom(newZoom / 100);
            this.syncSliderValue('zoom', newZoom);

            // Push to history after 500ms of no wheel events
            clearTimeout(wheelTimeout);
            wheelTimeout = setTimeout(() => {
                const zoom = Math.round(CanvasManager.imageScale * 100);
                HistoryManager.captureSliderEnd(`Zoom: ${zoom}%`);
                wheelTimeout = null;
            }, 500);
        }, { passive: false });
    },

    /**
     * Initialize double-click/double-tap to reset pan
     */
    initCanvasDoubleClickReset() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        const handleDoubleAction = () => {
            if (!CanvasManager.hasImage()) return;

            CanvasManager.setPan(0, 0);
            this.syncSliderValue('panX', 0);
            this.syncSliderValue('panY', 0);
            HistoryManager.pushState('Reset pan position');
        };

        // Desktop double-click
        canvas.addEventListener('dblclick', (e) => {
            // Check if click is on a text area
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;

            if (CanvasManager.getClickedText(canvasX, canvasY)) {
                return; // Don't reset if clicking on text
            }

            e.preventDefault();
            handleDoubleAction();
        });
    },

    /**
     * Initialize touch drag-to-pan on canvas (mobile)
     */
    initCanvasTouchPan() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        let isPanning = false;
        let startX, startY, initialPanX, initialPanY;
        let hasMoved = false;

        canvas.addEventListener('touchstart', (e) => {
            if (!CanvasManager.hasImage()) return;
            if (e.touches.length !== 1) return; // Only single touch for pan

            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            initialPanX = CanvasManager.imagePosX;
            initialPanY = CanvasManager.imagePosY;
            isPanning = true;
            hasMoved = false;
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (!isPanning || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            // Only start panning if movement exceeds threshold
            if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                // Check if this is more like a horizontal swipe (for view switching)
                // Fast horizontal swipe should switch views, not pan
                const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 2;
                if (isHorizontalSwipe && !hasMoved) {
                    return; // Let swipe gesture handler take over
                }

                hasMoved = true;
                e.preventDefault();

                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;

                const scaledDeltaX = deltaX * scaleX;
                const scaledDeltaY = deltaY * scaleX;

                const newPanX = Math.max(-300, Math.min(300, initialPanX + scaledDeltaX));
                const newPanY = Math.max(-300, Math.min(300, initialPanY + scaledDeltaY));

                CanvasManager.setPan(Math.round(newPanX), Math.round(newPanY));
                this.syncSliderValue('panX', Math.round(newPanX));
                this.syncSliderValue('panY', Math.round(newPanY));
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            isPanning = false;
        });
    },

    /**
     * Initialize two-finger touch gestures on canvas (mobile)
     * - Two-finger pan: move image when both fingers move in the same direction
     * - Pinch-to-zoom: zoom when fingers move apart or together
     * This prevents accidental page scroll by requiring 2 fingers for image manipulation
     */
    initCanvasPinchZoom() {
        const canvas = document.getElementById('mainCanvas');
        if (!canvas) return;

        let initialDistance = null;
        let initialZoom = null;
        let initialPanX = null;
        let initialPanY = null;
        let initialMidpointX = null;
        let initialMidpointY = null;
        let isTwoFingerGesture = false;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2 && CanvasManager.hasImage()) {
                isTwoFingerGesture = true;
                HistoryManager.captureSliderStart();

                // Calculate initial distance for pinch-to-zoom
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialDistance = Math.hypot(dx, dy);
                initialZoom = CanvasManager.imageScale;

                // Calculate initial midpoint for two-finger pan
                initialMidpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                initialMidpointY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                initialPanX = CanvasManager.imagePosX;
                initialPanY = CanvasManager.imagePosY;
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (!isTwoFingerGesture || e.touches.length !== 2 || !initialDistance) return;
            e.preventDefault();

            // Calculate current distance for pinch-to-zoom
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.hypot(dx, dy);

            // Calculate current midpoint for two-finger pan
            const currentMidpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const currentMidpointY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            // Apply pinch-to-zoom
            const zoomRatio = currentDistance / initialDistance;
            const newZoom = Math.max(0.5, Math.min(2, initialZoom * zoomRatio));
            CanvasManager.setZoom(newZoom);
            this.syncSliderValue('zoom', Math.round(newZoom * 100));

            // Apply two-finger pan
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;

            const deltaX = (currentMidpointX - initialMidpointX) * scaleX;
            const deltaY = (currentMidpointY - initialMidpointY) * scaleX;

            const newPanX = Math.max(-300, Math.min(300, initialPanX + deltaX));
            const newPanY = Math.max(-300, Math.min(300, initialPanY + deltaY));

            CanvasManager.setPan(Math.round(newPanX), Math.round(newPanY));
            this.syncSliderValue('panX', Math.round(newPanX));
            this.syncSliderValue('panY', Math.round(newPanY));
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            // Only reset when all fingers are lifted
            if (e.touches.length === 0) {
                if (isTwoFingerGesture) {
                    const zoom = Math.round(CanvasManager.imageScale * 100);
                    const x = Math.round(CanvasManager.imagePosX);
                    const y = Math.round(CanvasManager.imagePosY);
                    HistoryManager.captureSliderEnd(`Zoom: ${zoom}%, Pan: ${x}, ${y}`);
                }
                isTwoFingerGesture = false;
                initialDistance = null;
                initialZoom = null;
                initialPanX = null;
                initialPanY = null;
                initialMidpointX = null;
                initialMidpointY = null;
            }
        });
    },

    /**
     * Initialize drag-to-pan on back canvas
     */
    initBackCanvasDragPan() {
        const canvas = document.getElementById('backCanvas');
        if (!canvas) return;

        let isDragging = false;
        let startX, startY, initialPanX, initialPanY;

        canvas.style.cursor = CanvasManager.hasBackImage() ? 'grab' : 'default';

        canvas.addEventListener('mousedown', (e) => {
            if (!CanvasManager.hasBackImage()) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialPanX = CanvasManager.backImagePosX;
            initialPanY = CanvasManager.backImagePosY;
            canvas.style.cursor = 'grabbing';
            HistoryManager.captureSliderStart();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const deltaX = (e.clientX - startX) * scaleX;
            const deltaY = (e.clientY - startY) * scaleX;
            const newPanX = Math.max(-300, Math.min(300, initialPanX + deltaX));
            const newPanY = Math.max(-300, Math.min(300, initialPanY + deltaY));
            CanvasManager.setBackPan(Math.round(newPanX), Math.round(newPanY));
            this.syncBackSliderValue('backPanX', Math.round(newPanX));
            this.syncBackSliderValue('backPanY', Math.round(newPanY));
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = CanvasManager.hasBackImage() ? 'grab' : 'default';
                const x = Math.round(CanvasManager.backImagePosX);
                const y = Math.round(CanvasManager.backImagePosY);
                HistoryManager.captureSliderEnd(`Back Pan: ${x}, ${y}`);
            }
        });

        this._updateBackCanvasCursor = () => {
            if (!isDragging) {
                canvas.style.cursor = CanvasManager.hasBackImage() ? 'grab' : 'default';
            }
        };
    },

    /**
     * Initialize wheel zoom on back canvas
     */
    initBackCanvasWheelZoom() {
        const canvas = document.getElementById('backCanvas');
        if (!canvas) return;

        let wheelTimeout = null;

        canvas.addEventListener('wheel', (e) => {
            if (!CanvasManager.hasBackImage()) return;
            e.preventDefault();

            if (!wheelTimeout) {
                HistoryManager.captureSliderStart();
            }

            const currentZoom = CanvasManager.backImageScale * 100;
            const zoomDelta = e.deltaY > 0 ? -10 : 10;
            const newZoom = Math.max(50, Math.min(200, currentZoom + zoomDelta));

            CanvasManager.setBackZoom(newZoom / 100);
            this.syncBackSliderValue('backZoom', newZoom);

            clearTimeout(wheelTimeout);
            wheelTimeout = setTimeout(() => {
                const zoom = Math.round(CanvasManager.backImageScale * 100);
                HistoryManager.captureSliderEnd(`Back Zoom: ${zoom}%`);
                wheelTimeout = null;
            }, 500);
        }, { passive: false });
    },

    /**
     * Initialize double-click reset on back canvas
     */
    initBackCanvasDoubleClickReset() {
        const canvas = document.getElementById('backCanvas');
        if (!canvas) return;

        canvas.addEventListener('dblclick', (e) => {
            if (!CanvasManager.hasBackImage()) return;
            e.preventDefault();
            CanvasManager.setBackPan(0, 0);
            this.syncBackSliderValue('backPanX', 0);
            this.syncBackSliderValue('backPanY', 0);
            HistoryManager.pushState('Reset back pan position');
        });
    },

    /**
     * Initialize pinch-to-zoom on back canvas (mobile)
     */
    initBackCanvasPinchZoom() {
        const canvas = document.getElementById('backCanvas');
        if (!canvas) return;

        let initialDistance = null;
        let initialZoom = null;
        let initialPanX = null;
        let initialPanY = null;
        let initialMidpointX = null;
        let initialMidpointY = null;
        let isTwoFingerGesture = false;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2 && CanvasManager.hasBackImage()) {
                isTwoFingerGesture = true;
                HistoryManager.captureSliderStart();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialDistance = Math.hypot(dx, dy);
                initialZoom = CanvasManager.backImageScale;
                initialMidpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                initialMidpointY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                initialPanX = CanvasManager.backImagePosX;
                initialPanY = CanvasManager.backImagePosY;
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (!isTwoFingerGesture || e.touches.length !== 2 || !initialDistance) return;
            e.preventDefault();

            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.hypot(dx, dy);
            const currentMidpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const currentMidpointY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            const zoomRatio = currentDistance / initialDistance;
            const newZoom = Math.max(0.5, Math.min(2, initialZoom * zoomRatio));
            CanvasManager.setBackZoom(newZoom);
            this.syncBackSliderValue('backZoom', Math.round(newZoom * 100));

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const deltaX = (currentMidpointX - initialMidpointX) * scaleX;
            const deltaY = (currentMidpointY - initialMidpointY) * scaleX;
            const newPanX = Math.max(-300, Math.min(300, initialPanX + deltaX));
            const newPanY = Math.max(-300, Math.min(300, initialPanY + deltaY));

            CanvasManager.setBackPan(Math.round(newPanX), Math.round(newPanY));
            this.syncBackSliderValue('backPanX', Math.round(newPanX));
            this.syncBackSliderValue('backPanY', Math.round(newPanY));
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                if (isTwoFingerGesture) {
                    const zoom = Math.round(CanvasManager.backImageScale * 100);
                    const x = Math.round(CanvasManager.backImagePosX);
                    const y = Math.round(CanvasManager.backImagePosY);
                    HistoryManager.captureSliderEnd(`Back Zoom: ${zoom}%, Pan: ${x}, ${y}`);
                }
                isTwoFingerGesture = false;
                initialDistance = null;
                initialZoom = null;
                initialPanX = null;
                initialPanY = null;
                initialMidpointX = null;
                initialMidpointY = null;
            }
        });
    },

    /**
     * Initialize floating adjustment overlay (mobile)
     */
    initFloatingAdjustOverlay() {
        const overlay = document.getElementById('floatingAdjustOverlay');
        const closeBtn = document.getElementById('closeFloatingAdjust');
        const resetBtn = document.getElementById('resetPositionBtn');
        const zoomSliderF = document.getElementById('zoomSliderFloating');
        const panXSliderF = document.getElementById('panXSliderFloating');
        const panYSliderF = document.getElementById('panYSliderFloating');
        const cornerRadiusSliderF = document.getElementById('cornerRadiusSliderFloating');
        const zoomValueF = document.getElementById('zoomValueFloating');
        const panXValueF = document.getElementById('panXValueFloating');
        const panYValueF = document.getElementById('panYValueFloating');
        const cornerRadiusValueF = document.getElementById('cornerRadiusValueFloating');

        if (!overlay) return;

        // Store references
        this.elements.floatingAdjustOverlay = overlay;
        this.elements.zoomSliderFloating = zoomSliderF;
        this.elements.panXSliderFloating = panXSliderF;
        this.elements.panYSliderFloating = panYSliderF;
        this.elements.cornerRadiusSliderFloating = cornerRadiusSliderF;
        this.elements.zoomValueFloating = zoomValueF;
        this.elements.panXValueFloating = panXValueF;
        this.elements.panYValueFloating = panYValueF;
        this.elements.cornerRadiusValueFloating = cornerRadiusValueF;

        // Close button
        closeBtn?.addEventListener('click', () => this.hideFloatingAdjustOverlay());

        // Reset button
        resetBtn?.addEventListener('click', () => {
            CanvasManager.setPan(0, 0);
            CanvasManager.setZoom(1);
            CanvasManager.cornerRadius = 36;
            this.syncSliderValue('panX', 0);
            this.syncSliderValue('panY', 0);
            this.syncSliderValue('zoom', 100);
            this.syncSliderValue('cornerRadius', 36);
            CanvasManager.render();
        });

        // Floating slider events
        zoomSliderF?.addEventListener('input', (e) => {
            const value = e.target.value;
            zoomValueF.textContent = `${value}%`;
            CanvasManager.setZoom(value / 100);
            this.syncSliderValue('zoom', value);
        });

        panXSliderF?.addEventListener('input', (e) => {
            const value = e.target.value;
            panXValueF.textContent = `${value}px`;
            CanvasManager.setPan(parseInt(value), CanvasManager.imagePosY);
            this.syncSliderValue('panX', value);
        });

        panYSliderF?.addEventListener('input', (e) => {
            const value = e.target.value;
            panYValueF.textContent = `${value}px`;
            CanvasManager.setPan(CanvasManager.imagePosX, parseInt(value));
            this.syncSliderValue('panY', value);
        });

        cornerRadiusSliderF?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            cornerRadiusValueF.textContent = `${value}px`;
            CanvasManager.cornerRadius = value;
            CanvasManager.render();
            this.syncSliderValue('cornerRadius', value);
        });

        // Setup slider transparency for floating overlay sliders
        const contentArea = overlay.querySelector('.floating-adjust-content');
        const overflowSliderMobile = document.getElementById('overflowBorderSliderMobile');

        if (zoomSliderF) {
            this.setupSliderTransparency(zoomSliderF, {
                modal: contentArea,
                backdrop: null,
                sliderContainer: zoomSliderF.closest('label')
            });
        }
        if (panXSliderF) {
            this.setupSliderTransparency(panXSliderF, {
                modal: contentArea,
                backdrop: null,
                sliderContainer: panXSliderF.closest('label')
            });
        }
        if (panYSliderF) {
            this.setupSliderTransparency(panYSliderF, {
                modal: contentArea,
                backdrop: null,
                sliderContainer: panYSliderF.closest('label')
            });
        }
        if (overflowSliderMobile) {
            this.setupSliderTransparency(overflowSliderMobile, {
                modal: contentArea,
                backdrop: null,
                sliderContainer: overflowSliderMobile.closest('label')
            });
        }
        if (cornerRadiusSliderF) {
            this.setupSliderTransparency(cornerRadiusSliderF, {
                modal: contentArea,
                backdrop: null,
                sliderContainer: cornerRadiusSliderF.closest('label')
            });
        }
    },

    /**
     * Show floating adjustment overlay
     */
    showFloatingAdjustOverlay() {
        const overlay = this.elements.floatingAdjustOverlay;
        if (overlay) {
            overlay.classList.add('visible');
            // Re-initialize Lucide icons in the overlay
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    },

    /**
     * Hide floating adjustment overlay
     */
    hideFloatingAdjustOverlay() {
        const overlay = this.elements.floatingAdjustOverlay;
        if (overlay) {
            overlay.classList.remove('visible');
        }
    },

    /**
     * Initialize mobile edge pan sliders (thin sliders on left and bottom of canvas)
     */
    initMobilePanSliders() {
        const mobilePanXSlider = document.getElementById('mobilePanXSlider');
        const mobilePanYSlider = document.getElementById('mobilePanYSlider');
        const mobilePanYContainer = document.getElementById('mobilePanControls');
        const mobilePanXContainer = document.getElementById('mobilePanXContainer');

        if (!mobilePanXSlider || !mobilePanYSlider) return;

        // Store references
        this.elements.mobilePanXSlider = mobilePanXSlider;
        this.elements.mobilePanYSlider = mobilePanYSlider;
        this.elements.mobilePanYContainer = mobilePanYContainer;
        this.elements.mobilePanXContainer = mobilePanXContainer;

        // X slider (horizontal pan - at bottom)
        mobilePanXSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            CanvasManager.setPan(value, CanvasManager.imagePosY);
            this.syncSliderValue('panX', value);
        });

        // Y slider (vertical pan - on left, rotated so negate value)
        mobilePanYSlider.addEventListener('input', (e) => {
            const value = -parseInt(e.target.value);
            CanvasManager.setPan(CanvasManager.imagePosX, value);
            this.syncSliderValue('panY', value);
        });

        // Prevent touch events from propagating to page scroll
        [mobilePanXSlider, mobilePanYSlider].forEach(slider => {
            slider.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });

            slider.addEventListener('touchmove', (e) => {
                e.stopPropagation();
            }, { passive: true });
        });
    },

    /**
     * Show/hide mobile pan controls based on whether image is loaded
     */
    updateMobilePanControlsVisibility() {
        const mobilePanYContainer = this.elements.mobilePanYContainer;
        const mobilePanXContainer = this.elements.mobilePanXContainer;

        if (CanvasManager.hasImage()) {
            if (mobilePanYContainer) mobilePanYContainer.classList.remove('hidden');
            if (mobilePanXContainer) mobilePanXContainer.classList.remove('hidden');
        } else {
            if (mobilePanYContainer) mobilePanYContainer.classList.add('hidden');
            if (mobilePanXContainer) mobilePanXContainer.classList.add('hidden');
        }
    }
};

// Export to global scope for browser usage
window.UIManager = UIManager;

// Export for use in other modules (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}

// Bottom Navigation Functionality
document.addEventListener('DOMContentLoaded', () => {
    const bottomNav = document.getElementById('bottomNav');
    const frontNavSection = document.getElementById('frontNavSection');
    const backNavSection = document.getElementById('backNavSection');
    const navBtns = document.querySelectorAll('.nav-btn');

    if (!bottomNav) return;

    // Map navigation targets to their corresponding sections
    const sectionMap = {
        'upload': () => {
            const uploadSection = document.querySelector('.control-section:has(#uploadArea)');
            if (uploadSection) {
                uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'adjust': () => {
            // Show floating adjustment overlay
            UIManager.showFloatingAdjustOverlay();
        },
        'border-color': () => {
            const section = document.querySelector('.collapsible-section:has(#notchColorSelect)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'border-image': () => {
            const section = document.querySelector('.collapsible-section:has(#borderImageUpload)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'logo': () => {
            const section = document.querySelector('.collapsible-section:has(#frontLogoUpload)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'text': () => {
            const section = document.querySelector('.collapsible-section:has(#topText)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'border-color-back': () => {
            const section = document.querySelector('.collapsible-section:has(#notchColorSelectBack)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'border-image-back': () => {
            const section = document.querySelector('.collapsible-section:has(#borderImageUploadBack)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'logo-back': () => {
            const section = document.querySelector('.collapsible-section:has(#logoUpload)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'text-back': () => {
            const section = document.querySelector('.collapsible-section:has(#textColorPickerBack)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'signature': () => {
            const section = document.querySelector('.collapsible-section:has(#openSignatureModal)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        'content': () => {
            const section = document.querySelector('.collapsible-section:has(#backClassLabel)');
            if (section) {
                section.classList.remove('collapsed');
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    // Handle navigation button clicks
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = btn.dataset.target;
            
            // Remove active state from all buttons
            navBtns.forEach(b => b.classList.remove('active'));
            // Add active state to clicked button
            btn.classList.add('active');
            
            // Execute navigation action
            if (sectionMap[target]) {
                sectionMap[target]();
            }
        });
    });

    // Update navigation visibility based on current view
    const updateNavVisibility = (view) => {
        if (view === 'front') {
            frontNavSection.style.display = 'flex';
            backNavSection.style.display = 'none';
        } else {
            frontNavSection.style.display = 'none';
            backNavSection.style.display = 'flex';
        }
        // Clear active states when switching views
        navBtns.forEach(btn => btn.classList.remove('active'));
    };

    // Listen for canvas view changes
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            updateNavVisibility(view);
        });
    });

    // Initialize with front view
    updateNavVisibility('front');
});

