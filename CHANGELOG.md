# Changelog

All notable changes to this project are documented in this file.

## 2.1.0

- feat: SignalK Plugin CI workflow calling the shared `SignalK/signalk-server`
  reusable workflow (Linux x64/arm64, macOS and Windows on Node 22 and 24).
  armv7 (Cerbo GX, QEMU-emulated Node 20) is advisory-only and stays disabled
  on push/PR; it can be enabled per run from the Actions UI.
- fix: `start()` now falls back to the schema defaults when the server passes a
  partial or empty configuration. Previously an unconfigured plugin scheduled
  its AIS poll with a `NaN` interval, which Node clamps to 1 ms.
- feat: `signalk.screenshots` declared in `package.json` and the screenshot
  shipped in the npm tarball so the App Store can show it.
- docs: changelog moved out of `README.md` into this file.

## 2.0.0

- refactor: TypeScript, native fetch, test suite, bug fixes

## 1.5.3

- fix: paths updated

## 1.5.2

- fix: small fixes

## 1.5.1

- fix: atons -> meteo context

## 1.5.0

- feat: atons included

## 1.4.1

- fix: small fixes

## 1.4.0

- fix: fetch to new version

## 1.3.1

- fix: epoch time in milliseconds

## 1.3.0

- fix: new digitraffic api in use

## 1.2.1

- fix: log removed

## 1.2.0

- fix: navStat fields added

## 1.1.1

- fix: current status of the plugin updated

## 1.1.0

- fix: source info added

## 1.0.0

- v1 release

## 0.0.15

- fix: skip data fetching if no location available & location.sensorType

## 0.0.14

- fix: eta & timestamp

## 0.0.13

- fix: ais path

## 0.0.12

- fix: state mapping and dashboard reporting updated

## 0.0.11

- fix: callsignVhf and imo paths

## 0.0.10

- fix

## 0.0.9

- fix: key/value locations aligned with AIS input

## 0.0.8

- fix: fetch error logs to console

## 0.0.7

- fix

## 0.0.6

- all available meta data added

## 0.0.5

- sog calculation corrected

## 0.0.4

- Meta data (AIS names) for target
