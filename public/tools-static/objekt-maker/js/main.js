/**
 * main.js
 * Main application entry point - orchestrates all modules
 */

// Application state
const App = {
    version: '1.0.0',
    initialized: false,

    /**
     * Initialize the application
     */
    async init() {
        console.log(`Photocard Maker v${this.version} - Initializing...`);

        try {
            // Initialize CanvasManager
            const canvas = document.getElementById('mainCanvas');
            if (!canvas) {
                throw new Error('Canvas element not found');
            }
            CanvasManager.init(canvas);
            console.log('[OK] CanvasManager initialized');

            // Ensure MatrixSSK is loaded before first render so serial numbers
            // don't fall back to the main font (font-display: swap causes a race on init)
            await document.fonts.load('550 45px "MatrixSSK"').catch(() => {});
            console.log('[OK] MatrixSSK font ready');

            // Initialize UIManager
            UIManager.init();
            console.log('[OK] UIManager initialized');

            // Generate initial QR code (with retry for library loading)
            await this.initializeQRCode();

            // Initialize PresetManager (Phase 4)
            PresetManager.initUI();
            console.log('[OK] PresetManager initialized');

            // Check for share code in URL (Phase 5)
            await PresetManager.checkURLParams();

            // Initialize SavedCardsManager
            await SavedCardsManager.initDB();
            await SavedCardsManager.renderCardsList();
            SavedCardsManager.initUI();
            console.log('[OK] SavedCardsManager initialized');

            // Initialize HistoryManager (undo/redo)
            HistoryManager.init();
            console.log('[OK] HistoryManager initialized');

            // Initialize BulkManager
            BulkManager.init();
            console.log('[OK] BulkManager initialized');

            this.initialized = true;
            console.log('[OK] Photocard Maker ready!');

            // Show welcome message
            this.showWelcome();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            // Removed alert - error logged to console only
        }
    },

    /**
     * Initialize QR code with retry logic for library loading
     */
    async initializeQRCode() {
        // Wait for qrcode library (Nayuki) to be available
        let retries = 0;
        while (typeof qrcode === 'undefined' && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (typeof qrcode === 'undefined') {
            console.error('QRCode library failed to load');
            return;
        }

        console.log('[OK] QR Code library loaded');
        await CanvasManager.generateQRCode();
        console.log('[OK] QR Code generated');

        // Force an initial update of the back side preview to ensure QR code is rendered
        CanvasManager.updateBackSidePreview();
        console.log('[OK] Back side preview initialized with QR code');
    },

    /**
     * Show welcome message in console
     */
    showWelcome() {
        console.log(`
╔═══════════════════════════════════════╗
║       PHOTOCARD MAKER                 ║
║                                       ║
║  Upload an image to create a          ║
║  768×1186 px photocard with           ║
║  yellow accent bar and text!          ║
║                                       ║
╚═══════════════════════════════════════╝
        `);
    },

    /**
     * Show error message
     */
    showError(message) {
        ToastManager.error(message);
    },

    /**
     * Get application info
     */
    getInfo() {
        return {
            version: this.version,
            initialized: this.initialized,
            hasImage: CanvasManager.hasImage(),
            canvasSize: `${CanvasManager.canvasWidth}x${CanvasManager.canvasHeight}`,
            topText: CanvasManager.topText,
            bottomText: CanvasManager.bottomText
        };
    }
};

/**
 * Wait for DOM to be fully loaded, then initialize app
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
} else {
    // DOM already loaded
    App.init();
}

/**
 * Handle page visibility changes (optional performance optimization)
 */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden - pausing...');
    } else {
        console.log('Page visible - resuming...');
        // Re-render canvas if needed
        if (CanvasManager.hasImage()) {
            CanvasManager.render();
        }
    }
});

/**
 * Expose App object to window for debugging
 * Accessible via browser console: App.getInfo()
 */
window.PhotocardMaker = App;

/**
 * Service Worker registration for PWA support (optional future enhancement)
 * Uncomment when service worker is implemented
 */
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('SW registered:', registration))
            .catch(err => console.log('SW registration failed:', err));
    });
}
*/
