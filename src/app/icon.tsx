import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

const fill = "#d8d8d8";

const topShape =
  "M 220.4 92.2 L 409.6 92.2 L 409.6 281.2 L 373.6 317.4 L 184.3 317.4 L 184.3 128.2 Z";

const lowerFrame =
  "M 135.2 204.8 L 307.2 204.8 L 307.2 368.0 L 270.3 409.6 L 102.4 409.6 L 102.4 237.6 Z M 150.8 227.8 L 284.2 227.8 L 284.2 357.0 L 256.8 386.6 L 125.4 386.6 L 125.4 253.2 Z";

export default function Icon() {
  return new ImageResponse(
    <svg
      aria-hidden="true"
      height="512"
      style={{
        display: "block",
      }}
      viewBox="0 0 512 512"
      width="512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={topShape} fill={fill} />
      <path d={lowerFrame} fill={fill} fillRule="evenodd" />
    </svg>,
    size,
  );
}
