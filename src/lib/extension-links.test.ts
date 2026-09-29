import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  browserStore,
  EXTENSION_STORE_URLS,
  extensionStoreForBrowser,
} from "@/lib/extension-links";

const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/140.0.0.0`;
const FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0";
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IPHONE = `${SAFARI} Mobile/15E148`;

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const originalFirefoxUrl = EXTENSION_STORE_URLS.firefox;

function browsingWith(userAgent: string) {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent },
    configurable: true,
  });
}

afterEach(() => {
  EXTENSION_STORE_URLS.firefox = originalFirefoxUrl;
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

describe("browserStore", () => {
  it("sends Chromium browsers to the Chrome Web Store", () => {
    browsingWith(CHROME);
    assert.equal(browserStore(), "chrome");
    browsingWith(EDGE);
    assert.equal(browserStore(), "chrome");
  });

  it("sends Firefox to Firefox Add-ons", () => {
    browsingWith(FIREFOX);
    assert.equal(browserStore(), "firefox");
  });

  it("offers nothing to phones or to browsers with no store", () => {
    for (const ua of [ANDROID_CHROME, IPHONE, SAFARI]) {
      browsingWith(ua);
      assert.equal(browserStore(), null, ua);
    }
  });
});

describe("extensionStoreForBrowser", () => {
  it("returns the Chrome listing for Chrome", () => {
    browsingWith(CHROME);
    assert.deepEqual(extensionStoreForBrowser(), {
      store: "chrome",
      url: EXTENSION_STORE_URLS.chrome,
    });
  });

  it("returns nothing for Firefox until its listing is live", () => {
    browsingWith(FIREFOX);
    EXTENSION_STORE_URLS.firefox = null;
    assert.equal(extensionStoreForBrowser(), null);

    EXTENSION_STORE_URLS.firefox =
      "https://addons.mozilla.org/firefox/addon/objekt-match/";
    assert.deepEqual(extensionStoreForBrowser(), {
      store: "firefox",
      url: "https://addons.mozilla.org/firefox/addon/objekt-match/",
    });
  });
});
