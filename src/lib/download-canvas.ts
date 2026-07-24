// Share (mobile) or download (desktop / fallback) a canvas as a PNG.
// Extracted from the poster flow in src/app/list/page.tsx so the progress
// completion-card shares the exact same proven behavior.

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareOrDownloadCanvas(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<ShareOutcome> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
  return shareOrDownloadBlob(blob, fileName);
}

export async function shareOrDownloadBlob(
  blob: Blob,
  fileName: string,
): Promise<ShareOutcome> {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canShareFiles =
    isMobile &&
    navigator.canShare?.({
      files: [new File([], "t.png", { type: "image/png" })],
    });

  if (canShareFiles) {
    const file = new File([blob], fileName, { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (shareErr) {
      if (shareErr instanceof Error && shareErr.name === "AbortError")
        return "cancelled";
      // Share API blocked (gesture timeout etc.) — fall through to download.
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = blobUrl;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  return "downloaded";
}
