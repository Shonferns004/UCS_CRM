const XLSX = require('xlsx');
const header = ['Beneficiary Code','Full Name','Mobile','Alternate Mobile','Email','NGO','Gender','Date of Birth','','Occupation','Address','Area','City','District','State','Pincode','Aadhaar Number','Needed','Monthly Family Income','Income Category','Total Family Members','Status','Kit Given','Kit Given On','Kit Given By','Kit Event','Kit','Fingerprint Status','Registration Date','Registered At'];
const row1 = ['BS-002375','Kajal Kumari Ranjeet Kumar Pandey','7045738795','','','BSCT','Female','2012-01-14','','Student','Vasundhara Seva Society, Sanjay Nagar, Kandivali West, Mumbai, Mumbai Suburban, Maharashtra - 400067','','Mumbai','','Maharashtra','400067','374480704620','','','','','ACTIVE','No','','','','REGISTERED','2026-10-17','2026-10-17T12:18:25.066Z'];
const ws = XLSX.utils.aoa_to_sheet([header, row1]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Members');
XLSX.writeFile(wb, 'C:\\Users\\Administrator\\Desktop\\attendance\\UCS_CRM\\tmp_test\\sample.xlsx');
console.log('written');