p=r'C:\Users\ADMIN\Desktop\Projects\UCS_CRM\backend\src\controllers\froController.js'
s=open(p).read()

old1 = """    const keepContact = await buildFollowUpOwnerFilter(scopedContacts.map(c => c.fro_assignments).filter(Boolean), req.user);
    const personalContacts = (scopedContacts || []).filter(c => keepContact(c.fro_assignments));"""
new1 = """    const keepContact = await buildFollowUpOwnerFilter(scopedContacts.map(c => c.fro_assignments).filter(Boolean), req.user);
    const monthStart = istMonthBounds(new Date()).month;
    const isCurrentMonthActivity = (a) => {
      const ts = a?.last_contacted_at || a?.updated_at || a?.assigned_at;
      if (!ts) return true;
      return new Date(ts).getTime() >= new Date(monthStart).getTime();
    };
    const personalContacts = (scopedContacts || []).filter(c => keepContact(c.fro_assignments) && isCurrentMonthActivity(c.fro_assignments));"""
assert old1 in s, "old1 not found"
s=s.replace(old1,new1)

old2 = """    const assignments = Object.values(assignmentById);"""
new2 = """    const monthStart = istMonthBounds(new Date()).month;
    const isCurrentMonthActivity = (a) => {
      const ts = a?.last_contacted_at || a?.updated_at || a?.assigned_at;
      if (!ts) return true;
      return new Date(ts).getTime() >= new Date(monthStart).getTime();
    };
    const assignments = Object.values(assignmentById).filter(isCurrentMonthActivity);"""
assert old2 in s, "old2 not found"
s=s.replace(old2,new2)

open(p,'w').write(s)
print('done')