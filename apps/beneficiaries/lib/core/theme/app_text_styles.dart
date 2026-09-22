import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Typography tokens from DESIGN.md.
class AppTextStyles {
  static const TextStyle pageLabel = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: 3,
    color: AppColors.pageLabel,
  );

  static const TextStyle pageTitle = TextStyle(
    fontSize: 30,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
    height: 1.25,
  );

  static const TextStyle pageSubtitle = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
    height: 1.5,
  );

  static const TextStyle sectionTitle = TextStyle(
    fontSize: 21,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  static const TextStyle cardTitle = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );

  static const TextStyle largeStat = TextStyle(
    fontSize: 30,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
    height: 1.2,
  );

  static const TextStyle secondaryStatLabel = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
  );

  static const TextStyle buttonText = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: Colors.white,
  );

  static const TextStyle body = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w400,
    color: AppColors.textPrimary,
    height: 1.5,
  );

  static const TextStyle caption = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
    height: 1.4,
  );
}