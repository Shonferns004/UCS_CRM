import 'package:flutter/widgets.dart';

/// Local shim for lucide_icons 0.257.0. The upstream package extends
/// IconData, which is now a final class in recent Flutter, so it can no
/// longer be compiled. These are plain const IconData using the bundled
/// 'Lucide' font so the package source is never imported/compiled.
class LucideIcons {
  static const IconData alertCircle = IconData(0xf10b, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData alertTriangle = IconData(0xf10d, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData arrowLeft = IconData(0xf14f, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData arrowRight = IconData(0xf155, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData box = IconData(0xf1c1, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData calendar = IconData(0xf1d2, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData camera = IconData(0xf1df, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData check = IconData(0xf1ee, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData checkCircle = IconData(0xf1f0, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronDown = IconData(0xf1f5, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronLeft = IconData(0xf1f9, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronRight = IconData(0xf1fb, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronUp = IconData(0xf1fd, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronsLeft = IconData(0xf201, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData chevronsRight = IconData(0xf203, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData clipboardCheck = IconData(0xf219, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData fingerprint = IconData(0xf2e2, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData flashlight = IconData(0xf2ea, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData flashlightOff = IconData(0xf2eb, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData home = IconData(0xf35e, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData logOut = IconData(0xf3b0, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData mail = IconData(0xf3b4, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData mapPin = IconData(0xf3c0, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData package = IconData(0xf414, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData phone = IconData(0xf440, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData refreshCw = IconData(0xf480, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData scanLine = IconData(0xf4a4, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData search = IconData(0xf4ad, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData user = IconData(0xf564, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData userCheck = IconData(0xf566, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData userCircle = IconData(0xf568, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData userPlus = IconData(0xf56e, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData x = IconData(0xf59e, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
  static const IconData xCircle = IconData(0xf59f, fontFamily: 'Lucide', fontPackage: 'lucide_icons');
}

