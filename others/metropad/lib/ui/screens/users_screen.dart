import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/dashboard.dart';
import '../../services/admin_service.dart';
import '../../state/app_state.dart';
import '../widgets/data_table.dart';
import '../widgets/filter_bar.dart';
import '../widgets/modals.dart';
import 'paged_list_screen.dart';

class UsersScreen extends StatelessWidget {
  const UsersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PagedListScreen<AdminUser>(
      slug: 'users',
      title: 'Users',
      subtitle: 'Manage system access',
      filters: [
        const FilterDef(key: 'search', label: 'Users', type: FilterType.search),
      ],
      fetch: (page, limit, filters) async {
        final params = <String, dynamic>{'page': page, 'limit': limit};
        final search = filters['search'];
        if (search != null && search.isNotEmpty) params['search'] = search;
        return UserService.getAll(params: params);
      },
      addLabel: 'Add User',
      canAdd: () => AppState.auth.isAdmin,
      onAdd: (c) => _addUser(c),
      onRowTap: (u) => _actions(context, u),
      columns: () => [
        TableColumn<AdminUser>('Name', cell: (c, u) => cellText(u.name, bold: true)),
        TableColumn<AdminUser>('Email', cell: (c, u) => cellText(u.email)),
        TableColumn<AdminUser>('Role', cell: (c, u) => cellText(formatRole(u.role))),
        TableColumn<AdminUser>(
          'Active',
          cell: (c, u) => cellText(u.isActive ? 'Yes' : 'No',
              color: u.isActive ? AppColors.success : AppColors.danger),
        ),
        TableColumn<AdminUser>('Created', cell: (c, u) => cellText(formatDateStr(u.createdAt))),
      ],
    );
  }

  Future<void> _addUser(BuildContext context) async {
    final name = TextEditingController();
    final email = TextEditingController();
    final password = TextEditingController();
    String role = 'VIEWER';
    await showFormModal(
      context,
      title: 'Add User',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add User',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            FormFieldWrap(label: 'Name', required: true, child: TextField(controller: name)),
            const SizedBox(height: 12),
            FormFieldWrap(label: 'Email', required: true, child: TextField(controller: email)),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Role',
              child: DropdownButtonFormField<String>(
                initialValue: role,
                items: [
                  for (var i = 0; i < AppConstants.roles.length; i++)
                    DropdownMenuItem(
                        value: AppConstants.roles[i],
                        child: Text(AppConstants.roleLabels[i])),
                ],
                onChanged: (v) => setState(() => role = v!),
              ),
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Password',
              child: TextField(
                  controller: password, obscureText: true),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: () async {
                    final msg = await apiRun(context, () async {
                      await UserService.create({
                        'name': name.text.trim(),
                        'email': email.text.trim(),
                        'role': role,
                        'password': password.text,
                      });
                    }, success: 'User created');
                    if (msg == null) {
                      Navigator.pop(ctx);
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _actions(BuildContext context, AdminUser user) async {
    final isAdmin = AppState.auth.isAdmin;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(user.name,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${user.email} · ${formatRole(user.role)}'),
              ),
              const Divider(height: 1),
              if (isAdmin)
                ListTile(
                  leading: const Icon(Icons.visibility_outlined),
                  title: const Text('Edit'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _editUser(context, user);
                  },
                ),
              if (isAdmin)
                ListTile(
                  leading: const Icon(Icons.key_outlined),
                  title: const Text('Reset Password'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _resetPassword(context, user);
                  },
                ),
              if (isAdmin && user.role != 'ADMIN')
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: AppColors.danger),
                  title: const Text('Delete', style: TextStyle(color: AppColors.danger)),
                  onTap: () async {
                    Navigator.pop(ctx);
                    final ok = await showConfirmDialog(
                      context,
                      title: 'Delete User',
                      message: 'Delete ${user.name}?',
                    );
                    if (!ok || !context.mounted) return;
                    final msg = await apiRun(context,
                        () => UserService.remove(user.id),
                        success: 'User deleted');
                    if (msg != null) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _editUser(BuildContext context, AdminUser user) async {
    final name = TextEditingController(text: user.name);
    String role = user.role;
    await showFormModal(
      context,
      title: 'Edit User',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Edit User',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            FormFieldWrap(label: 'Name', child: TextField(controller: name)),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Role',
              child: DropdownButtonFormField<String>(
                initialValue: role,
                items: [
                  for (var i = 0; i < AppConstants.roles.length; i++)
                    DropdownMenuItem(
                        value: AppConstants.roles[i],
                        child: Text(AppConstants.roleLabels[i])),
                ],
                onChanged: (v) => setState(() => role = v!),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: () async {
                    final msg = await apiRun(context, () async {
                      await UserService.update(user.id, {
                        'name': name.text.trim(),
                        'role': role,
                      });
                    }, success: 'User updated');
                    if (msg == null) {
                      Navigator.pop(ctx);
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _resetPassword(BuildContext context, AdminUser user) async {
    final password = TextEditingController();
    await showFormModal(
      context,
      title: 'Reset Password',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Reset Password',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(user.email,
                style: const TextStyle(color: AppColors.textLight, fontSize: 13)),
            const SizedBox(height: 16),
            FormFieldWrap(
              label: 'New Password',
              child: TextField(controller: password, obscureText: true),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: () async {
                    final msg = await apiRun(context, () async {
                      await UserService.resetPassword(user.id, {
                        'password': password.text,
                      });
                    }, success: 'Password reset');
                    if (msg == null) {
                      Navigator.pop(ctx);
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Reset'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}