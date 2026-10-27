/**
 * Device Detector Utility
 *
 * Robustly classifies the viewing device into:
 * 1. MOBILE (Handheld PDA / Smartphone):
 *    - Zebra TC26, TC21, and other dedicated handheld barcode terminals
 *    - Mobile smartphones (iPhone, Android phones)
 *    - Action: Shows the dedicated PDA scanner app only.
 *
 * 2. DESKTOP / WORKSTATION / SURFACE:
 *    - Microsoft Surface devices (Surface Pro, Surface Go, Surface Laptop, Surface Book, Surface Studio)
 *    - Laptops, Desktop PCs, MacBooks, iMacs, Chromebooks, Workstations
 *    - Displays with high physical resolutions and desktop operating systems
 *    - Action: Permitted to run the Admin Portal without restriction; offers desktop launchpad on root.
 */

export interface DeviceClassification {
  isMobilePDA: boolean;        // True ONLY for handheld barcode scanners (Zebra TC26) and mobile phones
  isDesktopOrSurface: boolean; // True for Microsoft Surface, laptops, desktops, workstations
  isSurface: boolean;          // True specifically when Microsoft Surface characteristics are identified
  deviceCategory: 'MOBILE' | 'DESKTOP';
  reason: string;
}

/**
 * Returns comprehensive device classification details based on OS, UA,
 * display aspect ratio, screen dimensions, and input capabilities.
 */
export function getDeviceClassification(): DeviceClassification {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isMobilePDA: false,
      isDesktopOrSurface: true,
      isSurface: false,
      deviceCategory: 'DESKTOP',
      reason: 'SSR / Non-browser environment',
    };
  }

  const ua = navigator.userAgent || '';
  const navAny = navigator as unknown as { userAgentData?: { platform?: string; mobile?: boolean } };
  const clientPlatform = navAny.userAgentData?.platform || navigator.platform || '';
  const clientDataMobile = navAny.userAgentData?.mobile;

  const screenW = window.screen?.width || window.innerWidth || 1024;
  const screenH = window.screen?.height || window.innerHeight || 768;
  const dpr = window.devicePixelRatio || 1;

  const shortScreenDim = Math.min(screenW, screenH);
  const longScreenDim = Math.max(screenW, screenH);
  const physicalShortDim = shortScreenDim * dpr;
  const physicalLongDim = longScreenDim * dpr;
  const aspectRatio = longScreenDim / (shortScreenDim || 1);

  // 1. Explicit Zebra TC26 / Handheld Barcode Scanner Detection
  const isZebraOrScanner = /TC26|TC21|TC52|TC57|TC72|TC77|MC33|EDA51|Honeywell|Zebra|Symbol/i.test(ua);
  if (isZebraOrScanner) {
    return {
      isMobilePDA: true,
      isDesktopOrSurface: false,
      isSurface: false,
      deviceCategory: 'MOBILE',
      reason: 'Zebra TC26 / Handheld Barcode Terminal identified via UA',
    };
  }

  // 2. Windows Check (Surface / Laptop / Desktop PC)
  // Microsoft Surface devices run full Windows (Windows 10/11 x64 or ARM64).
  // There are NO active Windows mobile smartphones. Any Windows device is a Laptop, Desktop, or Surface!
  const isWindows = /Windows NT|Windows/i.test(ua) || /Win/i.test(clientPlatform);

  if (isWindows) {
    // Check if this Windows device is a Microsoft Surface
    // Surface hallmarks: 3:2 aspect ratio (~1.50:1), touch-enabled display, or high-DPI touch screen
    const is32AspectRatio = Math.abs(aspectRatio - 1.5) < 0.08;
    const hasTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const isSurface = is32AspectRatio || (hasTouch && physicalLongDim >= 1920);

    return {
      isMobilePDA: false,
      isDesktopOrSurface: true,
      isSurface,
      deviceCategory: 'DESKTOP',
      reason: isSurface
        ? 'Microsoft Surface display detected (Windows, 3:2 aspect ratio or high-res touch)'
        : 'Windows Workstation / Laptop display detected',
    };
  }

  // 3. Apple macOS / Desktop Linux / ChromeOS Check
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !(typeof document !== 'undefined' && 'ontouchend' in document && /iPad/i.test(ua));
  const isLinuxDesktop = /X11|Linux x86_64/i.test(ua) && !/Android/i.test(ua);
  const isChromeOS = /CrOS/i.test(ua);

  if (isMac || isLinuxDesktop || isChromeOS) {
    return {
      isMobilePDA: false,
      isDesktopOrSurface: true,
      isSurface: false,
      deviceCategory: 'DESKTOP',
      reason: isMac ? 'macOS Workstation' : isChromeOS ? 'ChromeOS Laptop' : 'Linux Desktop',
    };
  }

  // 4. Smartphone / Mobile Phone Detection
  // Only classify as mobile if it is an actual phone form-factor (small screen, phone UA)
  const isPhoneUA =
    /iPhone|iPod/i.test(ua) ||
    (/Android/i.test(ua) && (/Mobile/i.test(ua) || clientDataMobile === true)) ||
    /BlackBerry|IEMobile|Opera Mini|webOS/i.test(ua);

  // Screen dimension check: Real phones & Zebra TC26 have short CSS dimension <= 520px
  // (e.g. Zebra TC26 is 360px, iPhone 14 Pro Max is 430px, Galaxy S23 Ultra is 412px)
  const isPhoneSizedScreen = shortScreenDim <= 520;

  if (isPhoneUA && isPhoneSizedScreen) {
    return {
      isMobilePDA: true,
      isDesktopOrSurface: false,
      isSurface: false,
      deviceCategory: 'MOBILE',
      reason: 'Mobile Smartphone form-factor (Phone UA + small viewport)',
    };
  }

  // 5. Tablets (iPad, Android Tablet, large displays)
  // Large screen tablets (e.g. iPad 768px-1024px+, Galaxy Tab 800px-1200px+)
  // When physical resolution is high or short dimension >= 600px, treat as workstation/tablet
  if (shortScreenDim >= 600 || physicalShortDim >= 1200) {
    return {
      isMobilePDA: false,
      isDesktopOrSurface: true,
      isSurface: false,
      deviceCategory: 'DESKTOP',
      reason: 'Tablet / Large Format Display with workstation-class resolution',
    };
  }

  // Default fallback for ambiguous narrow mobile screens
  const isFallbackMobile = shortScreenDim < 600;
  return {
    isMobilePDA: isFallbackMobile,
    isDesktopOrSurface: !isFallbackMobile,
    isSurface: false,
    deviceCategory: isFallbackMobile ? 'MOBILE' : 'DESKTOP',
    reason: isFallbackMobile ? 'Narrow mobile viewport fallback' : 'Standard display fallback',
  };
}

/**
 * Returns true if the device is a mobile device (Zebra TC26, phone).
 * Shows PDA app only.
 */
export function isMobileDevice(): boolean {
  return getDeviceClassification().isMobilePDA;
}

/**
 * Returns true if the device is a laptop, desktop PC, or Microsoft Surface.
 * Permitted to run Admin Portal without restrictions.
 */
export function isDesktopOrSurface(): boolean {
  return getDeviceClassification().isDesktopOrSurface;
}
