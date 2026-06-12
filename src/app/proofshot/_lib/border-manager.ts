interface BorderDef {
  id: string;
  name: string;
  type: string;
  color?: string;
  colors?: string[];
  width?: number;
  topWidth?: number;
  sideWidth?: number;
  bottomWidth?: number;
  dashPattern?: number[];
  shadow?: boolean;
}

export class BorderManager {
  private borders: BorderDef[] = [{ id: "none", name: "None", type: "none" }];
  currentBorder: BorderDef | null = null;

  drawBorder(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!this.currentBorder || this.currentBorder.type === "none") return;
    ctx.save();
    const border = this.currentBorder;
    switch (border.type) {
      case "solid":
        this.drawSolid(ctx, width, height, border);
        break;
      case "gradient":
        this.drawGradient(ctx, width, height, border);
        break;
      case "polaroid":
        this.drawPolaroid(ctx, width, height, border);
        break;
      case "dashed":
        this.drawDashed(ctx, width, height, border);
        break;
    }
    ctx.restore();
  }

  private drawSolid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    b: BorderDef,
  ) {
    if (b.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 5;
    }
    ctx.fillStyle = b.color!;
    ctx.fillRect(0, 0, w, b.width!);
    ctx.fillRect(w - b.width!, 0, b.width!, h);
    ctx.fillRect(0, h - b.width!, w, b.width!);
    ctx.fillRect(0, 0, b.width!, h);
  }

  private drawGradient(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    b: BorderDef,
  ) {
    if (b.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 5;
    }
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    b.colors!.forEach((c, i) =>
      gradient.addColorStop(i / (b.colors!.length - 1), c),
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, b.width!);
    ctx.fillRect(w - b.width!, 0, b.width!, h);
    ctx.fillRect(0, h - b.width!, w, b.width!);
    ctx.fillRect(0, 0, b.width!, h);
  }

  private drawPolaroid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    b: BorderDef,
  ) {
    if (b.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 5;
    }
    ctx.fillStyle = b.color!;
    ctx.fillRect(0, 0, w, b.topWidth!);
    ctx.fillRect(w - b.sideWidth!, 0, b.sideWidth!, h);
    ctx.fillRect(0, h - b.bottomWidth!, w, b.bottomWidth!);
    ctx.fillRect(0, 0, b.sideWidth!, h);
  }

  private drawDashed(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    b: BorderDef,
  ) {
    ctx.strokeStyle = b.color!;
    ctx.lineWidth = b.width!;
    ctx.setLineDash(b.dashPattern ?? [10, 5]);
    const inset = b.width! / 2;
    ctx.strokeRect(inset, inset, w - b.width!, h - b.width!);
    ctx.setLineDash([]);
  }
}
