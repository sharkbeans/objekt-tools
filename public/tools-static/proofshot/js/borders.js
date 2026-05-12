/**
 * borders.js
 * Manages decorative borders and frames for the Proofshot canvas
 */

const BorderManager = {
    // Available border styles
    borders: [
        {
            id: 'none',
            name: 'None',
            type: 'none'
        }
    ],

    currentBorder: null,

    /**
     * Initialize the border manager
     */
    init(canvasInstance) {
        this.canvas = canvasInstance;
        this.renderBorderSelector();
        this.attachEventListeners();
    },

    /**
     * Render border options in the UI
     */
    renderBorderSelector() {
        const container = document.getElementById('border-selector');
        if (!container) return;

        container.innerHTML = '';

        this.borders.forEach(border => {
            const option = document.createElement('div');
            option.className = 'border-option';
            option.dataset.borderId = border.id;
            option.textContent = border.name;

            if (border.id === 'none') {
                option.classList.add('active');
            }

            container.appendChild(option);
        });
    },

    /**
     * Attach event listeners to border options
     */
    attachEventListeners() {
        const container = document.getElementById('border-selector');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const option = e.target.closest('.border-option');
            if (!option) return;

            const borderId = option.dataset.borderId;
            this.selectBorder(borderId);
        });
    },

    /**
     * Select a border by ID
     */
    selectBorder(borderId) {
        // Update UI
        document.querySelectorAll('.border-option').forEach(opt => {
            opt.classList.remove('active');
        });

        const selectedOption = document.querySelector(`[data-border-id="${borderId}"]`);
        if (selectedOption) {
            selectedOption.classList.add('active');
        }

        // Update current border
        this.currentBorder = this.borders.find(b => b.id === borderId);

        // Trigger canvas redraw
        if (this.canvas) {
            this.canvas.render();
        }
    },

    /**
     * Get the currently selected border
     */
    getCurrentBorder() {
        return this.currentBorder;
    },

    /**
     * Draw the current border on the canvas
     */
    drawBorder(ctx, width, height) {
        if (!this.currentBorder || this.currentBorder.type === 'none') {
            return;
        }

        ctx.save();

        const border = this.currentBorder;

        switch (border.type) {
            case 'solid':
                this.drawSolidBorder(ctx, width, height, border);
                break;
            case 'gradient':
                this.drawGradientBorder(ctx, width, height, border);
                break;
            case 'polaroid':
                this.drawPolaroidBorder(ctx, width, height, border);
                break;
            case 'dashed':
                this.drawDashedBorder(ctx, width, height, border);
                break;
        }

        ctx.restore();
    },

    /**
     * Draw a solid color border
     */
    drawSolidBorder(ctx, width, height, border) {
        if (border.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;
        }

        ctx.fillStyle = border.color;

        // Top
        ctx.fillRect(0, 0, width, border.width);
        // Right
        ctx.fillRect(width - border.width, 0, border.width, height);
        // Bottom
        ctx.fillRect(0, height - border.width, width, border.width);
        // Left
        ctx.fillRect(0, 0, border.width, height);
    },

    /**
     * Draw a gradient border
     */
    drawGradientBorder(ctx, width, height, border) {
        if (border.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;
        }

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        border.colors.forEach((color, index) => {
            gradient.addColorStop(index / (border.colors.length - 1), color);
        });

        ctx.fillStyle = gradient;

        // Top
        ctx.fillRect(0, 0, width, border.width);
        // Right
        ctx.fillRect(width - border.width, 0, border.width, height);
        // Bottom
        ctx.fillRect(0, height - border.width, width, border.width);
        // Left
        ctx.fillRect(0, 0, border.width, height);
    },

    /**
     * Draw a polaroid-style border
     */
    drawPolaroidBorder(ctx, width, height, border) {
        if (border.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;
        }

        ctx.fillStyle = border.color;

        // Top
        ctx.fillRect(0, 0, width, border.topWidth);
        // Right
        ctx.fillRect(width - border.sideWidth, 0, border.sideWidth, height);
        // Bottom (thicker for polaroid effect)
        ctx.fillRect(0, height - border.bottomWidth, width, border.bottomWidth);
        // Left
        ctx.fillRect(0, 0, border.sideWidth, height);
    },

    /**
     * Draw a dashed border
     */
    drawDashedBorder(ctx, width, height, border) {
        ctx.strokeStyle = border.color;
        ctx.lineWidth = border.width;
        ctx.setLineDash(border.dashPattern || [10, 5]);

        const inset = border.width / 2;
        ctx.strokeRect(inset, inset, width - border.width, height - border.width);

        ctx.setLineDash([]);
    },

    /**
     * Get border insets (for proper canvas sizing)
     */
    getBorderInsets() {
        if (!this.currentBorder || this.currentBorder.type === 'none') {
            return { top: 0, right: 0, bottom: 0, left: 0 };
        }

        const border = this.currentBorder;

        switch (border.type) {
            case 'solid':
            case 'gradient':
            case 'dashed':
                return {
                    top: border.width || 0,
                    right: border.width || 0,
                    bottom: border.width || 0,
                    left: border.width || 0
                };
            case 'polaroid':
                return {
                    top: border.topWidth || 0,
                    right: border.sideWidth || 0,
                    bottom: border.bottomWidth || 0,
                    left: border.sideWidth || 0
                };
            default:
                return { top: 0, right: 0, bottom: 0, left: 0 };
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BorderManager;
}
