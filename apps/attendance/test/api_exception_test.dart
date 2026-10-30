import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufs_attendance/services/api_exception.dart';

/// `isRetryableApiError` is the single decision point that decides whether a
/// failed punch is queued for offline replay or shown to the worker as a
/// rejection. The whole "punches are silently dropped" bug lived here, so the
/// cases below are the ones that regressed.
void main() {
  group('ApiException', () {
    test('network and server failures are retryable', () {
      expect(const ApiException(ApiErrorKind.network, 'x').isRetryable, isTrue);
      expect(const ApiException(ApiErrorKind.server, 'x', statusCode: 503).isRetryable, isTrue);
    });

    test('a business rejection is NOT retryable', () {
      final e = const ApiException(ApiErrorKind.business, 'Already punched in today', statusCode: 400);
      expect(e.isRetryable, isFalse);
    });

    test('toString surfaces the server message, not the enum', () {
      expect(const ApiException(ApiErrorKind.business, 'Outside range (250m)').toString(),
          'Outside range (250m)');
    });
  });

  group('isRetryableApiError', () {
    test('FormatException is retryable — the dead-tunnel signature', () {
      // A stopped ngrok tunnel answers HTTP 200 with a text interstitial, so
      // jsonDecode throws FormatException. Previously this fell through to the
      // error branch and the punch was lost instead of queued.
      expect(isRetryableApiError(const FormatException('Unexpected character')), isTrue);
    });

    test('transport failures are retryable', () {
      expect(isRetryableApiError(const SocketException('Connection refused')), isTrue);
      expect(isRetryableApiError(const SocketException('Failed host lookup')), isTrue);
      expect(
        isRetryableApiError(const HandshakeException('certificate verify failed')),
        isTrue,
      );
    });

    test('timeouts are retryable, however they are phrased', () {
      expect(isRetryableApiError(TimeoutException('took too long')), isTrue);
      // The http package reports a deadline as a plain string containing
      // "timed out" rather than as a TimeoutException.
      expect(isRetryableApiError(Exception('Connection timed out')), isTrue);
    });

    test('string-matched SocketException is retryable', () {
      expect(isRetryableApiError(Exception('SocketException: No route to host')), isTrue);
      expect(isRetryableApiError(Exception('Connection reset by peer')), isTrue);
    });

    test('an ApiException keeps its own verdict through the wrapper', () {
      expect(
        isRetryableApiError(const ApiException(ApiErrorKind.business, 'Outside range')),
        isFalse,
      );
      expect(
        isRetryableApiError(const ApiException(ApiErrorKind.server, 'boom', statusCode: 502)),
        isTrue,
      );
    });

    test('an unrecognised error is NOT retryable', () {
      // Conservative on purpose: queueing an error we do not understand could
      // wedge the queue with a punch that will never succeed.
      expect(isRetryableApiError(Exception('Something odd happened')), isFalse);
      expect(isRetryableApiError(StateError('bad state')), isFalse);
    });
  });

  group('the failure this classifier exists to catch', () {
    test('a dead tunnel body is not JSON', () {
      // Verifies the premise: the real interstitial body fails jsonDecode,
      // which is exactly why FormatException must be treated as retryable.
      const ngrokBody = 'You are about to visit audio-diagnoses-ream.ngrok-free.dev'
          ' ERR_NGROK_6024';
      expect(
        () => jsonDecode(ngrokBody),
        throwsA(isA<FormatException>()),
      );
      expect(isRetryableApiError(const FormatException('Unexpected character')), isTrue);
    });
  });
}
