/**
 * borders.js
 * Handles loading and managing border/frame presets from borders.json
 */

const BorderManager = {
    borders: [],
    currentBorder: null,

    /**
     * Initialize border manager by loading border presets
     */
    async init() {
        try {
            const response = await fetch('data/borders.json');
            if (!response.ok) {
                throw new Error('Failed to load borders.json');
            }
            this.borders = await response.json();
            console.log(`Loaded ${this.borders.length} border presets`);

            // Load saved border preference from localStorage
            const savedBorderId = localStorage.getItem('selectedBorderId');
            if (savedBorderId) {
                this.currentBorder = this.borders.find(b => b.id === savedBorderId) || this.borders[0];
            } else {
                this.currentBorder = this.borders[0];
            }
        } catch (error) {
            console.error('Error loading borders:', error);
            // Fallback to default borders if fetch fails
            this.borders = this.getDefaultBorders();
            this.currentBorder = this.borders[0];
        }
    },

    /**
     * Get default borders as fallback
     */
    getDefaultBorders() {
        return [
            { id: 'none', name: 'None', type: 'none', icon: 'square' },
            { id: 'classic', name: 'Classic', type: 'border', width: 40, color: '#ffffff', icon: 'frame' },
            { id: 'polaroid', name: 'Polaroid', type: 'polaroid', icon: 'camera' },
            { id: 'rounded', name: 'Rounded', type: 'rounded', radius: 30, icon: 'square-rounded' },
            { id: 'circle', name: 'Circle', type: 'circle', icon: 'circle' },
            { id: 'heart', name: 'Heart', type: 'heart', icon: 'heart' }
        ];
    },

    /**
     * Set the current active border
     * @param {string} borderId - ID of the border to set as active
     */
    setBorder(borderId) {
        const border = this.borders.find(b => b.id === borderId);
        if (border) {
            this.currentBorder = border;
            // Save to localStorage
            localStorage.setItem('selectedBorderId', borderId);
            console.log('Border set to:', border.name);
        }
    },

    /**
     * Get the current active border
     * @returns {Object} Current border object
     */
    getCurrentBorder() {
        return this.currentBorder;
    },

    /**
     * Get all available borders
     * @returns {Array} Array of border objects
     */
    getAllBorders() {
        return this.borders;
    },

    /**
     * Apply border styling to canvas context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {string} color - Border color (hex)
     */
    applyBorder(ctx, width, height, color = '#ffffff') {
        if (!this.currentBorder || this.currentBorder.type === 'none') {
            return;
        }

        const border = this.currentBorder;

        switch (border.type) {
            case 'border':
                this.drawClassicBorder(ctx, width, height, color, border.width || 40);
                break;
            case 'polaroid':
                this.drawPolaroidBorder(ctx, width, height, color);
                break;
            case 'rounded':
                this.drawRoundedBorder(ctx, width, height, color, border.radius || 30);
                break;
            case 'circle':
                this.drawCircleMask(ctx, width, height);
                break;
            case 'heart':
                this.drawHeartMask(ctx, width, height);
                break;
            default:
                console.warn('Unknown border type:', border.type);
        }
    },

    /**
     * Draw classic border (frame around image)
     */
    drawClassicBorder(ctx, width, height, color, borderWidth) {
        ctx.strokeStyle = color;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth);

        // Inner shadow effect
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(borderWidth, borderWidth, width - borderWidth * 2, height - borderWidth * 2);
    },

    /**
     * Draw polaroid-style border (thin sides, thick bottom)
     */
    drawPolaroidBorder(ctx, width, height, color) {
        const sideBorder = 30;
        const bottomBorder = 100;

        // Fill white border areas
        ctx.fillStyle = color;

        // Top border
        ctx.fillRect(0, 0, width, sideBorder);
        // Left border
        ctx.fillRect(0, 0, sideBorder, height);
        // Right border
        ctx.fillRect(width - sideBorder, 0, sideBorder, height);
        // Bottom border (larger for polaroid effect)
        ctx.fillRect(0, height - bottomBorder, width, bottomBorder);

        // Subtle shadow on bottom border
        const gradient = ctx.createLinearGradient(0, height - bottomBorder, 0, height - bottomBorder + 20);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(sideBorder, height - bottomBorder, width - sideBorder * 2, 20);
    },

    /**
     * Draw rounded corners border
     */
    drawRoundedBorder(ctx, width, height, color, radius) {
        // This creates a rounded rectangle mask effect
        ctx.save();

        // Create rounded rectangle path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(width - radius, 0);
        ctx.quadraticCurveTo(width, 0, width, radius);
        ctx.lineTo(width, height - radius);
        ctx.quadraticCurveTo(width, height, width - radius, height);
        ctx.lineTo(radius, height);
        ctx.quadraticCurveTo(0, height, 0, height - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();

        // Clip to rounded rectangle
        ctx.clip();

        ctx.restore();
    },

    /**
     * Draw circle mask (crops image to circle)
     */
    drawCircleMask(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2;

        // Create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    },

    /**
     * Draw heart mask (crops image to heart shape)
     */
    drawHeartMask(ctx, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = Math.min(width, height) / 200;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);

        // Heart path
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.bezierCurveTo(-50, -20, -100, 0, -50, 60);
        ctx.lineTo(0, 100);
        ctx.lineTo(50, 60);
        ctx.bezierCurveTo(100, 0, 50, -20, 0, 20);
        ctx.closePath();
        ctx.clip();

        ctx.restore();
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BorderManager;
}
