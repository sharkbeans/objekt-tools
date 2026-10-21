import { ImageResponse } from "next/og";
import { LogoMark } from "@/lib/share-card";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<LogoMark fill="#d8d8d8" size={512} />, size);
}
