import 'package:flutter/widgets.dart';

class Responsive {
  static double width(BuildContext context) => MediaQuery.of(context).size.width;
  static double height(BuildContext context) => MediaQuery.of(context).size.height;

  static bool isSmall(BuildContext context) => width(context) < 360;
  static bool isMedium(BuildContext context) => width(context) >= 360 && width(context) < 600;
  static bool isTablet(BuildContext context) => width(context) >= 600;
  static bool isDesktop(BuildContext context) => width(context) >= 1024;

  static double sp(BuildContext context, double designSize) {
    final w = width(context);
    final scale = (w / 390).clamp(0.7, 1.0);
    return designSize * scale;
  }

  static double pad(BuildContext context, double designPad) {
    final w = width(context);
    final scale = (w / 390).clamp(0.7, 1.0);
    return designPad * scale;
  }

  static double radius(BuildContext context, double designRadius) {
    final w = width(context);
    final scale = (w / 390).clamp(0.7, 1.0);
    return designRadius * scale;
  }
}
