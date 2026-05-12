/**
 * toploader-config.js
 * Configuration values for toploader overlay rendering
 *
 * Adjust these values to fine-tune the toploader appearance
 */

const ToploaderConfig = {
    // Overlap dimensions (in pixels)
    dimensions: {
        // How much the toploader overlaps the photocard on left/right/top sides
        sideOverlap: 61.8,

        // Extra overlap at the bottom (toploader extends further at bottom)
        bottomOverlap: 139.23
    },

    // Corner radii
    corners: {
        // Radius for top corners (more rounded)
        topRadius: 70,

        // Radius for bottom corners (less rounded)
        bottomRadius: 42
    },

    // Border/frame thickness
    frame: {
        // Left edge thickness
        leftThickness: 10,

        // Right edge thickness
        rightThickness: 9,

        // Right edge inset adjustment
        rightInset: 1
    },

    // White border reflections
    borders: {
        // West (left) border gradient
        west: {
            // Gradient width multiplier
            widthMultiplier: 3,

            // Gradient scale factor
            scaleFactor: 1.2,

            // Opacity stops
            startOpacity: 0.7,
            endOpacity: 0.4
        },

        // East (right) border gradient
        east: {
            // Gradient width multiplier
            widthMultiplier: 3,

            // Gradient scale factor
            scaleFactor: 1.2,

            // Opacity stops
            startOpacity: 0.7,
            endOpacity: 0.4
        },

        // South (bottom) border gradient
        south: {
            // Opacity stops across the gradient
            edgeOpacity: 0.5,
            centerOpacity: 0.7
        }
    },

    // Plastic overlay effects
    overlay: {
        // Semi-transparent base for plastic effect
        baseOpacity: 0.03,

        // Inner viewing area tint (slight blue tint for plastic)
        innerTint: {
            red: 240,
            green: 245,
            blue: 255,
            opacity: 0.05
        },

        // Inner edge definition
        innerEdge: {
            red: 180,
            green: 190,
            blue: 210,
            opacity: 0.12,
            lineWidth: 0.8
        }
    },

    // Highlight gradients
    highlights: {
        // Top glossy highlight (reflection from light source)
        top: {
            // Height as percentage of inner height
            heightPercent: 0.3,

            // Opacity stops
            startOpacity: 0.07,
            middleOpacity: 0.02,
            endOpacity: 0
        }
    },

    // Inner shadow gradients (3D depth effect)
    shadows: {
        // North (top) shadow
        north: {
            startOpacity: 0.1,
            endOpacity: 0
        },

        // West (left) shadow
        west: {
            startOpacity: 0.18,
            endOpacity: 0
        },

        // East (right) shadow
        east: {
            startOpacity: 0.18,
            endOpacity: 0
        },

        // South (bottom) shadow
        south: {
            startOpacity: 0,
            endOpacity: 0.18
        }
    },

    // Third internal shading line (grey border following white border)
    shadingLine: {
        // Grey color with opacity
        red: 140,
        green: 140,
        blue: 140,
        opacity: 0.45,

        // Width reduction factor (multiplied by border thickness)
        widthReduction: 0.4
    },

    // Top clipping (removes artifacts)
    clipping: {
        // Pixels to clip from top
        topClip: 5
    },

    // Curve start percentages (for partial curves at top)
    curves: {
        // Top curve starts at this percentage of corner radius
        topCurveStartPercent: 0.6
    },

    // White glaze film covering the photocard
    glazeFilm: {
        // White color with mild opacity
        red: 255,
        green: 255,
        blue: 255,
        opacity: 0.02
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToploaderConfig;
}
