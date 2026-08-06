# Connecting Ray-Ban Meta glasses

Honest, step-by-step guide to adding the glasses as a **second capture source**.
Read this before assuming it's plug-and-play — it isn't. It needs a **native dev
build** (not Expo Go) and **Meta developer access**, and it can only be finished
and tested **with the physical glasses + phone in hand**. The phone-camera capture
works today; glasses are additive.

## How it actually works (the architecture)

Apps do **not** run on the glasses. The glasses are a sensor + thin client. Meta's
**Wearables Device Access Toolkit (DAT)** is a **mobile SDK** (iOS Swift / Android
Kotlin) that runs inside *your* phone app and gives it access to the glasses'
point-of-view **camera** and **audio**. Your app pipes that data to *your* backend,
which does all the intelligence.

```
Ray-Ban Meta (camera + mic)  ──BLE/Wi-Fi──▶  Morsel mobile app (holds the DAT session)
                                                   │  photo + spoken note
                                                   ▼
                                          Morsel backend  POST /capture/analyze
                                          (vision extraction + USDA nutrition)
```

Key facts (from Meta's developer docs, Dec 2025 preview):
- The DAT supports **Ray-Ban Meta Gen 1 & Gen 2** (and Optics / Display). Your Gen 1
  non-display glasses expose **camera-in + audio-in + audio-out** (no in-lens display).
- You **run your own models** — Meta AI is not callable through the toolkit. That's
  exactly what we want: the Morsel backend is the model layer.
- It's a **developer preview** → no public app-store distribution yet. Perfect for a
  personal/portfolio build; just build it as a dev/internal app on your own phone.

## Where the app already meets it

The capture abstraction is built for this. The mobile app already has a **"glasses"
capture source** (currently labeled a prototype). Connecting the glasses means:
the glasses source calls a **native module** (below) to grab a photo + audio, then
sends them to the **same** `POST /capture/analyze` the phone camera already uses.
Nothing on the backend changes — it already accepts a photo + note from any source
and tags `source=glasses`.

## Prerequisites

1. A **Meta developer account** and access to the **Wearables Device Access Toolkit
   developer preview** — register at **developer.meta.com/wearables**.
2. Your **Ray-Ban Meta glasses paired** to the **Meta AI companion app** on the same
   phone, updated firmware.
3. A **Mac with Xcode** (for iOS) and/or **Android Studio** (for Android).
4. A **standalone/dev build** of the Morsel app (Expo Go cannot load native
   modules) — see `docs/QUICKSTART.md` §2b.

## Integration steps

This app is Expo **managed**; the DAT is a native SDK, so step 1 moves it to a
prebuild (bare) workflow while keeping all the existing JS/TS.

1. **Generate native projects** (one time):
   ```bash
   cd mobile && npx expo prebuild
   ```
   This creates `ios/` and `android/` you can open in Xcode / Android Studio. All
   current screens keep working.

2. **Add the DAT SDK** to the native project:
   - **iOS**: add the Meta Wearables DAT Swift package (from Meta's developer portal)
     to `ios/` in Xcode; add the camera/microphone/Bluetooth usage strings to
     `Info.plist`.
   - **Android**: add the SDK dependency (see **github.com/facebook/meta-wearables-dat-android**)
     to `android/app/build.gradle`; add the runtime permissions to the manifest.

3. **Write a thin native module** (`GlassesCapture`) exposing to JS:
   - `startSession()` / `stopSession()` — open/close the DAT connection to the glasses.
   - `capturePhoto(): Promise<{ uri }>` — grab a POV still.
   - `captureAudio(): Promise<{ text | uri }>` — grab the spoken note (transcribe on
     device or send audio to the backend to transcribe later).
   Follow Meta's sample app in the DAT docs for the exact session/permission calls
   (`wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit/`).

4. **Wire it into the CaptureSource**: in the mobile Capture screen, when
   `source === 'glasses'`, call `GlassesCapture.capturePhoto()` +
   `captureAudio()` instead of the phone image-picker, then submit the result to the
   existing `analyzeCapture()` API call. The rest of the two-step capture (edit →
   save) is unchanged.

5. **Build & run on device**:
   ```bash
   cd mobile && eas build --profile development --platform ios   # or android
   ```
   Install on your phone, grant camera/mic/Bluetooth permissions, pair the glasses,
   and capture: press to shoot a POV photo + speak the note → it lands in Morsel as a
   `source=glasses` meal.

## Honest effort & caveats

- **This is the one part that genuinely needs the hardware + native work.** Budget a
  focused session with the glasses connected; the native module + session handling is
  where the real work is (a few hundred lines of Swift/Kotlin + the JS bridge).
- The DAT is a **developer preview** — APIs may shift; **confirm the exact SDK
  calls against Meta's live docs** when you build (they supersede this guide).
- Non-display glasses have **no in-lens screen**, so confirmation/feedback is
  audio-only (or on the phone) — fine for "snap a photo of the meal + say what it is".
- Until this is wired, the app is **fully usable with the phone camera**; glasses
  strictly add a hands-free capture path over the same pipeline.

## Sources

- [Introducing the Meta Wearables Device Access Toolkit](https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/)
- [DAT getting-started / setup docs](https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit/)
- [Meta Wearables DAT for Android (GitHub)](https://github.com/facebook/meta-wearables-dat-android)
- [Wearables developer portal](https://wearables.developer.meta.com/)
