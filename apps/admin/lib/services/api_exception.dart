/// A failure the user can actually understand.
///
/// The admin app expects JSON from every endpoint. When a request lands on a
/// web server instead — stale Backend URL, ngrok interstitial, captive portal,
/// or a route that no longer exists — the body is an HTML page. Decoding that
/// with `jsonDecode` used to surface the cryptic
/// `FormatException: Unexpected character (at character 1) <!DOCTYPE html>`.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}
