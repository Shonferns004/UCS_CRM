import 'package:flutter/material.dart';
import 'package:dropdown_button2/dropdown_button2.dart';
import '../theme/app_palette.dart';
import '../widgets/app_toast.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import '../services/api_service.dart';
import '../main.dart';
import '../utils/responsive.dart';
import '../widgets/skeleton_loader.dart';

class AdvancePage extends StatefulWidget {
  final ScrollController? scrollController;
  const AdvancePage({super.key, this.scrollController});

  @override
  State<AdvancePage> createState() => _AdvancePageState();
}

class _AdvancePageState extends State<AdvancePage> {
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  bool _submitting = false;
  bool _showSuccess = false;
  String _selectedType = 'advance';
  final ValueNotifier<String?> _typeNotifier = ValueNotifier<String?>(
    'advance',
  );

  @override
  void dispose() {
    _amountCtrl.dispose();
    _reasonCtrl.dispose();
    _typeNotifier.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = _amountCtrl.text.trim();
    final reason = _reasonCtrl.text.trim();
    if (amount.isEmpty || reason.isEmpty) {
      AppToast.warning('Fill all fields');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ApiService.applyAdvance(amount, reason, type: _selectedType);
      setState(() => _showSuccess = true);
    } catch (e) {
      if (mounted) {
        AppToast.error(e.toString().replaceFirst('Exception:', '').trim());
      }
    } finally {
      setState(() => _submitting = false);
    }
  }

  void _resetForm() {
    _amountCtrl.clear();
    _reasonCtrl.clear();
    setState(() => _showSuccess = false);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final colors = Theme.of(context).extension<AppColors>()!;

    return Material(
      type: MaterialType.transparency,
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 16),
                vertical: Responsive.pad(context, 8),
              ),
              child: Row(
                children: [
                  Text(
                    'Advance Request',
                    style: tt.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: scheme.primary,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: widget.scrollController,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(
                  Responsive.pad(context, 16),
                  Responsive.pad(context, 8),
                  Responsive.pad(context, 16),
                  Responsive.pad(context, 32),
                ),
                children: [
                  _showSuccess
                      ? _buildSuccess(scheme, tt)
                      : _buildFormContent(scheme, tt, colors),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccess(ColorScheme scheme, TextTheme tt) {
    return Column(
      children: [
        Icon(
          TablerIcons.circle_check,
          size: Responsive.sp(context, 48),
          color: const Color(0xff0f7a5a),
        ),
        SizedBox(height: Responsive.pad(context, 8)),
        Text(
          'Request Submitted',
          style: tt.headlineSmall?.copyWith(color: const Color(0xFF0D5535)),
        ),
        SizedBox(height: Responsive.pad(context, 4)),
        Text(
          'Your ${_selectedType == 'loan' ? 'loan' : 'advance'} request has been sent for approval.',
          style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        SizedBox(height: Responsive.pad(context, 12)),
        OutlinedButton(
          onPressed: _resetForm,
          style: OutlinedButton.styleFrom(
            foregroundColor: scheme.primary,
            side: BorderSide(color: scheme.primary),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
            ),
          ),
          child: const Text('Request another'),
        ),
      ],
    );
  }

  Widget _buildFormContent(ColorScheme scheme, TextTheme tt, AppColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(tt, 'Type *', colors),
        SizedBox(height: Responsive.pad(context, 8)),
        _typeDropdown(scheme, colors),
        SizedBox(height: Responsive.pad(context, 16)),
        _label(tt, 'Request Amount *', colors),
        SizedBox(height: Responsive.pad(context, 8)),
        _amountField(scheme, colors),
        SizedBox(height: Responsive.pad(context, 16)),
        _label(tt, 'Reason *', colors),
        SizedBox(height: Responsive.pad(context, 8)),
        _reasonField(scheme, colors),
        SizedBox(height: Responsive.pad(context, 24)),
        SizedBox(
          width: double.infinity,
          height: Responsive.pad(context, 44),
          child: ElevatedButton(
            onPressed: _submitting ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: scheme.primary,
              foregroundColor: Colors.white,
              elevation: 1,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            child: _submitting
                ? const ButtonSkeleton()
                : Text(
                    'Submit Request',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 14),
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _typeDropdown(ColorScheme scheme, AppColors colors) {
    return Container(
      height: Responsive.pad(context, 54),
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      decoration: BoxDecoration(
        color: AppPalette.iceSoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton2<String>(
          valueListenable: _typeNotifier,
          isExpanded: true,
          style: TextStyle(
            fontSize: Responsive.sp(context, 14),
            fontWeight: FontWeight.w600,
            color: scheme.onSurface,
          ),
          items: const [
            DropdownItem<String>(
              value: 'advance',
              height: 50,
              child: Text('Advance (repay from salary)'),
            ),
            DropdownItem<String>(
              value: 'loan',
              height: 50,
              child: Text('Loan (monthly deduction)'),
            ),
          ],
          onChanged: (v) {
            if (v != null) {
              setState(() {
                _selectedType = v;
                _typeNotifier.value = v;
              });
            }
          },
          iconStyleData: IconStyleData(
            icon: Icon(
              TablerIcons.chevron_down,
              size: Responsive.sp(context, 18),
              color: scheme.onSurfaceVariant,
            ),
            openMenuIcon: Icon(
              TablerIcons.chevron_up,
              size: Responsive.sp(context, 18),
              color: AppPalette.ocean,
            ),
          ),
          dropdownStyleData: DropdownStyleData(
            maxHeight: 240,
            elevation: 8,
            offset: const Offset(0, 6),
            decoration: BoxDecoration(
              color: AppPalette.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: AppPalette.lift(0.8),
            ),
          ),
          menuItemStyleData: MenuItemStyleData(
            padding: EdgeInsets.symmetric(
              horizontal: Responsive.pad(context, 12),
              vertical: 2,
            ),
            overlayColor: const WidgetStatePropertyAll(AppPalette.iceSoft),
            selectedMenuItemBuilder: (context, child) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppPalette.aquaSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: DefaultTextStyle.merge(
                style: const TextStyle(
                  color: AppPalette.ink,
                  fontWeight: FontWeight.w700,
                ),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(TextTheme tt, String text, AppColors colors) {
    final required = text.trimRight().endsWith('*');
    final label = text.replaceAll(RegExp(r'\s*\*$'), '');
    return Text.rich(
      TextSpan(
        style: tt.labelMedium?.copyWith(color: colors.outline),
        children: [
          TextSpan(text: label),
          if (required)
            const TextSpan(
              text: ' *',
              style: TextStyle(
                color: Color(0xFFC0392B),
                fontWeight: FontWeight.w700,
              ),
            ),
        ],
      ),
    );
  }

  Widget _amountField(ColorScheme scheme, AppColors colors) {
    return Container(
      height: Responsive.pad(context, 48),
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      decoration: BoxDecoration(
        color: AppPalette.iceSoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Text(
            '₹ ',
            style: TextStyle(
              fontSize: Responsive.sp(context, 14),
              color: scheme.onSurface,
            ),
          ),
          Expanded(
            child: TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: 'Enter amount',
                filled: false,
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
              style: TextStyle(
                fontSize: Responsive.sp(context, 14),
                color: scheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _reasonField(ColorScheme scheme, AppColors colors) {
    return Container(
      padding: EdgeInsets.all(Responsive.pad(context, 16)),
      decoration: BoxDecoration(
        color: AppPalette.iceSoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: TextField(
        controller: _reasonCtrl,
        maxLines: 4,
        decoration: InputDecoration(
          hintText:
              'Explain why you need ${_selectedType == 'loan' ? 'a loan' : 'an advance'}',
          filled: false,
          border: InputBorder.none,
          isDense: true,
          contentPadding: EdgeInsets.zero,
        ),
        style: TextStyle(
          fontSize: Responsive.sp(context, 14),
          color: scheme.onSurface,
        ),
      ),
    );
  }
}
