# MeterGO Flutter Android app (work in progress)

Splash screen: display the supplied Figma-exported PNG unchanged for 2 seconds, then navigate to a temporary vehicle selection screen.

## Required local asset
Save the approved 880x1912 PNG as `flutter_app/assets/images/splash.png`. The binary image is not included in this commit. Do not run until the asset is added.

## Android scaffolding
The platform-specific Android project has not yet been generated. With a compatible Flutter SDK, run `flutter create --platforms=android .` from `flutter_app`, then `flutter pub get` and `flutter run` on a real Android device.

Offline behavior: the splash screen itself makes no network requests. GPS tracking and offline tariff storage are not implemented yet.
