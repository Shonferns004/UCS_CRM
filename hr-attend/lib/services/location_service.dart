import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import '../config.dart';

/// Resolves the current device location.
///
/// Primary source: the Google Geolocation API, which uses WiFi / cell-tower
/// data and therefore works indoors without needing GPS or a location
/// permission. If that call fails (no network, invalid key, no WiFi), it
/// falls back to the phone's GPS via the geolocator package.
class LocationService {
  static Future<Position?> getCurrentLocation({Duration timeout = const Duration(seconds: 10)}) async {
    final fromApi = await _googleGeolocation(timeout);
    if (fromApi != null) return fromApi;
    return _gpsFallback(timeout);
  }

  static Future<Position?> _googleGeolocation(Duration timeout) async {
    try {
      final uri = Uri.parse(
        'https://www.googleapis.com/geolocation/v1/geolocate?key=${Config.googleGeolocationKey}',
      );
      final res = await http
          .post(uri, headers: {'Content-Type': 'application/json'}, body: '{}')
          .timeout(timeout);
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final loc = data['location'] as Map<String, dynamic>?;
      final lat = (loc?['lat'] as num?)?.toDouble();
      final lng = (loc?['lng'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;
      final accuracy = (data['accuracy'] as num?)?.toDouble() ?? 0;
      return Position(
        latitude: lat,
        longitude: lng,
        timestamp: DateTime.now(),
        accuracy: accuracy,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<Position?> _gpsFallback(Duration timeout) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        final asked = await Geolocator.requestPermission();
        if (asked == LocationPermission.denied ||
            asked == LocationPermission.deniedForever) {
          return null;
        }
      } else if (perm == LocationPermission.deniedForever) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      ).timeout(timeout);
    } catch (_) {
      return null;
    }
  }
}
