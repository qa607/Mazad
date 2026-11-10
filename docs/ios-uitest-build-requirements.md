# Mazad iOS UI-test simulator build: requirements

QA needs this build to run the iOS Login and Forgot Password automation safely on the iOS
Simulator. QA checks every request (method, host, path and body) before it leaves the Mac, and
blocks anything unexpected. Nothing here may change production or the regular staging build.

## 1. Build

| Item         | Requirement                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| Platform     | iOS **Simulator**, Apple silicon (**arm64**), runs on **iOS 27**                             |
| Delivery     | Zipped `.app` (for example from `xcodebuild -sdk iphonesimulator -configuration UITest`)     |
| Bundle ID    | Separate ID, for example **`com.motory.dealer.uitest`**                                      |
| Version      | State version and build number (QA allowlists the exact pair)                                |
| Backend      | **Staging only**: `https://stg-mazad-v3-154.motory.dev/`. No production URLs, keys or config |
| Distribution | QA only; never TestFlight/App Store                                                          |

## 2. Network routing (required)

The app must send **all** its HTTP(S) traffic through a proxy given at launch, so QA does not
have to change the Mac's network settings:

- Launch argument: `-MazadUITestProxy 127.0.0.1:<port>` (Appium passes it automatically).
- When present, every `URLSessionConfiguration` the app or its SDKs create must set
  `connectionProxyDictionary` to that host/port for HTTP and HTTPS.
- Any client that cannot be routed (for example an SDK with its own networking) must be
  **turned off** in this build.
- **No HTTP/3 (QUIC)** and no WebSockets in this build.

## 3. HTTPS inspection (required)

- **Certificate pinning off** for every host (URLSession delegates, Alamofire/TrustKit if used,
  third-party SDKs).
- Trust the standard simulator trust store (QA adds a test root CA to the simulator only with
  `xcrun simctl keychain <udid> add-root-cert`); no custom trust evaluation that rejects it.

## 4. Third-party SDKs (preferred)

Turn off analytics/session recording in this build (for example Microsoft Clarity, Adjust,
Firebase Analytics, Crashlytics, Sentry). If any must stay, list its hosts.

## 5. Information to send with the build

1. Version and build number; confirmation it calls only the staging backend.
2. Every host contacted, and the networking libraries/SDKs used.
3. The requests (method + path) made at app start and on Login and Forgot Password as a guest.
4. Whether the installed device build `com.motory.dealer` 8.3 (1491) targets staging or production.

## 6. Isolation

Changes apply only to this UI-test build (own configuration/scheme). Production and the regular
staging build keep their security settings, including pinning.

## QA acceptance (before any automated run)

1. The `.app` installs and launches on an iOS 27 simulator (Apple silicon).
2. Started with `-MazadUITestProxy`, **every** request appears in the QA guard with method, host
   and path, with no TLS or pinning errors, and the backend seen is the staging host only.
3. An unexpected request is blocked before it reaches its destination.
