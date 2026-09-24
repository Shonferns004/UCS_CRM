import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Applies a "scanned document" effect to a captured photo: converts it to
/// grayscale, auto-levels the contrast so the background goes white and the
/// text/ink stays dark, then lightens the white point to look like a real
/// photocopy/scan. Returns a re-encoded JPEG.
Uint8List scanWhiten(Uint8List bytes, {int maxDim = 1600}) {
  img.Image? src;
  try {
    src = img.decodeImage(bytes);
  } catch (_) {
    return bytes;
  }
  if (src == null) return bytes;

  if (src.width > maxDim || src.height > maxDim) {
    final w = src.width >= src.height ? maxDim : null;
    final h = src.width >= src.height ? null : maxDim;
    src = img.copyResize(src, width: w, height: h, interpolation: img.Interpolation.cubic);
  }

  final gray = img.grayscale(src);

  // Auto-levels: stretch the darkest→black and lightest→white.
  img.normalize(gray, min: 0, max: 255);

  // Push shadows down and highlights up for that photocopier look.
  img.adjustColor(
    gray,
    contrast: 1.35,
    brightness: 1.04,
    saturation: 0,
  );

  try {
    return Uint8List.fromList(img.encodeJpg(gray, quality: 82));
  } catch (_) {
    return bytes;
  }
}