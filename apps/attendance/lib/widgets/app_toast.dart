import 'package:flutter/material.dart';
import 'package:sileo/sileo.dart';

import '../theme/app_palette.dart';

/// App-wide toast helpers backed by [Sileo].
///
/// Short messages stay as a compact pill; longer messages morph into a pill +
/// body so nothing gets cropped.
class AppToast {
  AppToast._();

  static const Duration _duration = Duration(seconds: 4);

  static void success(
    String message, {
    String? description,
    String? title,
    Duration? duration,
  }) {
    sileo.success(
      _options(
        message: message,
        fallbackTitle: title ?? 'Success',
        description: description,
        fill: AppPalette.successSoft,
        titleColor: AppPalette.ink,
        descriptionColor: AppPalette.success,
        badgeColor: AppPalette.success,
        duration: duration,
      ),
    );
  }

  static void error(
    String message, {
    String? description,
    String? title,
    Duration? duration,
  }) {
    sileo.error(
      _options(
        message: message,
        fallbackTitle: title ?? 'Something went wrong',
        description: description,
        fill: const Color(0xFFFDEAEA),
        titleColor: const Color(0xFF93000A),
        descriptionColor: const Color(0xFF7F1D1D),
        badgeColor: AppPalette.error,
        duration: duration,
      ),
    );
  }

  static void warning(
    String message, {
    String? description,
    String? title,
    Duration? duration,
  }) {
    sileo.warning(
      _options(
        message: message,
        fallbackTitle: title ?? 'Heads up',
        description: description,
        fill: const Color(0xFFFFF3E0),
        titleColor: const Color(0xFF8A4B08),
        descriptionColor: const Color(0xFF8A4B08),
        badgeColor: const Color(0xFFD97706),
        duration: duration,
      ),
    );
  }

  static void info(
    String message, {
    String? description,
    String? title,
    Duration? duration,
  }) {
    sileo.info(
      _options(
        message: message,
        fallbackTitle: title ?? 'Info',
        description: description,
        fill: AppPalette.white,
        titleColor: AppPalette.ink,
        descriptionColor: AppPalette.muted,
        badgeColor: AppPalette.ocean,
        duration: duration,
      ),
    );
  }

  static String action(
    String message, {
    required String actionLabel,
    required VoidCallback onAction,
    String? description,
    String? title,
    Duration? duration,
  }) {
    return sileo.action(
      _options(
        message: message,
        fallbackTitle: title ?? 'Update available',
        description: description,
        fill: AppPalette.ocean,
        titleColor: AppPalette.white,
        descriptionColor: AppPalette.iceBlue,
        badgeColor: AppPalette.aqua,
        duration: duration,
        button: SileoButton(title: actionLabel, onPressed: onAction),
      ),
    );
  }

  /// Dismisses a toast previously returned by [action] (or any other helper).
  static void dismiss(String id) => sileo.dismiss(id);

  /// Clears all visible toasts.
  static void clear() => sileo.clear();

  static SileoOptions _options({
    required String message,
    required String fallbackTitle,
    required Color fill,
    required Color titleColor,
    required Color descriptionColor,
    required Color badgeColor,
    String? description,
    Duration? duration,
    SileoButton? button,
  }) {
    final short = message.trim();
    final hasDescription = description != null && description.trim().isNotEmpty;
    final isLong = short.length > 40;

    final String heading;
    final String? body;
    if (hasDescription) {
      heading = short;
      body = description;
    } else if (isLong) {
      heading = fallbackTitle;
      body = short;
    } else {
      heading = short;
      body = null;
    }

    return SileoOptions(
      title: heading,
      description: body,
      fill: fill,
      duration: duration ?? _duration,
      button: button,
      styles: SileoStyles(
        title: TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: titleColor,
        ),
        description: TextStyle(
          fontSize: 13,
          height: 1.35,
          fontWeight: FontWeight.w500,
          color: descriptionColor,
        ),
        badgeColor: badgeColor,
      ),
    );
  }
}
