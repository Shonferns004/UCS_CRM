export default function Template4({ personal, declarationDate, place }) {
  return (
    <div className="print-page">
      <style>{`
        .t4 *{box-sizing:border-box}
        .t4{width:210mm;min-height:297mm;margin:auto;background:#fff;border:3px solid #222;padding:18mm;font-family:"Times New Roman",serif;page-break-after:always}
        .t4 h1{text-align:center;margin:0;font-size:24pt}
        .t4 .sub{text-align:center;font-size:11pt}
        .t4 .red{height:3px;background:#7b2020;margin:8px 0 14px}
        .t4 .sec{color:#7b2020;font-weight:bold;font-size:15pt;margin-top:14px}
        .t4 .title{text-align:center;color:#1f3f73;font-size:20pt;font-weight:bold;margin:24px 0}
        .t4 p{font-size:11pt;line-height:1.45;text-align:justify;margin:6px 0}
        .t4 .row{display:flex;justify-content:space-between;margin:18px 0}
        .t4 .line{display:inline-block;border-bottom:1px solid #000;min-width:180px;height:18px;padding-left:4px}
        .t4 table{width:100%;border-collapse:collapse;margin:10px 0}
        .t4 th,.t4 td{border:1px solid #444;padding:6px;font-size:10.5pt}
        .t4 th{background:#efefef;text-align:left}
        .t4 .footer{border-top:2px solid #7b2020;margin-top:18px;padding-top:8px;text-align:center;font-size:10pt}
      `}</style>
      <div className="t4">
        <h1>Being Sevak Charitable Trust</h1>
        <div className="red"></div>
        <div className="sub">Public Charitable Trust (Reg.) E-31948 No, Income Tax Exempted Under 80G</div>

        <div className="sec">DECLARATION</div>
        <p>I hereby declare that the statements made in my application form are true, complete and correct to the best of my knowledge and belief. In the event of any information being found false or incorrect at any stage, my services are liable to be terminated without notice.</p>

        <div className="row">
          <div>Date: <span className="line">{declarationDate || ''}</span></div>
          <div>Place: <span className="line">{place || ''}</span></div>
          <div>Sign: <span className="line"></span></div>
        </div>

        <div className="title">JOINING HR RULE COPY</div>

        <div className="sec">1. APPOINTMENT</div>
        <p>You have been hired on a contract basis for six (6) months. You shall report to the designated reporting manager or any person nominated by the Trust.</p>

        <div className="sec">2. REMUNERATION</div>
        <p>Your monthly volunteer expenses will be Rs. (__________). Rs.1000 per month will be deducted for the first two months and refunded after successful completion of the six-month contract, subject to Trust policy.</p>

        <div className="sec">3. PROBATION, CONFIRMATION AND TERMINATION</div>
        <p>You will be on probation for 6 months from the date of joining, extendable by up to 3 months based on performance. During probation, the Trust may terminate the volunteer's services without notice for misconduct or non-performance. Upon successful completion, the appointment will be confirmed.

Note:

Any volunteer terminated within one week of joining due to misconduct or non-performance will not be eligible for salary.</p>

        <div className="sec">4. OFFICE TIME</div>
        <p>Office hours are 10:00 AM–7:00 PM or 9:30 AM–6:30 PM including breaks. Attendance is recorded through the attendance system or manually. Grace period and deductions are as per Trust policy.</p>

        <table>
          <tr><th>Late / Early Exit Duration Per Month</th><th>Deduction in Salary</th></tr>
          <tr><td>Up to 180 minutes</td><td>No deduction</td></tr>
          <tr><td>181–240 minutes</td><td>Half-day deduction</td></tr>
          <tr><td>241–480 minutes</td><td>1 day deduction</td></tr>
          <tr><td>More than 480 minutes</td><td>As per attendance policy</td></tr>
        </table>

        <div className="sec">5. OFFICE ASSETS &amp; COMPANY DEVICES</div>
        <p>All office assets must be handled carefully. Any damage may result in disciplinary action. Devices provided by the Trust are for official use only.</p>

        <div className="sec">6. MOBILE USAGE &amp; WORKPLACE DISCIPLINE</div>
        <p>Personal mobile phones are not permitted during working hours except lunch. Volunteers are expected to maintain professionalism, discipline and proper time management.</p>

        <div className="sec">7. GENERAL RULES &amp; COMMUNICATION</div>
        <p>Volunteers must maintain confidentiality, follow Trust policies, work collaboratively and adhere to deadlines. Violations may result in disciplinary action including termination.</p>

        <div className="footer">
          Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
          Contact: 8879035035 / 8879034034 | E-mail: being.sevak@gmail.com | Website: www.beingsevak.org
        </div>
      </div>
    </div>
  );
}
