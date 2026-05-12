// Overflow border event handlers
document.addEventListener('DOMContentLoaded', () => {
    const overflowToggle = document.getElementById('overflowBorderToggle');
    const overflowSlider = document.getElementById('overflowBorderSlider');
    const overflowValue = document.getElementById('overflowBorderValue');
    const overflowContainer = document.getElementById('overflowBorderSliderContainer');

    // Mobile elements
    const overflowToggleMobile = document.getElementById('overflowBorderToggleMobile');
    const overflowSliderMobile = document.getElementById('overflowBorderSliderMobile');
    const overflowValueMobile = document.getElementById('overflowBorderValueMobile');
    const overflowContainerMobile = document.getElementById('overflowBorderSliderContainerMobile');

    function syncOverflowToggle(checked) {
        CanvasManager.showOverflowBorder = checked;
        if (overflowContainer) overflowContainer.style.display = checked ? 'flex' : 'none';
        if (overflowContainerMobile) overflowContainerMobile.style.display = checked ? 'flex' : 'none';
        if (overflowToggle) overflowToggle.checked = checked;
        if (overflowToggleMobile) overflowToggleMobile.checked = checked;
        CanvasManager.render();
        CanvasManager.updateBackSidePreview();
    }

    function syncOverflowSlider(value) {
        CanvasManager.overflowBorderPercent = value;
        if (overflowValue) overflowValue.textContent = `${value}%`;
        if (overflowValueMobile) overflowValueMobile.textContent = `${value}%`;
        if (overflowSlider) overflowSlider.value = value;
        if (overflowSliderMobile) overflowSliderMobile.value = value;
        CanvasManager.render();
        CanvasManager.updateBackSidePreview();
    }

    if (overflowToggle) {
        overflowToggle.addEventListener('change', (e) => {
            syncOverflowToggle(e.target.checked);
        });
    }

    if (overflowToggleMobile) {
        overflowToggleMobile.addEventListener('change', (e) => {
            syncOverflowToggle(e.target.checked);
        });
    }

    if (overflowSlider) {
        overflowSlider.addEventListener('input', (e) => {
            syncOverflowSlider(parseFloat(e.target.value));
        });
    }

    if (overflowSliderMobile) {
        overflowSliderMobile.addEventListener('input', (e) => {
            syncOverflowSlider(parseFloat(e.target.value));
        });
    }
});
