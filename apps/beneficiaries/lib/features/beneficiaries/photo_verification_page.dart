import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/photo_utils.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import 'camera_capture_page.dart';

/// Fallback proof-of-collection flow used when a beneficiary's fingerprint
/// cannot be read. The operator confirms the beneficiary, captures a photo and
/// submits it; the photo is stored as a `distribution_proof` document and the
/// returned URL is passed back so the detail page can unlock "kit given".
class PhotoVerificationPage extends StatefulWidget {
  final Map<String, dynamic> beneficiary;

  const PhotoVerificationPage({super.key, required this.beneficiary});

  @override
  State<PhotoVerificationPage> createState() => _PhotoVerificationPageState();
}

class _PhotoVerificationPageState extends State<PhotoVerificationPage> {
  Uint8List? _captured;
  bool _submitting = false;
  String? _error;

  String get _name => widget.beneficiary['full_name']?.toString() ?? 'Beneficiary';
  String get _code => widget.beneficiary['beneficiary_code']?.toString() ?? '';
  String? get _profilePhoto => widget.beneficiary['photo']?.toString();

  Future<void> _capture() async {
    if (_submitting) return;
    final bytes = await Navigator.push<Uint8List>(
      context,
      MaterialPageRoute(
        builder: (_) => const CameraCapturePage(
          hint: 'Frame the beneficiary’s face and capture',
          captureLabel: 'Capture Photo',
        ),
      ),
    );
    if (bytes == null || bytes.isEmpty || !mounted) return;
    setState(() {
      _captured = bytes;
      _error = null;
    });
  }

  Future<void> _submit() async {
    final bytes = _captured;
    final id = widget.beneficiary['id'];
    if (bytes == null || bytes.isEmpty || id == null || _submitting) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final base64 = await compute(photoBase64Jpeg, bytes);
      if (base64.isEmpty) throw Exception('Could not read that photo');

      final result = await ApiService.post(
        '/beneficiaries/$id/photo-verification',
        body: {'file_base64': base64, 'mime_type': 'image/jpeg'},
        timeout: const Duration(minutes: 2),
      );
      if (!mounted) return;
      final url = result['file_url']?.toString();
      if (url == null || url.isEmpty) {
        throw Exception('Photo uploaded, but no proof URL was returned');
      }
      Navigator.pop(context, {'file_url': url});
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
      showAppSnackbar(context, 'Photo submit failed: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasShot = _captured != null;
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          tooltip: 'Back',
          onPressed: _submitting ? null : () => Navigator.maybePop(context),
        ),
        title: const Text('Photo verification'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _beneficiaryCard(),
              const SizedBox(height: 20),
              _photoPreview(hasShot),
              const SizedBox(height: 12),
              if (_error != null) ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.error,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              SizedBox(
                height: 54,
                child: OutlinedButton.icon(
                  onPressed: _submitting ? null : _capture,
                  icon: const Icon(LucideIcons.camera, size: 20),
                  label: Text(hasShot ? 'Retake Photo' : 'Capture Photo'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 54,
                child: FilledButton(
                  onPressed: hasShot && !_submitting ? _submit : null,
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Submit Photo',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Photo is stored as proof of collection. It does not replace the '
                'beneficiary’s profile photo.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _beneficiaryCard() {
    final photo = _profilePhoto;
    final ImageProvider? image = isInlinePhoto(photo)
        ? MemoryImage(dataUrlBytes(photo!))
        : isRemotePhoto(photo)
            ? NetworkImage(photo!)
            : null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: image != null
                ? Image(
                    image: image,
                    width: 56,
                    height: 56,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const PhotoPlaceholder(size: 56),
                  )
                : const PhotoPlaceholder(size: 56),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                if (_code.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    _code,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _photoPreview(bool hasShot) {
    return Container(
      height: 260,
      decoration: BoxDecoration(
        color: AppColors.surfaceSoft,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: hasShot
          ? Image.memory(
              _captured!,
              fit: BoxFit.cover,
              gaplessPlayback: true,
            )
          : Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    LucideIcons.camera,
                    size: 42,
                    color: AppColors.textSecondary.withAlpha(150),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Capture the beneficiary’s photo\nwhen the fingerprint does not work',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
