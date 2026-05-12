/**
 * main.js
 * Entry point - initializes the Proofshot application
 */

// Make managers globally accessible
window.BorderManager = BorderManager;
window.CanvasManager = CanvasManager;
window.UIManager = UIManager;

/**
 * Application initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('%cProofshot v1.0', 'color: #c7b6f9; font-size: 24px; font-weight: bold;');

    try {
        // Initialize canvas manager
        console.log('Initializing canvas...');
        CanvasManager.init();

        // Initialize border manager
        console.log('Initializing borders...');
        BorderManager.init(CanvasManager);

        // Initialize UI manager
        console.log('Initializing UI...');
        UIManager.init(CanvasManager);

        console.log('%cProofshot initialized successfully!', 'color: #6dd5a0; font-weight: bold;');

        // Show welcome message
        showWelcomeMessage();

        // Add version info to footer
        addVersionInfo();

        // Check for URL parameters (for sharing)
        checkUrlParameters();

    } catch (error) {
        console.error('Error initializing Proofshot:', error);
        showErrorMessage('Failed to initialize the application. Please refresh the page.');
    }
});

/**
 * Show welcome message
 */
function showWelcomeMessage() {
    const isFirstVisit = !localStorage.getItem('proofshot-visited');

    if (isFirstVisit) {
        setTimeout(() => {
            UIManager.showNotification('Welcome to Proofshot! Upload a background to get started.', 'info');
            localStorage.setItem('proofshot-visited', 'true');
        }, 500);
    }
}

/**
 * Add version info to footer
 */
function addVersionInfo() {
    // Version info removed
}

/**
 * Check for URL parameters
 */
function checkUrlParameters() {
    const params = new URLSearchParams(window.location.search);

    // Check for shared proofshot ID
    const proofId = params.get('proof');
    if (proofId) {
        console.log('Shared proofshot ID:', proofId);
        // Could implement loading shared proofshots from a backend service
        // For now, this is just a placeholder
    }

    // Check for preset background
    const preset = params.get('preset');
    if (preset) {
        loadPresetBackground(preset);
    }
}

/**
 * Load preset background
 */
function loadPresetBackground(preset) {
    // Placeholder for loading preset backgrounds
    // Could implement preset backgrounds stored in assets folder
    console.log('Loading preset background:', preset);
}

/**
 * Show error message
 */
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff6b9d;
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-weight: 600;
        max-width: 400px;
        text-align: center;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
}

/**
 * Handle visibility change (for performance optimization)
 */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause animations when tab is not visible
        if (CanvasManager.animation) {
            CanvasManager.animation.active = false;
        }
    }
});

/**
 * Handle online/offline status
 */
window.addEventListener('online', () => {
    UIManager.showNotification('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    UIManager.showNotification('You are offline - the app will continue to work', 'info');
});

/**
 * Service Worker registration (for PWA capabilities - optional enhancement)
 */
if ('serviceWorker' in navigator) {
    // Uncomment to enable PWA features
    // window.addEventListener('load', () => {
    //     navigator.serviceWorker.register('/sw.js')
    //         .then(registration => {
    //             console.log('Service Worker registered:', registration);
    //         })
    //         .catch(error => {
    //             console.log('Service Worker registration failed:', error);
    //         });
    // });
}

/**
 * Performance monitoring
 */
if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const perfData = window.performance.timing;
            const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
            console.log(`Page load time: ${pageLoadTime}ms`);
        }, 0);
    });
}

/**
 * Export application state (for debugging)
 */
window.getAppState = function() {
    return {
        canvas: {
            hasBackground: !!CanvasManager.backgroundImage,
            hasPhotocard: !!CanvasManager.photocardImage,
            photocard: CanvasManager.photocard
        },
        border: BorderManager.currentBorder?.id || 'none',
        version: '1.0'
    };
};

/**
 * Debug mode toggle
 */
window.toggleDebugMode = function() {
    const canvas = document.getElementById('proofshot-canvas');
    if (!canvas) return;

    const isDebug = canvas.dataset.debug === 'true';
    canvas.dataset.debug = !isDebug;

    if (!isDebug) {
        // Enable debug mode
        canvas.style.outline = '2px dashed #c7b6f9';
        console.log('%cDebug mode enabled', 'color: #c7b6f9; font-weight: bold;');
        console.log('App state:', window.getAppState());
    } else {
        // Disable debug mode
        canvas.style.outline = 'none';
        console.log('Debug mode disabled');
    }
};

/**
 * Keyboard shortcut help
 */
window.showKeyboardShortcuts = function() {
    const shortcuts = `
Keyboard Shortcuts:
-------------------
Ctrl/Cmd + S : Save proofshot
Ctrl/Cmd + R : Reset canvas
H            : Flip horizontal
V            : Flip vertical
[            : Rotate left
]            : Rotate right
Esc          : Close modal

Touch Gestures:
--------------
Single finger : Drag photocard
Two fingers   : Pinch to zoom
Two fingers   : Rotate
    `.trim();

    console.log(shortcuts);
    UIManager.showNotification('Keyboard shortcuts logged to console', 'info');
};

// Add global command for shortcuts help
console.log('%cType showKeyboardShortcuts() for help', 'color: #718096; font-style: italic;');
