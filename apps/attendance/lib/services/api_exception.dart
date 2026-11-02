/// How an API call failed — the distinction that decides whether a failed
/// punch is retried later or shown to the worker as a rejection.
///
/// This exists because "the punch did not save" was previously a single
/// undifferentiated `Exception`, which is why a punch against a dead endpoint
/// was indistinguishable from a punch the server had actually rejected.
enum ApiErrorKind {
  /// DNS/socket/timeout, or a 2xx whose body is not JSON. A dead ngrok tunnel
  /// answers 200 with a text interstitial (ERR_NGROK_6024) and a captive portal
  /// answers the same way — in both cases the server never decided anything,
  /// so replaying the request later can succeed.
  network,

  /// 5xx: the server answered and failed. Transient — retrying is safe.
  server,

  /// 4xx carrying a JSON message: the server processed the request and
  /// rejected it ("Already punched in today", "Outside range"). Retrying
  /// cannot succeed, so it must not block the offline queue.
  business,
}

class ApiException implements Exception {
  const ApiException(this.kind, this.message, {this.statusCode});

  final ApiErrorKind kind;
  final String message;
  final int? statusCode;

  bool get isRetryable => kind != ApiErrorKind.business;

  @override
  String toString() => message;
}

/// Single source of truth for "can this be retried later?".
///
/// String matching is deliberate rather than sloppiness: `dart:io` and
/// `package:http` surface SocketException, TimeoutException,
/// HandshakeException and ClientException with no shared supertype, and a
/// dead endpoint additionally produces FormatException from jsonDecode.
bool isRetryableApiError(Object error) {
  if (error is ApiException) return error.isRetryable;

  // FormatException means jsonDecode ran against a non-JSON body — the
  // signature of "HTTP 200, but the answer was an error page".
  if (error is FormatException) return true;

  final s = error.toString();
  return s.contains('SocketException') ||
      s.contains('TimeoutException') ||
      s.contains('Failed host lookup') ||
      s.contains('Connection refused') ||
      s.contains('Connection reset') ||
      s.contains('Connection closed') ||
      s.contains('No route to host') ||
      s.contains('Network is unreachable') ||
      s.contains('HandshakeException') ||
      s.contains('ClientException') ||
      s.contains('timed out');
}
