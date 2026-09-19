import 'package:local_auth/local_auth.dart';

class PhoneBiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Returns true if the phone has a fingerprint/biometric enrolled.
  static Future<bool> isAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return false;
      final canCheck = await _auth.canCheckBiometrics;
      return canCheck;
    } catch (_) {
      return false;
    }
  }

  static Future<List<BiometricType>> availableBiometrics() async {
    try {
      return await _auth.getAvailableBiometrics();
    } catch (_) {
      return const [];
    }
  }

  /// Shows the system fingerprint/biometric prompt.
  /// NOTE: This only confirms the fingerprint belongs to a user registered on
  /// THIS phone. It does not produce fingerprint image/template data for the
  /// beneficiary. Enrollment via phone only stores a confirmation marker.
  static Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Confirm with your fingerprint on this phone',
        biometricOnly: true,
      );
    } catch (_) {
      return false;
    }
  }
}