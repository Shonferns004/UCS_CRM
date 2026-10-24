p=r'C:\Users\ADMIN\Desktop\Projects\UCS_CRM\backend\src\services\froMonthlyRollover.js'
s=open(p).read()
needle='rowsReset += resetIds.length;'
i=s.find(needle)
print(repr(s[i-260:i+40]))