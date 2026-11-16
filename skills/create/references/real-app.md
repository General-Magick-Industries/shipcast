# Real-app mode (optional)

Use the **actual running app** instead of recreated screens. More authentic, but it needs the app to
build and run on this machine. **Only do this when the user asks for it or agrees to it** — building can
take minutes and needs the platform toolchain.

## Before you start

- Ask which screens to capture and whether a demo account/demo data exists.
- **Never capture real users' personal data.** Use demo data, or blur/crop it out.
- Hardware-dependent screens (BLE devices, cameras, payments) usually can't run in a simulator —
  recreate those instead.

## Run and capture

| Stack | Run | Screenshot | Record |
|---|---|---|---|
| **iOS Simulator** (Swift, Flutter, React Native, Expo) | Xcode build, `flutter run -d <sim>`, `npx expo run:ios` | `xcrun simctl io booted screenshot shot.png` | `xcrun simctl io booted recordVideo --codec=h264 clip.mp4` (Ctrl-C to stop) |
| **Android emulator** (Kotlin, Flutter, React Native) | `./gradlew installDebug`, `flutter run -d emulator-…`, `npx expo run:android` | `adb exec-out screencap -p > shot.png` | `adb shell screenrecord /sdcard/clip.mp4` then `adb pull /sdcard/clip.mp4` |
| **Web app** | the project's dev server | render the page in a post's `<iframe>` is unreliable — instead screenshot with the user's browser or Playwright if installed | screen-record the browser |

Navigate the app with the platform's tools (`xcrun simctl openurl` for deep links, `adb shell input
tap x y` / `input text`) or ask the user to tap through while you record.

## Use the captures

- Trim and scale recordings: `ffmpeg -ss <start> -t <len> -i clip.mp4 -an -vf scale=-2:1920 assets/clip.mp4`.
- Put screenshots in device frames with `<img>`; recordings with `<video data-start="…">` (motion.md).
- Clean the status bar first on iOS: `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4`.
- Everything else — brief, headlines, brand, review loop — stays the same.
