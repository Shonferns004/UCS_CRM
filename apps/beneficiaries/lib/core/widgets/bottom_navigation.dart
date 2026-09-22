import 'package:flutter/material.dart';
import '../lucide_icons.dart';
import '../theme/app_colors.dart';

/// Fixed bottom navigation with a raised circular fingerprint action
/// (DESIGN.md sections 15–19).
class BottomNavigation extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onChanged;

  const BottomNavigation({
    super.key,
    required this.currentIndex,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Color(0x0A111827),
            blurRadius: 20,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 70,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              Row(
                children: [
                  _NavItem(
                    icon: LucideIcons.package,
                    selected: currentIndex == 1,
                    onTap: () => onChanged(1),
                  ),
                  const SizedBox(width: 92),
                  _ProfileNavItem(
                    selected: currentIndex == 2,
                    onTap: () => onChanged(2),
                  ),
                ],
              ),
              Positioned(
                top: -30,
                child: GestureDetector(
                  onTap: () => onChanged(0),
                  child: _FingerprintButton(
                    active: currentIndex == 0,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FingerprintButton extends StatelessWidget {
  final bool active;

  const _FingerprintButton({required this.active});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.surface,
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A2563EB),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(5),
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.primaryBlueSoft,
            border: Border.all(
              color: AppColors.primaryBlueSoft,
              width: 6,
            ),
          ),
          child: Icon(
            LucideIcons.fingerprint,
            size: 26,
            color: AppColors.primaryBlue,
          ),
        ),
      ),
    );
  }
}

class _ProfileNavItem extends StatelessWidget {
  final bool selected;
  final VoidCallback onTap;

  const _ProfileNavItem({required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: selected
                  ? AppColors.primaryBlue
                  : AppColors.surfaceSoft,
            ),
            child: Icon(
              LucideIcons.user,
              size: 20,
              color: selected
                  ? Colors.white
                  : AppColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            child: Icon(
              icon,
              size: 27,
              color: selected
                  ? AppColors.primaryBlue
                  : AppColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}