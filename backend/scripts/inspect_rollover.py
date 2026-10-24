p=r'C:\Users\ADMIN\Desktop\Projects\UCS_CRM\backend\src\services\froMonthlyRollover.js'
s=open(p).read()
i=s.find('rollover_from_status = status, rollover_at = now()')
print(repr(s[i-200:i+120]))