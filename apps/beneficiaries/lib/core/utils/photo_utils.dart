import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../theme/app_colors.dart';

/// Downscales a camera frame to a small JPEG data URL. Kept small on purpose:
/// the result is stored inline in the beneficiary's `photo` column and is sent
/// back with every list and detail response.
String photoDataUrl(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return '';
  const longestSide = 480;
  final longest =
      decoded.width > decoded.height ? decoded.width : decoded.height;
  final scale = longest > longestSide ? longestSide / longest : 1.0;
  final resized = img.copyResize(
    decoded,
    width: (decoded.width * scale).round(),
    height: (decoded.height * scale).round(),
  );
  return 'data:image/jpeg;base64,${base64Encode(img.encodeJpg(resized, quality: 80))}';
}

Uint8List dataUrlBytes(String dataUrl) {
  final comma = dataUrl.indexOf(',');
  final b64 = comma == -1 ? dataUrl : dataUrl.substring(comma + 1);
  return base64Decode(b64);
}

/// True when a `photo` value is an inline image we can render directly.
bool isInlinePhoto(String? photo) =>
    photo != null && photo.startsWith('data:image');

/// True when a `photo` value is a remote URL.
bool isRemotePhoto(String? photo) =>
    photo != null && (photo.startsWith('http://') || photo.startsWith('https://'));

/// Small avatar tile used before a photo is attached, and as the fallback when
/// an inline image fails to decode.
class PhotoPlaceholder extends StatelessWidget {
  final double size;

  const PhotoPlaceholder({super.key, this.size = 64});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.primaryBlueSoft,
        borderRadius: BorderRadius.circular(size / 4),
      ),
      alignment: Alignment.center,
      child: Icon(Icons.person_outline, size: size * 0.42, color: AppColors.primaryBlue),
    );
  }
}
